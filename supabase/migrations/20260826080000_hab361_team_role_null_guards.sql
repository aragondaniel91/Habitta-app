-- HAB-361: a null administrative role slipped past the membership guards.
--
-- `target_role not in (...)` evaluates to NULL when `target_role` is NULL, so the `if` never fired
-- and the null flowed into the write, surfacing as a raw 23502 constraint error instead of the
-- domain error the client knows how to translate. Both team RPCs that accept a role are fixed the
-- same way. Nothing else about the lifecycle, the permission checks or the last-administrator rule
-- changes.

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
    -- `null not in (...)` is null, not true, so without the explicit null test the guard was
    -- skipped and a null role reached the UPDATE as a raw not-null violation.
    if target_role is null
      or target_role not in ('condominium_admin', 'accountant', 'assistant', 'payment_reviewer')
    then
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


-- ------------------------------------------------------------------ admin invitations

create or replace function public.create_admin_invitation(
  target_condominium_id uuid,
  target_email text,
  target_role text,
  target_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
set row_security = off
as $$
declare
  normalized_email text;
  raw_token text;
  created_invitation public.admin_invitations;
  resolved_expiration timestamptz;
begin
  if auth.uid() is null or not public.can_manage_condominium_structure(target_condominium_id) then
    raise exception 'condominium administrator required';
  end if;

  normalized_email := lower(trim(target_email));
  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'invalid email';
  end if;

  -- Same null trap as the team-member RPC: `null not in (...)` is null, so the guard never fired.
  if target_role is null
    or target_role not in ('condominium_admin', 'accountant', 'assistant', 'payment_reviewer')
  then
    raise exception 'invalid administrative role';
  end if;

  resolved_expiration := coalesce(target_expires_at, now() + interval '7 days');
  if resolved_expiration <= now() + interval '1 hour'
    or resolved_expiration > now() + interval '90 days'
  then
    raise exception 'invalid expiration';
  end if;

  update public.admin_invitations
  set status = 'revoked',
      revoked_at = now()
  where condominium_id = target_condominium_id
    and lower(email) = normalized_email
    and status = 'pending';

  raw_token := encode(gen_random_bytes(32), 'hex');

  insert into public.admin_invitations (
    condominium_id,
    email,
    intended_role,
    token_hash,
    expires_at,
    invited_by
  )
  values (
    target_condominium_id,
    normalized_email,
    target_role::public.condominium_role,
    encode(digest(raw_token, 'sha256'), 'hex'),
    resolved_expiration,
    auth.uid()
  )
  returning * into created_invitation;

  insert into public.admin_invitation_events (
    invitation_id,
    condominium_id,
    event_type,
    actor_user_id,
    metadata
  )
  values (
    created_invitation.id,
    target_condominium_id,
    'created',
    auth.uid(),
    jsonb_build_object('role', target_role, 'email', normalized_email)
  );

  return jsonb_build_object(
    'invitation', to_jsonb(created_invitation),
    'raw_token', raw_token
  );
end;
$$;

revoke execute on function public.create_admin_invitation(uuid, text, text, timestamptz) from public;
grant execute on function public.create_admin_invitation(uuid, text, text, timestamptz) to authenticated;
