-- HAB-PILOT #23: a residential relationship is the source of current access,
-- not the membership row left behind after it. Relationship rows remain history.
--
-- `ends_at` is intentionally inclusive. Existing tenant acceptance tests establish
-- that a relationship ending today remains active today; an immediately effective
-- revocation therefore uses an already-effective end date. Do not change that
-- product contract here without an approved temporal-policy decision.

create or replace function public.has_active_owner_relationship(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.unit_owners o
    join public.people p on p.id = o.person_id
    join public.units u on u.id = o.unit_id
    where p.auth_user_id = auth.uid()
      and p.condominium_id = target
      and p.status = 'active'
      and u.condominium_id = target
      and u.status = 'active'
      and o.starts_at <= current_date
      and (o.ends_at is null or o.ends_at >= current_date)
  );
$$;

create or replace function public.can_read_condominium(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.is_organization_owner_for_condominium(target)
    or exists (
      select 1
      from public.condominium_memberships cm
      where cm.condominium_id = target
        and cm.user_id = auth.uid()
        and (
          (cm.role = 'owner' and public.has_active_owner_relationship(target))
          or public.is_staff_role(cm.role)
          or (cm.role = 'tenant' and public.has_active_tenant_occupancy(target))
          or (cm.role = 'family_member' and public.has_active_resident_relation(target, 'family_member'))
          or (cm.role = 'authorized_occupant' and public.has_active_resident_relation(target, 'authorized_occupant'))
        )
    );
$$;

create or replace function public.can_read_governance(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.is_organization_owner_for_condominium(target)
    or exists (
      select 1
      from public.condominium_memberships cm
      where cm.condominium_id = target
        and cm.user_id = auth.uid()
        and (
          (cm.role = 'owner' and public.has_active_owner_relationship(target))
          or public.is_staff_role(cm.role)
          or (cm.role = 'tenant' and public.has_active_tenant_occupancy(target))
        )
    );
$$;

create or replace function public.can_read_unit(target_unit uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.units u
    where u.id = target_unit
      and u.status = 'active'
      and (
        public.is_organization_owner_for_condominium(u.condominium_id)
        or exists (
          select 1 from public.condominium_memberships cm
          where cm.condominium_id = u.condominium_id
            and cm.user_id = auth.uid()
            and public.is_staff_role(cm.role)
        )
        or exists (
          select 1
          from public.unit_owners owner_link
          join public.people p on p.id = owner_link.person_id
          where owner_link.unit_id = u.id
            and owner_link.starts_at <= current_date
            and (owner_link.ends_at is null or owner_link.ends_at >= current_date)
            and p.condominium_id = u.condominium_id
            and p.status = 'active'
            and p.auth_user_id = auth.uid()
        )
        or public.is_active_tenant_for_unit(u.condominium_id, u.id)
        or exists (
          select 1
          from public.people p
          join public.unit_occupancies uo on uo.person_id = p.id
          where uo.unit_id = u.id
            and uo.occupancy_type in ('family_member', 'authorized_occupant')
            and uo.starts_at <= current_date
            and (uo.ends_at is null or uo.ends_at >= current_date)
            and p.condominium_id = u.condominium_id
            and p.status = 'active'
            and p.auth_user_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.revoke_stale_owner_membership_after_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  old_condominium uuid;
  old_user uuid;
begin
  if tg_op = 'UPDATE'
     and new.person_id = old.person_id
     and new.unit_id = old.unit_id
     and new.starts_at <= current_date
     and (new.ends_at is null or new.ends_at >= current_date) then
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
    from public.unit_owners o
    join public.people p on p.id = o.person_id
    join public.units u on u.id = o.unit_id
    where p.auth_user_id = old_user
      and p.condominium_id = old_condominium
      and p.status = 'active'
      and u.condominium_id = old_condominium
      and u.status = 'active'
      and o.starts_at <= current_date
      and (o.ends_at is null or o.ends_at >= current_date)
  ) then
    delete from public.condominium_memberships cm
    where cm.condominium_id = old_condominium
      and cm.user_id = old_user
      and cm.role = 'owner'::public.condominium_role;
  end if;

  return null;
end;
$$;

revoke all on function public.has_active_owner_relationship(uuid) from public, anon;
revoke all on function public.revoke_stale_owner_membership_after_ownership() from public, anon, authenticated, service_role;
grant execute on function public.has_active_owner_relationship(uuid) to authenticated, service_role;

drop trigger if exists unit_owners_revoke_stale_owner_membership on public.unit_owners;
create trigger unit_owners_revoke_stale_owner_membership
after update of ends_at, person_id, unit_id or delete on public.unit_owners
for each row execute function public.revoke_stale_owner_membership_after_ownership();

revoke all on function public.can_read_condominium(uuid),
  public.can_read_governance(uuid), public.can_read_unit(uuid) from public, anon;
grant execute on function public.can_read_condominium(uuid),
  public.can_read_governance(uuid), public.can_read_unit(uuid) to authenticated, service_role;
