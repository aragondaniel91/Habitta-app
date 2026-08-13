-- HAB-167: secure post-invitation administrator lifecycle management.
-- condominium_memberships remains the source of truth for ACTIVE access only.

create table public.condominium_team_access_states (
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.condominium_role not null,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'removed')),
  first_joined_at timestamptz not null default now(),
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id) on delete set null,
  suspended_at timestamptz,
  removed_at timestamptz,
  primary key (condominium_id, user_id),
  check (role in ('condominium_admin', 'accountant', 'assistant', 'payment_reviewer'))
);

create table public.condominium_team_access_events (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null
    check (event_type in ('role_changed', 'suspended', 'reactivated', 'removed')),
  from_role public.condominium_role,
  to_role public.condominium_role,
  actor_user_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index condominium_team_access_events_condominium_idx
  on public.condominium_team_access_events (condominium_id, occurred_at desc);

alter table public.condominium_team_access_states enable row level security;
alter table public.condominium_team_access_events enable row level security;

create policy condominium_team_access_states_read
on public.condominium_team_access_states
for select
using (public.can_manage_condominium_structure(condominium_id));

create policy condominium_team_access_events_read
on public.condominium_team_access_events
for select
using (public.can_manage_condominium_structure(condominium_id));

-- Lifecycle tables are read-only to application roles. Security-definer RPCs own writes.
revoke insert, update, delete on public.condominium_team_access_states from anon, authenticated;
revoke insert, update, delete on public.condominium_team_access_events from anon, authenticated;
grant select on public.condominium_team_access_states to authenticated;
grant select on public.condominium_team_access_events to authenticated;

-- Existing production data is clean; enforce one administrative role per user/condominium.
create unique index condominium_memberships_one_administrative_role
  on public.condominium_memberships (condominium_id, user_id)
  where role in ('condominium_admin', 'accountant', 'assistant', 'payment_reviewer');

insert into public.condominium_team_access_states (
  condominium_id,
  user_id,
  role,
  status,
  first_joined_at,
  changed_at
)
select
  cm.condominium_id,
  cm.user_id,
  cm.role,
  'active',
  cm.created_at,
  cm.updated_at
from public.condominium_memberships cm
where cm.role in ('condominium_admin', 'accountant', 'assistant', 'payment_reviewer')
on conflict (condominium_id, user_id) do nothing;

create or replace function public.sync_condominium_team_state_from_membership()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if tg_op in ('INSERT', 'UPDATE')
    and new.role in ('condominium_admin', 'accountant', 'assistant', 'payment_reviewer')
  then
    insert into public.condominium_team_access_states (
      condominium_id,
      user_id,
      role,
      status,
      first_joined_at,
      changed_at,
      changed_by,
      suspended_at,
      removed_at
    )
    values (
      new.condominium_id,
      new.user_id,
      new.role,
      'active',
      new.created_at,
      now(),
      auth.uid(),
      null,
      null
    )
    on conflict (condominium_id, user_id) do update
    set role = excluded.role,
        status = 'active',
        changed_at = now(),
        changed_by = auth.uid(),
        suspended_at = null,
        removed_at = null;

    return new;
  end if;

  -- If some future privileged workflow changes an administrative membership to
  -- a resident/board role directly, do not leave stale administrative state active.
  if tg_op = 'UPDATE'
    and old.role in ('condominium_admin', 'accountant', 'assistant', 'payment_reviewer')
    and new.role not in ('condominium_admin', 'accountant', 'assistant', 'payment_reviewer')
  then
    update public.condominium_team_access_states
    set status = 'removed',
        changed_at = now(),
        changed_by = coalesce(auth.uid(), changed_by),
        removed_at = coalesce(removed_at, now())
    where condominium_id = old.condominium_id
      and user_id = old.user_id;

    return new;
  end if;

  if tg_op = 'DELETE'
    and old.role in ('condominium_admin', 'accountant', 'assistant', 'payment_reviewer')
  then
    update public.condominium_team_access_states
    set status = case when status in ('suspended', 'removed') then status else 'removed' end,
        changed_at = now(),
        changed_by = coalesce(auth.uid(), changed_by),
        removed_at = case
          when status in ('suspended', 'removed') then removed_at
          else coalesce(removed_at, now())
        end
    where condominium_id = old.condominium_id
      and user_id = old.user_id;

    return old;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger sync_condominium_team_state_after_insert
  after insert on public.condominium_memberships
  for each row execute function public.sync_condominium_team_state_from_membership();

create trigger sync_condominium_team_state_after_role_update
  after update of role on public.condominium_memberships
  for each row execute function public.sync_condominium_team_state_from_membership();

create trigger sync_condominium_team_state_after_delete
  after delete on public.condominium_memberships
  for each row execute function public.sync_condominium_team_state_from_membership();

create or replace function public.list_condominium_team_access(target_condominium_id uuid)
returns table (
  user_id uuid,
  email text,
  full_name text,
  role public.condominium_role,
  status text,
  joined_at timestamptz,
  changed_at timestamptz
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if auth.uid() is null or not public.can_manage_condominium_structure(target_condominium_id) then
    raise exception 'condominium administrator required';
  end if;

  return query
  select
    s.user_id,
    au.email::text,
    nullif(trim(coalesce(au.raw_user_meta_data ->> 'full_name', '')), '')::text,
    s.role,
    s.status,
    s.first_joined_at,
    s.changed_at
  from public.condominium_team_access_states s
  join auth.users au on au.id = s.user_id
  where s.condominium_id = target_condominium_id
    and s.status in ('active', 'suspended')
  order by
    case s.status when 'active' then 0 else 1 end,
    s.first_joined_at,
    au.email;
end;
$$;

revoke execute on function public.list_condominium_team_access(uuid) from public;
grant execute on function public.list_condominium_team_access(uuid) to authenticated;

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
  current_role public.condominium_role;
  stored_state public.condominium_team_access_states;
  resolved_role public.condominium_role;
  admin_count bigint;
begin
  if auth.uid() is null or not public.can_manage_condominium_structure(target_condominium_id) then
    raise exception 'condominium administrator required';
  end if;

  -- Serialize lifecycle changes inside one condominium so two concurrent demotions
  -- cannot both pass the last-administrator guard.
  perform 1
  from public.condominiums
  where id = target_condominium_id
  for update;

  if not found then
    raise exception 'condominium not found';
  end if;

  select cm.id, cm.role
  into current_membership_id, current_role
  from public.condominium_memberships cm
  where cm.condominium_id = target_condominium_id
    and cm.user_id = target_user_id
    and cm.role in ('condominium_admin', 'accountant', 'assistant', 'payment_reviewer')
  for update;

  select *
  into stored_state
  from public.condominium_team_access_states s
  where s.condominium_id = target_condominium_id
    and s.user_id = target_user_id
  for update;

  if target_action = 'change_role' then
    if current_membership_id is null then
      raise exception 'active team member required';
    end if;

    if target_role not in ('condominium_admin', 'accountant', 'assistant', 'payment_reviewer') then
      raise exception 'invalid administrative role';
    end if;

    resolved_role := target_role::public.condominium_role;
    if resolved_role = current_role then
      return jsonb_build_object('status', 'active', 'role', current_role, 'changed', false);
    end if;

    if current_role = 'condominium_admin' and resolved_role <> 'condominium_admin' then
      select count(*) into admin_count
      from public.condominium_memberships
      where condominium_id = target_condominium_id
        and role = 'condominium_admin';
      if admin_count <= 1 then
        raise exception 'last condominium administrator required';
      end if;
    end if;

    update public.condominium_memberships
    set role = resolved_role,
        updated_at = now()
    where id = current_membership_id;

    insert into public.condominium_team_access_events (
      condominium_id, user_id, event_type, from_role, to_role, actor_user_id
    ) values (
      target_condominium_id, target_user_id, 'role_changed', current_role, resolved_role, auth.uid()
    );

  elsif target_action = 'suspend' then
    if current_membership_id is null then
      raise exception 'active team member required';
    end if;

    if current_role = 'condominium_admin' then
      select count(*) into admin_count
      from public.condominium_memberships
      where condominium_id = target_condominium_id
        and role = 'condominium_admin';
      if admin_count <= 1 then
        raise exception 'last condominium administrator required';
      end if;
    end if;

    update public.condominium_team_access_states
    set role = current_role,
        status = 'suspended',
        changed_at = now(),
        changed_by = auth.uid(),
        suspended_at = now(),
        removed_at = null
    where condominium_id = target_condominium_id
      and user_id = target_user_id;

    delete from public.condominium_memberships
    where id = current_membership_id;

    insert into public.condominium_team_access_events (
      condominium_id, user_id, event_type, from_role, actor_user_id
    ) values (
      target_condominium_id, target_user_id, 'suspended', current_role, auth.uid()
    );

  elsif target_action = 'reactivate' then
    if current_membership_id is not null then
      raise exception 'team member already active';
    end if;
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
    set role = resolved_role,
        status = 'active',
        changed_at = now(),
        changed_by = auth.uid(),
        suspended_at = null,
        removed_at = null
    where condominium_id = target_condominium_id
      and user_id = target_user_id;

    insert into public.condominium_team_access_events (
      condominium_id, user_id, event_type, from_role, to_role, actor_user_id
    ) values (
      target_condominium_id, target_user_id, 'reactivated', stored_state.role, resolved_role, auth.uid()
    );

  elsif target_action = 'remove' then
    if current_membership_id is null and (stored_state.user_id is null or stored_state.status = 'removed') then
      raise exception 'team member not found';
    end if;

    if current_membership_id is not null and current_role = 'condominium_admin' then
      select count(*) into admin_count
      from public.condominium_memberships
      where condominium_id = target_condominium_id
        and role = 'condominium_admin';
      if admin_count <= 1 then
        raise exception 'last condominium administrator required';
      end if;
    end if;

    resolved_role := coalesce(current_role, stored_state.role);

    update public.condominium_team_access_states
    set role = resolved_role,
        status = 'removed',
        changed_at = now(),
        changed_by = auth.uid(),
        removed_at = now()
    where condominium_id = target_condominium_id
      and user_id = target_user_id;

    if current_membership_id is not null then
      delete from public.condominium_memberships
      where id = current_membership_id;
    end if;

    insert into public.condominium_team_access_events (
      condominium_id, user_id, event_type, from_role, actor_user_id
    ) values (
      target_condominium_id, target_user_id, 'removed', resolved_role, auth.uid()
    );

  else
    raise exception 'invalid team action';
  end if;

  select *
  into stored_state
  from public.condominium_team_access_states s
  where s.condominium_id = target_condominium_id
    and s.user_id = target_user_id;

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

-- Invitation acceptance must also preserve the one-administrative-role invariant.
create or replace function public.accept_admin_invitation(raw_token text)
returns public.admin_invitations
language plpgsql
security definer
set search_path = public, extensions
set row_security = off
as $$
declare
  invitation public.admin_invitations;
  authenticated_email text;
  current_membership_id uuid;
  current_role public.condominium_role;
  admin_count bigint;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select lower(email)
  into authenticated_email
  from auth.users
  where id = auth.uid();

  select *
  into invitation
  from public.admin_invitations
  where token_hash = encode(digest(raw_token, 'sha256'), 'hex')
  for update;

  if invitation.id is null
    or invitation.status <> 'pending'
    or invitation.expires_at < now()
    or authenticated_email is null
    or lower(invitation.email) <> authenticated_email
  then
    raise exception 'invalid invitation';
  end if;

  perform 1
  from public.condominiums
  where id = invitation.condominium_id
  for update;

  select cm.id, cm.role
  into current_membership_id, current_role
  from public.condominium_memberships cm
  where cm.condominium_id = invitation.condominium_id
    and cm.user_id = auth.uid()
    and cm.role in ('condominium_admin', 'accountant', 'assistant', 'payment_reviewer')
  for update;

  if current_membership_id is null then
    insert into public.condominium_memberships (condominium_id, user_id, role)
    values (invitation.condominium_id, auth.uid(), invitation.intended_role);
  elsif current_role <> invitation.intended_role then
    if current_role = 'condominium_admin' and invitation.intended_role <> 'condominium_admin' then
      select count(*) into admin_count
      from public.condominium_memberships
      where condominium_id = invitation.condominium_id
        and role = 'condominium_admin';
      if admin_count <= 1 then
        raise exception 'last condominium administrator required';
      end if;
    end if;

    update public.condominium_memberships
    set role = invitation.intended_role,
        updated_at = now()
    where id = current_membership_id;

    insert into public.condominium_team_access_events (
      condominium_id,
      user_id,
      event_type,
      from_role,
      to_role,
      actor_user_id,
      metadata
    ) values (
      invitation.condominium_id,
      auth.uid(),
      'role_changed',
      current_role,
      invitation.intended_role,
      auth.uid(),
      jsonb_build_object('source', 'admin_invitation', 'invitation_id', invitation.id)
    );
  end if;

  update public.admin_invitations
  set status = 'accepted',
      accepted_at = now()
  where id = invitation.id
  returning * into invitation;

  insert into public.admin_invitation_events (
    invitation_id,
    condominium_id,
    event_type,
    actor_user_id,
    metadata
  )
  values (
    invitation.id,
    invitation.condominium_id,
    'accepted',
    auth.uid(),
    jsonb_build_object('role', invitation.intended_role)
  );

  return invitation;
end;
$$;

revoke execute on function public.accept_admin_invitation(text) from public;
grant execute on function public.accept_admin_invitation(text) to authenticated;
