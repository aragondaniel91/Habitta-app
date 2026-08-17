-- HAB-196: traceable assembly action items linked to existing operational domains.

create type public.assembly_action_item_status as enum (
  'open',
  'in_progress',
  'completed',
  'cancelled'
);

create table public.assembly_action_items (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  assembly_id uuid not null,
  resolution_id uuid,
  service_request_id uuid,
  maintenance_work_order_id uuid,
  title text not null check (char_length(trim(title)) between 3 and 180),
  description text check (description is null or char_length(trim(description)) between 3 and 4000),
  assigned_to_user_id uuid references auth.users(id),
  due_on date,
  status public.assembly_action_item_status not null default 'open',
  completed_at timestamptz,
  completed_by uuid references auth.users(id),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id),
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, condominium_id),
  foreign key (assembly_id, condominium_id)
    references public.assemblies(id, condominium_id),
  foreign key (resolution_id, condominium_id)
    references public.assembly_resolutions(id, condominium_id),
  foreign key (service_request_id, condominium_id)
    references public.service_requests(id, condominium_id),
  foreign key (maintenance_work_order_id, condominium_id)
    references public.maintenance_work_orders(id, condominium_id),
  check (
    (status = 'completed' and completed_at is not null and completed_by is not null
      and cancelled_at is null and cancelled_by is null)
    or (status = 'cancelled' and cancelled_at is not null and cancelled_by is not null
      and completed_at is null and completed_by is null)
    or (status in ('open', 'in_progress')
      and completed_at is null and completed_by is null
      and cancelled_at is null and cancelled_by is null)
  )
);

create index assembly_action_items_assembly_idx
  on public.assembly_action_items (assembly_id, status, due_on, created_at);
create index assembly_action_items_assignee_idx
  on public.assembly_action_items (condominium_id, assigned_to_user_id, status, due_on)
  where assigned_to_user_id is not null;
create index assembly_action_items_resolution_idx
  on public.assembly_action_items (resolution_id)
  where resolution_id is not null;
create index assembly_action_items_request_idx
  on public.assembly_action_items (service_request_id)
  where service_request_id is not null;
create index assembly_action_items_work_order_idx
  on public.assembly_action_items (maintenance_work_order_id)
  where maintenance_work_order_id is not null;

create table public.assembly_action_item_events (
  id uuid primary key default gen_random_uuid(),
  action_item_id uuid not null,
  condominium_id uuid not null,
  assembly_id uuid not null,
  event_type text not null check (
    event_type in ('created', 'updated', 'status_changed', 'completed', 'cancelled')
  ),
  actor_user_id uuid references auth.users(id),
  from_value jsonb,
  to_value jsonb,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now(),
  foreign key (action_item_id, condominium_id)
    references public.assembly_action_items(id, condominium_id),
  foreign key (assembly_id, condominium_id)
    references public.assemblies(id, condominium_id)
);

create index assembly_action_item_events_item_idx
  on public.assembly_action_item_events (action_item_id, occurred_at, id);

create function public.is_valid_assembly_action_assignee(
  target_condominium uuid,
  target_user uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.condominiums c
    join public.organization_memberships om
      on om.organization_id = c.organization_id
    where c.id = target_condominium
      and om.user_id = target_user
      and om.role = 'organization_owner'
  ) or exists (
    select 1
    from public.condominium_memberships cm
    where cm.condominium_id = target_condominium
      and cm.user_id = target_user
      and cm.role in ('condominium_admin', 'assistant', 'accountant', 'board_member')
  );
$$;

create function public.assembly_action_transition_allowed(
  current_status public.assembly_action_item_status,
  next_status public.assembly_action_item_status
)
returns boolean
language sql
immutable
as $$
  select current_status = next_status or case current_status
    when 'open' then next_status in ('in_progress', 'completed', 'cancelled')
    when 'in_progress' then next_status in ('open', 'completed', 'cancelled')
    when 'completed' then false
    when 'cancelled' then false
  end;
$$;

