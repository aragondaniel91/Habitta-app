-- HAB-125: turn the existing owner/tenant invitation table into a complete, safe
-- resident onboarding primitive. Invitations are bound to a real active unit assignment,
-- the person's canonical email, and the authenticated user accepting the token.

alter table public.invitations
  add column if not exists revoked_at timestamptz;

create index if not exists invitations_condominium_status_idx
  on public.invitations (condominium_id, status, created_at desc);

create or replace function public.assert_resident_invitation_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  person_email text;
begin
  select lower(p.email)
    into person_email
    from public.people p
    where p.id = new.person_id
      and p.condominium_id = new.condominium_id
      and p.status = 'active';

  if person_email is null then
    raise exception 'resident invitation requires an active person with email';
  end if;

  if lower(trim(new.email)) <> person_email then
    raise exception 'invitation email must match person email';
  end if;

  if new.unit_id is null then
    raise exception 'resident invitation requires unit';
  end if;

  if new.intended_role = 'owner'::public.condominium_role then
    if not exists (
      select 1
      from public.unit_owners uo
      join public.units u on u.id = uo.unit_id
      where uo.unit_id = new.unit_id
        and uo.person_id = new.person_id
        and uo.ends_at is null
        and u.condominium_id = new.condominium_id
        and u.status = 'active'
    ) then
      raise exception 'owner invitation requires active ownership assignment';
    end if;
  elsif new.intended_role = 'tenant'::public.condominium_role then
    if not exists (
      select 1
      from public.unit_occupancies uo
      join public.units u on u.id = uo.unit_id
      where uo.unit_id = new.unit_id
        and uo.person_id = new.person_id
        and uo.occupancy_type = 'tenant'
        and uo.ends_at is null
        and u.condominium_id = new.condominium_id
        and u.status = 'active'
    ) then
      raise exception 'tenant invitation requires active tenant assignment';
    end if;
  else
    raise exception 'unsupported resident invitation role';
  end if;

  return new;
end;
$$;

revoke all on function public.assert_resident_invitation_assignment()
  from public, anon, authenticated, service_role;

drop trigger if exists invitations_resident_assignment on public.invitations;
create trigger invitations_resident_assignment
before insert or update of person_id, unit_id, email, intended_role, condominium_id
on public.invitations
for each row execute function public.assert_resident_invitation_assignment();

