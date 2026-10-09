-- HAB-GOVERNANCE-ASSEMBLIES-AGREEMENTS-UX-EDIT-001: controlled corrections for
-- draft/scheduled assemblies and agendas. Every write remains tenant-scoped and
-- requires can_manage_governance; completed, cancelled and in-progress records stay immutable.

alter table public.assembly_events
  drop constraint if exists assembly_events_event_type_check;

alter table public.assembly_events
  add constraint assembly_events_event_type_check check (
    event_type in (
      'created', 'updated', 'agenda_item_added', 'agenda_item_updated',
      'agenda_item_removed', 'agenda_item_reordered', 'scheduled', 'started',
      'attendance_recorded', 'minutes_saved', 'minutes_published',
      'resolution_created', 'resolution_published', 'completed', 'cancelled'
    )
  );

create or replace function public.update_assembly(
  target_condominium_id uuid,
  target_assembly_id uuid,
  expected_version integer,
  assembly_title text,
  assembly_description text,
  assembly_scheduled_at timestamptz,
  assembly_location text default null,
  assembly_voting_basis public.governance_voting_basis default null,
  assembly_quorum_percentage numeric default null
)
returns public.assemblies
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_row public.assemblies;
  updated public.assemblies;
begin
  if not public.can_manage_governance(target_condominium_id) then
    raise exception 'not authorized to manage assemblies';
  end if;

  select * into current_row from public.assemblies
  where id = target_assembly_id and condominium_id = target_condominium_id for update;
  if current_row.id is null then raise exception 'assembly not found'; end if;
  if current_row.version <> expected_version then raise exception 'assembly version conflict'; end if;
  if current_row.status not in ('draft', 'scheduled') then
    raise exception 'assembly is locked for edits after it starts';
  end if;
  if char_length(trim(coalesce(assembly_title, ''))) < 2 then
    raise exception 'assembly title is required';
  end if;
  if current_row.status = 'scheduled' and (
    (assembly_voting_basis is not null and assembly_voting_basis <> current_row.voting_basis)
    or (assembly_quorum_percentage is not null and assembly_quorum_percentage <> current_row.quorum_percentage)
  ) then
    raise exception 'voting basis and quorum are frozen once the assembly is scheduled';
  end if;
  if coalesce(assembly_quorum_percentage, current_row.quorum_percentage) not between 0 and 100 then
    raise exception 'invalid assembly quorum percentage';
  end if;

  update public.assemblies set
    title = trim(assembly_title),
    description = nullif(trim(coalesce(assembly_description, '')), ''),
    scheduled_at = assembly_scheduled_at,
    location = nullif(trim(coalesce(assembly_location, '')), ''),
    voting_basis = coalesce(assembly_voting_basis, current_row.voting_basis),
    quorum_percentage = coalesce(assembly_quorum_percentage, current_row.quorum_percentage),
    version = version + 1, updated_by = auth.uid(), updated_at = now()
  where id = target_assembly_id and condominium_id = target_condominium_id
  returning * into updated;

  insert into public.assembly_events (assembly_id, condominium_id, event_type, actor_user_id, metadata)
  values (target_assembly_id, target_condominium_id, 'updated', auth.uid(),
    jsonb_build_object('from_status', current_row.status));
  return updated;
end;
$$;

create or replace function public.update_assembly_agenda_item(
  target_condominium_id uuid, target_assembly_id uuid, target_agenda_item_id uuid,
  item_title text, item_description text default null
)
returns public.assembly_agenda_items
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare current_status public.assembly_status; updated public.assembly_agenda_items;
begin
  if not public.can_manage_governance(target_condominium_id) then raise exception 'not authorized to manage assembly agenda'; end if;
  select status into current_status from public.assemblies
  where id = target_assembly_id and condominium_id = target_condominium_id for update;
  if current_status is null then raise exception 'assembly not found'; end if;
  if current_status not in ('draft', 'scheduled') then raise exception 'assembly agenda is frozen after the meeting starts'; end if;
  if char_length(trim(coalesce(item_title, ''))) < 2 then raise exception 'agenda item title is required'; end if;
  update public.assembly_agenda_items set title = trim(item_title),
    description = nullif(trim(coalesce(item_description, '')), ''), updated_at = now()
  where id = target_agenda_item_id and assembly_id = target_assembly_id and condominium_id = target_condominium_id
  returning * into updated;
  if updated.id is null then raise exception 'agenda item not found for assembly'; end if;
  insert into public.assembly_events (assembly_id, condominium_id, event_type, actor_user_id, metadata)
  values (target_assembly_id, target_condominium_id, 'agenda_item_updated', auth.uid(), jsonb_build_object('agenda_item_id', target_agenda_item_id));
  return updated;
end;
$$;

