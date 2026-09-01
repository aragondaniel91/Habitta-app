-- HAB-412 / HAB-418, part three: invitation and revocation for the two residential roles.
--
-- This extends the HAB-125 pattern rather than replacing it: one-time token, email must match the
-- authenticated user, the person must still be active, the relationship is revalidated at
-- acceptance, and the membership is created only on success. Every one of those still holds.
--
-- The mapping is exact in both directions. A `family_member` invitation requires a `family_member`
-- occupancy for that person on that unit, and an `authorized_occupant` invitation requires an
-- `authorized_occupant` one. Cross-mapping is refused: an authorized occupant cannot accept a
-- family invitation, and a tenant relationship cannot satisfy either.

-- ------------------------------------------------------------------ which membership a relation grants

-- One place that says which membership an occupancy justifies. Invitation validation, acceptance
-- and revocation all read it, so the three cannot drift apart -- and `owner_occupant` deliberately
-- maps to nothing, because owner membership comes from `unit_owners`, not from living somewhere.
create or replace function public.membership_role_for_occupancy(target public.occupancy_type)
returns public.condominium_role
language sql
immutable
set search_path = public
as $$
  select case target
    when 'tenant' then 'tenant'::public.condominium_role
    when 'family_member' then 'family_member'::public.condominium_role
    when 'authorized_occupant' then 'authorized_occupant'::public.condominium_role
    else null
  end;
$$;

revoke all on function public.membership_role_for_occupancy(public.occupancy_type) from public;
grant execute on function public.membership_role_for_occupancy(public.occupancy_type) to authenticated, service_role;

-- ------------------------------------------------------------------ the table's own gate

-- A CHECK constraint on `invitations` limited `intended_role` to owner and tenant. It is the only
-- role list in the schema that lives outside a function or a policy, which is exactly why the
-- capability audit did not surface it -- the invitation tests did, by failing.
--
-- Widened to the four residential roles and no further. Staff roles still cannot travel through
-- the resident invitation path; they have their own, in `admin_invitations`.
alter table public.invitations
  drop constraint invitations_intended_role_check;

alter table public.invitations
  add constraint invitations_intended_role_check check (
    intended_role = any (array[
      'owner'::public.condominium_role,
      'tenant'::public.condominium_role,
      'family_member'::public.condominium_role,
      'authorized_occupant'::public.condominium_role
    ])
  );

-- ------------------------------------------------------------------ creation