create or replace function public.create_resident_invitation(
  target_condominium_id uuid,
  target_person_id uuid,
  target_unit_id uuid,
  target_role public.condominium_role,
  target_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  person_record public.people;
  invitation public.invitations;
  raw_token text;
  resolved_expiration timestamptz := coalesce(target_expires_at, now() + interval '7 days');
begin
  if auth.uid() is null or not public.can_manage_people(target_condominium_id) then
    raise exception 'resident invitation denied';
  end if;

  if target_role not in ('owner'::public.condominium_role, 'tenant'::public.condominium_role) then
    raise exception 'invalid resident role';
  end if;

  if resolved_expiration < now() + interval '1 hour'
     or resolved_expiration > now() + interval '30 days' then
    raise exception 'invalid resident invitation expiration';
  end if;

  select * into person_record
  from public.people p
  where p.id = target_person_id
    and p.condominium_id = target_condominium_id
    and p.status = 'active'
  for update;

  if person_record.id is null or person_record.email is null then
    raise exception 'resident requires an active profile with email';
  end if;

  -- Supersede only the same resident/unit/role invitation. Other units remain independent.
  update public.invitations i
  set status = 'revoked',
      revoked_at = now()
  where i.condominium_id = target_condominium_id
    and i.person_id = target_person_id
    and i.unit_id = target_unit_id
    and i.intended_role = target_role
    and i.status = 'pending';

  raw_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.invitations(
    condominium_id,
    person_id,
    unit_id,
    email,
    intended_role,
    token_hash,
    expires_at,
    invited_by
  ) values (
    target_condominium_id,
    target_person_id,
    target_unit_id,
    lower(trim(person_record.email)),
    target_role,
    encode(extensions.digest(raw_token, 'sha256'), 'hex'),
    resolved_expiration,
    auth.uid()
  )
  returning * into invitation;

  return jsonb_build_object(
    'invitation', to_jsonb(invitation),
    'raw_token', raw_token
  );
end;
$$;

create or replace function public.revoke_resident_invitation(target_invitation_id uuid)
returns public.invitations
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  invitation public.invitations;
begin
  select * into invitation
  from public.invitations i
  where i.id = target_invitation_id
  for update;

  if invitation.id is null then raise exception 'resident invitation not found'; end if;
  if not public.can_manage_people(invitation.condominium_id) then
    raise exception 'resident invitation denied';
  end if;
  if invitation.status <> 'pending' then raise exception 'resident invitation not pending'; end if;

  update public.invitations
  set status = 'revoked', revoked_at = now()
  where id = invitation.id
  returning * into invitation;

  return invitation;
end;
$$;

create or replace function public.get_resident_invitation_preview(raw_token text)
returns table(
  id uuid,
  condominium_id uuid,
  condominium_name text,
  person_id uuid,
  person_name text,
  unit_id uuid,
  unit_code text,
  email text,
  intended_role public.condominium_role,
  status public.invitation_status,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select
    i.id,
    i.condominium_id,
    c.name,
    i.person_id,
    trim(p.first_name || ' ' || p.last_name),
    i.unit_id,
    u.code,
    i.email,
    i.intended_role,
    case
      when i.status = 'pending' and i.expires_at < now() then 'expired'::public.invitation_status
      else i.status
    end,
    i.expires_at
  from public.invitations i
  join public.condominiums c on c.id = i.condominium_id
  join public.people p on p.id = i.person_id
  left join public.units u on u.id = i.unit_id
  where i.token_hash = encode(extensions.digest(raw_token, 'sha256'), 'hex')
  limit 1;
$$;

create or replace function public.accept_invitation(raw_token text)
returns public.invitations
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  invite public.invitations;
  authenticated_email text;
  existing_person_user uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select lower(au.email)
  into authenticated_email
  from auth.users au
  where au.id = auth.uid();

  select i.*
  into invite
  from public.invitations i
  where i.token_hash = encode(extensions.digest(raw_token, 'sha256'), 'hex')
  for update;

  if invite.id is null
     or invite.status <> 'pending'
     or invite.expires_at < now()
     or authenticated_email is null
     or lower(invite.email) <> authenticated_email then
    raise exception 'invalid invitation';
  end if;

  -- Revalidate the relationship at acceptance time. An old token cannot resurrect access
  -- after an owner/tenant assignment was closed.
  if invite.intended_role = 'owner'::public.condominium_role and not exists (
    select 1 from public.unit_owners uo
    where uo.unit_id = invite.unit_id
      and uo.person_id = invite.person_id
      and uo.ends_at is null
  ) then
    raise exception 'resident assignment is no longer active';
  end if;

  if invite.intended_role = 'tenant'::public.condominium_role and not exists (
    select 1 from public.unit_occupancies uo
    where uo.unit_id = invite.unit_id
      and uo.person_id = invite.person_id
      and uo.occupancy_type = 'tenant'
      and uo.ends_at is null
  ) then
    raise exception 'resident assignment is no longer active';
  end if;

  select p.auth_user_id into existing_person_user
  from public.people p
  where p.id = invite.person_id
  for update;

  if existing_person_user is not null and existing_person_user <> auth.uid() then
    raise exception 'person already linked';
  end if;

  update public.people
  set auth_user_id = auth.uid(), updated_at = now()
  where id = invite.person_id;

  insert into public.condominium_memberships(condominium_id, user_id, role)
  values (invite.condominium_id, auth.uid(), invite.intended_role)
  on conflict (condominium_id, user_id, role) do nothing;

  update public.invitations
  set status = 'accepted', accepted_at = now()
  where id = invite.id
  returning * into invite;

  return invite;
end;
$$;

revoke all on function public.create_resident_invitation(uuid,uuid,uuid,public.condominium_role,timestamptz)
  from public, anon;
grant execute on function public.create_resident_invitation(uuid,uuid,uuid,public.condominium_role,timestamptz)
  to authenticated, service_role;

revoke all on function public.revoke_resident_invitation(uuid) from public, anon;
grant execute on function public.revoke_resident_invitation(uuid) to authenticated, service_role;

revoke all on function public.get_resident_invitation_preview(text) from public;
grant execute on function public.get_resident_invitation_preview(text) to anon, authenticated, service_role;

revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated, service_role;
