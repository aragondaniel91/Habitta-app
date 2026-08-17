-- HAB-196: authoritative, governance-scoped assignee read models for assembly action items.
-- Candidate enumeration stays management-only. Read-only viewers only receive identities already
-- referenced by action items they are authorized to read.

create function public.list_assembly_action_assignees(target_condominium uuid)
returns table (
  user_id uuid,
  email text,
  full_name text,
  role text
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if auth.uid() is null or not public.can_manage_governance(target_condominium) then
    raise exception 'not authorized to list assembly action assignees';
  end if;

  return query
  with candidates as (
    select
      cm.user_id,
      cm.role::text as role,
      case cm.role
        when 'condominium_admin' then 1
        when 'accountant' then 2
        when 'assistant' then 3
        when 'board_member' then 4
        else 9
      end as role_priority
    from public.condominium_memberships cm
    where cm.condominium_id = target_condominium
      and cm.role in ('condominium_admin', 'accountant', 'assistant', 'board_member')

    union all

    select
      om.user_id,
      'organization_owner'::text as role,
      5 as role_priority
    from public.condominiums c
    join public.organization_memberships om
      on om.organization_id = c.organization_id
    where c.id = target_condominium
      and om.role = 'organization_owner'
  ),
  ranked as (
    select
      candidates.user_id,
      candidates.role,
      row_number() over (
        partition by candidates.user_id
        order by candidates.role_priority, candidates.role
      ) as candidate_rank
    from candidates
    where public.is_valid_assembly_action_assignee(target_condominium, candidates.user_id)
  )
  select
    ranked.user_id,
    au.email::text,
    nullif(trim(coalesce(au.raw_user_meta_data ->> 'full_name', '')), '')::text,
    ranked.role
  from ranked
  join auth.users au on au.id = ranked.user_id
  where ranked.candidate_rank = 1
  order by
    lower(coalesce(nullif(trim(coalesce(au.raw_user_meta_data ->> 'full_name', '')), ''), au.email, '')),
    ranked.user_id;
end;
$$;

create function public.list_assembly_action_item_assignee_labels(target_condominium uuid)
returns table (
  user_id uuid,
  display_name text
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if auth.uid() is null or not public.can_read_governance(target_condominium) then
    raise exception 'not authorized to list assembly action item assignee labels';
  end if;

  return query
  select distinct
    ai.assigned_to_user_id as user_id,
    coalesce(
      nullif(trim(coalesce(au.raw_user_meta_data ->> 'full_name', '')), ''),
      nullif(trim(coalesce(au.email, '')), ''),
      'Responsable'
    )::text as display_name
  from public.assembly_action_items ai
  join auth.users au on au.id = ai.assigned_to_user_id
  where ai.condominium_id = target_condominium
    and ai.assigned_to_user_id is not null
  order by display_name, user_id;
end;
$$;

revoke execute on function public.list_assembly_action_assignees(uuid) from public;
revoke execute on function public.list_assembly_action_item_assignee_labels(uuid) from public;
grant execute on function public.list_assembly_action_assignees(uuid) to authenticated, service_role;
grant execute on function public.list_assembly_action_item_assignee_labels(uuid) to authenticated, service_role;