-- The four residential roles an administrator may invite. This is the only edit to the deployed
-- body: the two new roles are admitted here and nowhere else, so no other role can arrive through
-- this door. Everything else -- the rate guard, the supersede rule, the token, the return shape --
-- is what is already running, so `diff` against the deployed definition shows one widened list.
CREATE OR REPLACE FUNCTION public.create_resident_invitation(target_condominium_id uuid, target_person_id uuid, target_unit_id uuid, target_role condominium_role, target_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
declare
  person_record public.people;
  invitation public.invitations;
  raw_token text;
  resolved_expiration timestamptz := coalesce(target_expires_at, now() + interval '7 days');
begin
  if auth.uid() is null or not public.can_manage_people(target_condominium_id) then
    raise exception 'resident invitation denied';
  end if;

  if target_role not in (
    'owner'::public.condominium_role,
    'tenant'::public.condominium_role,
    'family_member'::public.condominium_role,
    'authorized_occupant'::public.condominium_role
  ) then
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
$function$;

-- ------------------------------------------------------------------ the relationship gate

-- The trigger that refuses an invitation whose relationship does not exist. Owner and tenant keep
-- their exact conditions; the two new roles are added with the strict date semantics -- a
-- relationship starting tomorrow is not one you can be invited into today.
create or replace function public.assert_resident_invitation_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  person_email text;
  required_occupancy public.occupancy_type;
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
  elsif new.intended_role in (
    'family_member'::public.condominium_role,
    'authorized_occupant'::public.condominium_role
  ) then
    -- Exact mapping, both ways. A family invitation is satisfied only by a family occupancy, and
    -- an authorized-occupant invitation only by an authorized-occupant one.
    required_occupancy := case new.intended_role
      when 'family_member'::public.condominium_role then 'family_member'::public.occupancy_type
      else 'authorized_occupant'::public.occupancy_type
    end;

    if not exists (
      select 1
      from public.unit_occupancies uo
      join public.units u on u.id = uo.unit_id
      where uo.unit_id = new.unit_id
        and uo.person_id = new.person_id
        and uo.occupancy_type = required_occupancy
        and uo.starts_at <= current_date
        and (uo.ends_at is null or uo.ends_at >= current_date)
        and u.condominium_id = new.condominium_id
        and u.status = 'active'
    ) then
      raise exception 'resident invitation requires the matching active residential relationship';
    end if;
  else
    raise exception 'unsupported resident invitation role';
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------------------ acceptance

-- Revalidation at acceptance, which is what makes a stale token worthless. Everything the
-- invitation asserted when it was created is asked again now, against the database, because the
-- relationship may have ended, changed type, or been deleted in between.
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
  required_occupancy public.occupancy_type;
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

  if invite.intended_role in (
    'family_member'::public.condominium_role,
    'authorized_occupant'::public.condominium_role
  ) then
    required_occupancy := case invite.intended_role
      when 'family_member'::public.condominium_role then 'family_member'::public.occupancy_type
      else 'authorized_occupant'::public.occupancy_type
    end;

    -- The person, the unit, the condominium, the type and both dates, all read now. A token minted
    -- while the relationship was alive buys nothing once it has ended or changed.
    if not exists (
      select 1
      from public.unit_occupancies uo
      join public.units u on u.id = uo.unit_id
      join public.people p on p.id = uo.person_id
      where uo.unit_id = invite.unit_id
        and uo.person_id = invite.person_id
        and uo.occupancy_type = required_occupancy
        and uo.starts_at <= current_date
        and (uo.ends_at is null or uo.ends_at >= current_date)
        and u.condominium_id = invite.condominium_id
        and u.status = 'active'
        and p.condominium_id = invite.condominium_id
        and p.status = 'active'
    ) then
      raise exception 'resident assignment is no longer active';
    end if;
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

-- ------------------------------------------------------------------ revocation

-- One trigger for all three residential occupancy types instead of three near-identical ones. The
-- membership removed is the one this occupancy justified and no other: closing a family
-- relationship never touches an authorized-occupant membership, an owner membership, or staff.
--
-- The last-relationship rule matters. Two active family occupancies in the same condominium mean
-- closing one leaves the membership standing, because the other still justifies it.
create or replace function public.revoke_stale_tenant_membership_after_occupancy()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  old_condominium uuid;
  old_user uuid;
  affected_role public.condominium_role;
begin
  affected_role := public.membership_role_for_occupancy(old.occupancy_type);
  if affected_role is null then
    return null;
  end if;

  -- Updating the same occupancy to a current or future end date keeps it active.
  if tg_op = 'UPDATE'
     and new.occupancy_type = old.occupancy_type
     and (new.ends_at is null or new.ends_at >= current_date)
     and new.person_id = old.person_id
     and new.unit_id = old.unit_id then
    return null;
  end if;

  select p.condominium_id, p.auth_user_id
    into old_condominium, old_user
  from public.people p
  where p.id = old.person_id;

  if old_user is null then
    return null;
  end if;

  if not exists (
    select 1
    from public.people p
    join public.unit_occupancies uo on uo.person_id = p.id
    join public.units u on u.id = uo.unit_id
    where p.auth_user_id = old_user
      and p.condominium_id = old_condominium
      and p.status = 'active'
      and uo.occupancy_type = old.occupancy_type
      and (uo.ends_at is null or uo.ends_at >= current_date)
      and u.condominium_id = old_condominium
      and u.status = 'active'
  ) then
    delete from public.condominium_memberships cm
    where cm.condominium_id = old_condominium
      and cm.user_id = old_user
      and cm.role = affected_role;
  end if;

  return null;
end;
$$;
