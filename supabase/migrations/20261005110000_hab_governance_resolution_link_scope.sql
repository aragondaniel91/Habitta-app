-- Governance sweep: a resolution may only cite an agenda item from its own assembly.
-- The composite condominium foreign key protects tenant ownership, but it does not establish
-- that the agenda item actually belongs to the assembly recording the resolution.

create or replace function public.create_assembly_resolution(
  target_condominium_id uuid,
  target_assembly_id uuid,
  resolution_title text,
  resolution_body text,
  linked_agenda_item_id uuid default null,
  linked_proposal_id uuid default null
)
returns public.assembly_resolutions
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_status public.assembly_status;
  created public.assembly_resolutions;
begin
  if not public.can_manage_governance(target_condominium_id) then
    raise exception 'not authorized to manage assembly resolutions';
  end if;

  select status into current_status from public.assemblies
  where id = target_assembly_id and condominium_id = target_condominium_id;

  if current_status not in ('in_progress', 'completed') then
    raise exception 'resolution requires an active or completed assembly';
  end if;

  if linked_agenda_item_id is not null and not exists (
    select 1
    from public.assembly_agenda_items agenda_item
    where agenda_item.id = linked_agenda_item_id
      and agenda_item.assembly_id = target_assembly_id
      and agenda_item.condominium_id = target_condominium_id
  ) then
    raise exception 'agenda item not found for assembly';
  end if;

  insert into public.assembly_resolutions (
    assembly_id,
    condominium_id,
    agenda_item_id,
    proposal_id,
    title,
    resolution_text,
    adopted_at,
    created_by
  ) values (
    target_assembly_id,
    target_condominium_id,
    linked_agenda_item_id,
    linked_proposal_id,
    trim(resolution_title),
    trim(resolution_body),
    now(),
    auth.uid()
  ) returning * into created;

  insert into public.assembly_events (
    assembly_id, condominium_id, event_type, actor_user_id, metadata
  ) values (
    target_assembly_id,
    target_condominium_id,
    'resolution_created',
    auth.uid(),
    jsonb_build_object('resolution_id', created.id)
  );

  return created;
end;
$$;

revoke execute on function public.create_assembly_resolution(uuid, uuid, text, text, uuid, uuid) from public;
grant execute on function public.create_assembly_resolution(uuid, uuid, text, text, uuid, uuid) to authenticated, service_role;