create or replace function public.delete_assembly_agenda_item(
  target_condominium_id uuid, target_assembly_id uuid, target_agenda_item_id uuid
)
returns boolean
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare current_status public.assembly_status; removed_order integer; temporary_offset integer;
begin
  if not public.can_manage_governance(target_condominium_id) then raise exception 'not authorized to manage assembly agenda'; end if;
  select status into current_status from public.assemblies
  where id = target_assembly_id and condominium_id = target_condominium_id for update;
  if current_status is null then raise exception 'assembly not found'; end if;
  if current_status not in ('draft', 'scheduled') then raise exception 'assembly agenda is frozen after the meeting starts'; end if;
  delete from public.assembly_agenda_items
  where id = target_agenda_item_id and assembly_id = target_assembly_id and condominium_id = target_condominium_id
  returning sort_order into removed_order;
  if removed_order is null then raise exception 'agenda item not found for assembly'; end if;
  select coalesce(max(sort_order), 0) + 1 into temporary_offset from public.assembly_agenda_items
  where assembly_id = target_assembly_id and condominium_id = target_condominium_id;
  update public.assembly_agenda_items set sort_order = sort_order + temporary_offset
  where assembly_id = target_assembly_id and condominium_id = target_condominium_id and sort_order > removed_order;
  update public.assembly_agenda_items set sort_order = sort_order - temporary_offset - 1
  where assembly_id = target_assembly_id and condominium_id = target_condominium_id and sort_order > temporary_offset;
  insert into public.assembly_events (assembly_id, condominium_id, event_type, actor_user_id, metadata)
  values (target_assembly_id, target_condominium_id, 'agenda_item_removed', auth.uid(), jsonb_build_object('agenda_item_id', target_agenda_item_id));
  return true;
end;
$$;

create or replace function public.move_assembly_agenda_item(
  target_condominium_id uuid, target_assembly_id uuid, target_agenda_item_id uuid, direction text
)
returns setof public.assembly_agenda_items
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare current_status public.assembly_status; current_item public.assembly_agenda_items;
  neighbor_item public.assembly_agenda_items; temporary_order integer;
begin
  if not public.can_manage_governance(target_condominium_id) then raise exception 'not authorized to manage assembly agenda'; end if;
  if direction not in ('up', 'down') then raise exception 'invalid agenda move direction'; end if;
  select status into current_status from public.assemblies
  where id = target_assembly_id and condominium_id = target_condominium_id for update;
  if current_status is null then raise exception 'assembly not found'; end if;
  if current_status not in ('draft', 'scheduled') then raise exception 'assembly agenda is frozen after the meeting starts'; end if;
  select * into current_item from public.assembly_agenda_items
  where id = target_agenda_item_id and assembly_id = target_assembly_id and condominium_id = target_condominium_id;
  if current_item.id is null then raise exception 'agenda item not found for assembly'; end if;
  select * into neighbor_item from public.assembly_agenda_items
  where assembly_id = target_assembly_id and condominium_id = target_condominium_id
    and sort_order = current_item.sort_order + case when direction = 'up' then -1 else 1 end;
  if neighbor_item.id is null then raise exception 'agenda item is already at the edge of the list'; end if;
  select coalesce(max(sort_order), 0) + 1 into temporary_order from public.assembly_agenda_items
  where assembly_id = target_assembly_id and condominium_id = target_condominium_id;
  update public.assembly_agenda_items set sort_order = temporary_order where id = current_item.id;
  update public.assembly_agenda_items set sort_order = current_item.sort_order where id = neighbor_item.id;
  update public.assembly_agenda_items set sort_order = neighbor_item.sort_order where id = current_item.id;
  insert into public.assembly_events (assembly_id, condominium_id, event_type, actor_user_id, metadata)
  values (target_assembly_id, target_condominium_id, 'agenda_item_reordered', auth.uid(), jsonb_build_object('agenda_item_id', target_agenda_item_id, 'direction', direction));
  return query select * from public.assembly_agenda_items
  where assembly_id = target_assembly_id and condominium_id = target_condominium_id order by sort_order, created_at;
end;
$$;

revoke execute on function public.update_assembly(uuid, uuid, integer, text, text, timestamptz, text, public.governance_voting_basis, numeric) from public;
revoke execute on function public.update_assembly_agenda_item(uuid, uuid, uuid, text, text) from public;
revoke execute on function public.delete_assembly_agenda_item(uuid, uuid, uuid) from public;
revoke execute on function public.move_assembly_agenda_item(uuid, uuid, uuid, text) from public;
grant execute on function public.update_assembly(uuid, uuid, integer, text, text, timestamptz, text, public.governance_voting_basis, numeric) to authenticated, service_role;
grant execute on function public.update_assembly_agenda_item(uuid, uuid, uuid, text, text) to authenticated, service_role;
grant execute on function public.delete_assembly_agenda_item(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.move_assembly_agenda_item(uuid, uuid, uuid, text) to authenticated, service_role;