revoke execute on function public.is_valid_assembly_action_assignee(uuid, uuid) from public;
revoke execute on function public.assembly_action_transition_allowed(
  public.assembly_action_item_status,
  public.assembly_action_item_status
) from public;
grant execute on function public.is_valid_assembly_action_assignee(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.assembly_action_transition_allowed(
  public.assembly_action_item_status,
  public.assembly_action_item_status
) to authenticated, service_role;

alter table public.assembly_action_items enable row level security;
alter table public.assembly_action_item_events enable row level security;

create policy assembly_action_items_read on public.assembly_action_items
for select using (public.can_read_governance(condominium_id));

create policy assembly_action_item_events_manage_read on public.assembly_action_item_events
for select using (public.can_manage_governance(condominium_id));

revoke insert, update, delete on public.assembly_action_items from authenticated;
revoke insert, update, delete on public.assembly_action_item_events from authenticated;
grant select on public.assembly_action_items to authenticated;
grant select on public.assembly_action_item_events to authenticated;

create function public.assert_assembly_action_event_append_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'assembly action item events are append-only';
end;
$$;

revoke all on function public.assert_assembly_action_event_append_only()
  from public, anon, authenticated, service_role;

create trigger assembly_action_item_events_append_only
before update or delete on public.assembly_action_item_events
for each row execute function public.assert_assembly_action_event_append_only();

create function public.assert_assembly_action_item_no_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'assembly action item history cannot be deleted';
end;
$$;

revoke all on function public.assert_assembly_action_item_no_delete()
  from public, anon, authenticated, service_role;

create trigger assembly_action_items_no_delete
before delete on public.assembly_action_items
for each row execute function public.assert_assembly_action_item_no_delete();

create function public.create_assembly_action_item(
  target_condominium uuid,
  target_assembly uuid,
  item_title text,
  item_description text default null,
  target_resolution uuid default null,
  target_assignee uuid default null,
  target_due_on date default null,
  target_service_request uuid default null,
  target_work_order uuid default null
)
returns public.assembly_action_items
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  created public.assembly_action_items;
  assembly_state public.assembly_status;
begin
  if not public.can_manage_governance(target_condominium) then
    raise exception 'not authorized to manage assembly action items';
  end if;

  select status into assembly_state
  from public.assemblies
  where id = target_assembly and condominium_id = target_condominium;

  if assembly_state is null then
    raise exception 'assembly not found';
  end if;
  if assembly_state not in ('in_progress', 'completed') then
    raise exception 'action items require an in-progress or completed assembly';
  end if;
  if char_length(trim(coalesce(item_title, ''))) < 3 then
    raise exception 'action item title is required';
  end if;

  if target_resolution is not null and not exists (
    select 1
    from public.assembly_resolutions r
    where r.id = target_resolution
      and r.condominium_id = target_condominium
      and r.assembly_id = target_assembly
      and r.published_at is not null
  ) then
    raise exception 'published resolution required';
  end if;

  if target_assignee is not null
     and not public.is_valid_assembly_action_assignee(target_condominium, target_assignee) then
    raise exception 'invalid action item assignee';
  end if;

  if target_service_request is not null and not exists (
    select 1 from public.service_requests r
    where r.id = target_service_request and r.condominium_id = target_condominium
  ) then
    raise exception 'service request not found in condominium';
  end if;

  if target_work_order is not null and not exists (
    select 1 from public.maintenance_work_orders w
    where w.id = target_work_order and w.condominium_id = target_condominium
  ) then
    raise exception 'maintenance work order not found in condominium';
  end if;

  insert into public.assembly_action_items (
    condominium_id,
    assembly_id,
    resolution_id,
    service_request_id,
    maintenance_work_order_id,
    title,
    description,
    assigned_to_user_id,
    due_on,
    created_by,
    updated_by
  ) values (
    target_condominium,
    target_assembly,
    target_resolution,
    target_service_request,
    target_work_order,
    trim(item_title),
    nullif(trim(coalesce(item_description, '')), ''),
    target_assignee,
    target_due_on,
    auth.uid(),
    auth.uid()
  ) returning * into created;

  insert into public.assembly_action_item_events (
    action_item_id, condominium_id, assembly_id, event_type, actor_user_id, to_value
  ) values (
    created.id,
    target_condominium,
    target_assembly,
    'created',
    auth.uid(),
    to_jsonb(created)
  );

  return created;
end;
$$;

create function public.update_assembly_action_item(
  target_condominium uuid,
  target_action_item uuid,
  expected_version integer,
  item_title text,
  item_description text,
  target_assignee uuid,
  target_due_on date,
  target_service_request uuid,
  target_work_order uuid
)
returns public.assembly_action_items
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  existing public.assembly_action_items;
  updated public.assembly_action_items;
begin
  if not public.can_manage_governance(target_condominium) then
    raise exception 'not authorized to manage assembly action items';
  end if;

  select * into existing
  from public.assembly_action_items
  where id = target_action_item and condominium_id = target_condominium
  for update;

  if existing.id is null then
    raise exception 'action item not found';
  end if;
  if existing.version <> expected_version then
    raise exception 'action item version conflict';
  end if;
  if existing.status in ('completed', 'cancelled') then
    raise exception 'finalized action item is immutable';
  end if;
  if char_length(trim(coalesce(item_title, ''))) < 3 then
    raise exception 'action item title is required';
  end if;
  if target_assignee is not null
     and not public.is_valid_assembly_action_assignee(target_condominium, target_assignee) then
    raise exception 'invalid action item assignee';
  end if;
  if target_service_request is not null and not exists (
    select 1 from public.service_requests r
    where r.id = target_service_request and r.condominium_id = target_condominium
  ) then
    raise exception 'service request not found in condominium';
  end if;
  if target_work_order is not null and not exists (
    select 1 from public.maintenance_work_orders w
    where w.id = target_work_order and w.condominium_id = target_condominium
  ) then
    raise exception 'maintenance work order not found in condominium';
  end if;

  update public.assembly_action_items
  set title = trim(item_title),
      description = nullif(trim(coalesce(item_description, '')), ''),
      assigned_to_user_id = target_assignee,
      due_on = target_due_on,
      service_request_id = target_service_request,
      maintenance_work_order_id = target_work_order,
      version = version + 1,
      updated_by = auth.uid(),
      updated_at = now()
  where id = target_action_item and condominium_id = target_condominium
  returning * into updated;

  insert into public.assembly_action_item_events (
    action_item_id, condominium_id, assembly_id, event_type, actor_user_id, from_value, to_value
  ) values (
    updated.id,
    target_condominium,
    updated.assembly_id,
    'updated',
    auth.uid(),
    to_jsonb(existing),
    to_jsonb(updated)
  );

  return updated;
end;
$$;

create function public.transition_assembly_action_item(
  target_condominium uuid,
  target_action_item uuid,
  expected_version integer,
  next_status public.assembly_action_item_status
)
returns public.assembly_action_items
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  existing public.assembly_action_items;
  updated public.assembly_action_items;
  event_name text;
begin
  if not public.can_manage_governance(target_condominium) then
    raise exception 'not authorized to manage assembly action items';
  end if;

  select * into existing
  from public.assembly_action_items
  where id = target_action_item and condominium_id = target_condominium
  for update;

  if existing.id is null then
    raise exception 'action item not found';
  end if;
  if existing.version <> expected_version then
    raise exception 'action item version conflict';
  end if;
  if not public.assembly_action_transition_allowed(existing.status, next_status) then
    raise exception 'invalid action item status transition';
  end if;

  update public.assembly_action_items
  set status = next_status,
      completed_at = case when next_status = 'completed' then now() else null end,
      completed_by = case when next_status = 'completed' then auth.uid() else null end,
      cancelled_at = case when next_status = 'cancelled' then now() else null end,
      cancelled_by = case when next_status = 'cancelled' then auth.uid() else null end,
      version = version + case when next_status = existing.status then 0 else 1 end,
      updated_by = auth.uid(),
      updated_at = case when next_status = existing.status then updated_at else now() end
  where id = target_action_item and condominium_id = target_condominium
  returning * into updated;

  if next_status <> existing.status then
    event_name := case next_status
      when 'completed' then 'completed'
      when 'cancelled' then 'cancelled'
      else 'status_changed'
    end;

    insert into public.assembly_action_item_events (
      action_item_id, condominium_id, assembly_id, event_type, actor_user_id, from_value, to_value
    ) values (
      updated.id,
      target_condominium,
      updated.assembly_id,
      event_name,
      auth.uid(),
      jsonb_build_object('status', existing.status, 'version', existing.version),
      jsonb_build_object('status', updated.status, 'version', updated.version)
    );
  end if;

  return updated;
end;
$$;

revoke execute on function public.create_assembly_action_item(
  uuid, uuid, text, text, uuid, uuid, date, uuid, uuid
) from public;
revoke execute on function public.update_assembly_action_item(
  uuid, uuid, integer, text, text, uuid, date, uuid, uuid
) from public;
revoke execute on function public.transition_assembly_action_item(
  uuid, uuid, integer, public.assembly_action_item_status
) from public;

grant execute on function public.create_assembly_action_item(
  uuid, uuid, text, text, uuid, uuid, date, uuid, uuid
) to authenticated;
grant execute on function public.update_assembly_action_item(
  uuid, uuid, integer, text, text, uuid, date, uuid, uuid
) to authenticated;
grant execute on function public.transition_assembly_action_item(
  uuid, uuid, integer, public.assembly_action_item_status
) to authenticated;
