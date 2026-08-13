-- HAB-167: CURRENT_ROLE is a PostgreSQL keyword returning type name.
-- Use membership_role so lifecycle comparisons stay on condominium_role.
create or replace function public.manage_condominium_team_member(
  target_condominium_id uuid,
  target_user_id uuid,
  target_action text,
  target_role text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_membership_id uuid;
  membership_role public.condominium_role;
  stored_state public.condominium_team_access_states;
  resolved_role public.condominium_role;
  admin_count bigint;
begin
  if auth.uid() is null or not public.can_manage_condominium_structure(target_condominium_id) then
    raise exception 'condominium administrator required';
  end if;

  perform 1 from public.condominiums where id = target_condominium_id for update;
  if not found then raise exception 'condominium not found'; end if;

  select cm.id, cm.role into current_membership_id, membership_role
  from public.condominium_memberships cm
  where cm.condominium_id = target_condominium_id
    and cm.user_id = target_user_id
    and cm.role in ('condominium_admin', 'accountant', 'assistant', 'payment_reviewer')
  for update;

  select * into stored_state
  from public.condominium_team_access_states s
  where s.condominium_id = target_condominium_id and s.user_id = target_user_id
  for update;

  if target_action = 'change_role' then
    if current_membership_id is null then raise exception 'active team member required'; end if;
    if target_role not in ('condominium_admin', 'accountant', 'assistant', 'payment_reviewer') then
      raise exception 'invalid administrative role';
    end if;
    resolved_role := target_role::public.condominium_role;
    if resolved_role = membership_role then
      return jsonb_build_object('status', 'active', 'role', membership_role, 'changed', false);
    end if;
    if membership_role = 'condominium_admin' and resolved_role <> 'condominium_admin' then
      select count(*) into admin_count from public.condominium_memberships
      where condominium_id = target_condominium_id and role = 'condominium_admin';
      if admin_count <= 1 then raise exception 'last condominium administrator required'; end if;
    end if;
    update public.condominium_memberships set role = resolved_role, updated_at = now()
    where id = current_membership_id;
    insert into public.condominium_team_access_events
      (condominium_id, user_id, event_type, from_role, to_role, actor_user_id)
    values (target_condominium_id, target_user_id, 'role_changed', membership_role, resolved_role, auth.uid());

  elsif target_action = 'suspend' then
    if current_membership_id is null then raise exception 'active team member required'; end if;
    if membership_role = 'condominium_admin' then
      select count(*) into admin_count from public.condominium_memberships
      where condominium_id = target_condominium_id and role = 'condominium_admin';
      if admin_count <= 1 then raise exception 'last condominium administrator required'; end if;
    end if;
    update public.condominium_team_access_states
    set role = membership_role, status = 'suspended', changed_at = now(), changed_by = auth.uid(),
        suspended_at = now(), removed_at = null
    where condominium_id = target_condominium_id and user_id = target_user_id;
    delete from public.condominium_memberships where id = current_membership_id;
    insert into public.condominium_team_access_events
      (condominium_id, user_id, event_type, from_role, actor_user_id)
    values (target_condominium_id, target_user_id, 'suspended', membership_role, auth.uid());

  elsif target_action = 'reactivate' then
    if current_membership_id is not null then raise exception 'team member already active'; end if;
    if stored_state.user_id is null or stored_state.status <> 'suspended' then
      raise exception 'suspended team member required';
    end if;
    resolved_role := stored_state.role;
    if target_role is not null then
      if target_role not in ('condominium_admin', 'accountant', 'assistant', 'payment_reviewer') then
        raise exception 'invalid administrative role';
      end if;
      resolved_role := target_role::public.condominium_role;
    end if;
    insert into public.condominium_memberships (condominium_id, user_id, role)
    values (target_condominium_id, target_user_id, resolved_role);
    update public.condominium_team_access_states
    set role = resolved_role, status = 'active', changed_at = now(), changed_by = auth.uid(),
        suspended_at = null, removed_at = null
    where condominium_id = target_condominium_id and user_id = target_user_id;
    insert into public.condominium_team_access_events
      (condominium_id, user_id, event_type, from_role, to_role, actor_user_id)
    values (target_condominium_id, target_user_id, 'reactivated', stored_state.role, resolved_role, auth.uid());

  elsif target_action = 'remove' then
    if current_membership_id is null and (stored_state.user_id is null or stored_state.status = 'removed') then
      raise exception 'team member not found';
    end if;
    if current_membership_id is not null and membership_role = 'condominium_admin' then
      select count(*) into admin_count from public.condominium_memberships
      where condominium_id = target_condominium_id and role = 'condominium_admin';
      if admin_count <= 1 then raise exception 'last condominium administrator required'; end if;
    end if;
    resolved_role := coalesce(membership_role, stored_state.role);
    update public.condominium_team_access_states
    set role = resolved_role, status = 'removed', changed_at = now(), changed_by = auth.uid(), removed_at = now()
    where condominium_id = target_condominium_id and user_id = target_user_id;
    if current_membership_id is not null then
      delete from public.condominium_memberships where id = current_membership_id;
    end if;
    insert into public.condominium_team_access_events
      (condominium_id, user_id, event_type, from_role, actor_user_id)
    values (target_condominium_id, target_user_id, 'removed', resolved_role, auth.uid());
  else
    raise exception 'invalid team action';
  end if;

  select * into stored_state from public.condominium_team_access_states s
  where s.condominium_id = target_condominium_id and s.user_id = target_user_id;

  return jsonb_build_object(
    'user_id', stored_state.user_id,
    'role', stored_state.role,
    'status', stored_state.status,
    'changed_at', stored_state.changed_at,
    'changed', true
  );
end;
$$;

revoke execute on function public.manage_condominium_team_member(uuid, uuid, text, text) from public;
grant execute on function public.manage_condominium_team_member(uuid, uuid, text, text) to authenticated;
