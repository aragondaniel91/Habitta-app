create table public.admin_invitations (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  email text not null,
  intended_role public.condominium_role not null
    check (intended_role in ('condominium_admin', 'accountant', 'assistant', 'payment_reviewer')),
  token_hash text not null unique,
  status public.invitation_status not null default 'pending',
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create unique index admin_invitations_pending_email_unique
  on public.admin_invitations (condominium_id, lower(email))
  where status = 'pending';

create index admin_invitations_condominium_created_idx
  on public.admin_invitations (condominium_id, created_at desc);

create table public.admin_invitation_events (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.admin_invitations(id) on delete cascade,
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  event_type text not null check (event_type in ('created', 'accepted', 'revoked', 'expired')),
  actor_user_id uuid references auth.users(id),
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

alter table public.admin_invitations enable row level security;
alter table public.admin_invitation_events enable row level security;

create policy admin_invitations_manage on public.admin_invitations
for all
using (public.can_manage_condominium_structure(condominium_id))
with check (public.can_manage_condominium_structure(condominium_id));

create policy admin_invitation_events_read on public.admin_invitation_events
for select
using (public.can_manage_condominium_structure(condominium_id));

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

  if target_role not in ('condominium_admin', 'accountant', 'assistant', 'payment_reviewer') then
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

create or replace function public.get_admin_invitation_preview(raw_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
set row_security = off
as $$
declare
  invitation public.admin_invitations;
  condominium_name text;
begin
  select ai, c.name
  into invitation, condominium_name
  from public.admin_invitations ai
  join public.condominiums c on c.id = ai.condominium_id
  where ai.token_hash = encode(digest(raw_token, 'sha256'), 'hex');

  if invitation.id is null then
    raise exception 'invalid invitation';
  end if;

  if invitation.status = 'pending' and invitation.expires_at < now() then
    update public.admin_invitations
    set status = 'expired'
    where id = invitation.id;
    invitation.status := 'expired';
  end if;

  return jsonb_build_object(
    'id', invitation.id,
    'email', invitation.email,
    'condominium_id', invitation.condominium_id,
    'condominium_name', condominium_name,
    'intended_role', invitation.intended_role,
    'status', invitation.status,
    'expires_at', invitation.expires_at
  );
end;
$$;

revoke execute on function public.get_admin_invitation_preview(text) from public;
grant execute on function public.get_admin_invitation_preview(text) to anon, authenticated;

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

  insert into public.condominium_memberships (condominium_id, user_id, role)
  values (invitation.condominium_id, auth.uid(), invitation.intended_role)
  on conflict do nothing;

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

create or replace function public.revoke_admin_invitation(target_invitation_id uuid)
returns public.admin_invitations
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  invitation public.admin_invitations;
begin
  select *
  into invitation
  from public.admin_invitations
  where id = target_invitation_id
  for update;

  if invitation.id is null
    or auth.uid() is null
    or not public.can_manage_condominium_structure(invitation.condominium_id)
  then
    raise exception 'invitation not found';
  end if;

  if invitation.status <> 'pending' then
    raise exception 'invitation is not pending';
  end if;

  update public.admin_invitations
  set status = 'revoked',
      revoked_at = now()
  where id = invitation.id
  returning * into invitation;

  insert into public.admin_invitation_events (
    invitation_id,
    condominium_id,
    event_type,
    actor_user_id
  )
  values (invitation.id, invitation.condominium_id, 'revoked', auth.uid());

  return invitation;
end;
$$;

revoke execute on function public.revoke_admin_invitation(uuid) from public;
grant execute on function public.revoke_admin_invitation(uuid) to authenticated;

create or replace function public.list_condominium_team(target_condominium_id uuid)
returns table (
  user_id uuid,
  email text,
  full_name text,
  role public.condominium_role,
  joined_at timestamptz
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
    cm.user_id,
    au.email::text,
    nullif(trim(coalesce(au.raw_user_meta_data ->> 'full_name', '')), '')::text,
    cm.role,
    cm.created_at
  from public.condominium_memberships cm
  join auth.users au on au.id = cm.user_id
  where cm.condominium_id = target_condominium_id
    and cm.role in ('condominium_admin', 'accountant', 'assistant', 'payment_reviewer')
  order by cm.created_at, au.email;
end;
$$;

revoke execute on function public.list_condominium_team(uuid) from public;
grant execute on function public.list_condominium_team(uuid) to authenticated;
