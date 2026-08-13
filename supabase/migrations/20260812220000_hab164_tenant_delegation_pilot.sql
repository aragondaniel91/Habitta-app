-- HAB-164 pilot: tenant delegation remains bound to an active tenant occupancy.
-- Tenants keep enough condominium context to enter the resident app, but unit reads are
-- restricted to actively occupied units and stale tenant memberships are revoked automatically.

create function public.is_active_tenant_for_unit(
  target_condominium uuid,
  target_unit uuid
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
    from public.people p
    join public.unit_occupancies uo on uo.person_id = p.id
    join public.units u on u.id = uo.unit_id
    where p.auth_user_id = auth.uid()
      and p.condominium_id = target_condominium
      and p.status = 'active'
      and uo.unit_id = target_unit
      and uo.occupancy_type = 'tenant'
      and uo.ends_at is null
      and u.condominium_id = target_condominium
      and u.status = 'active'
  );
$$;

create function public.has_active_tenant_occupancy(target_condominium uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.people p
    join public.unit_occupancies uo on uo.person_id = p.id
    join public.units u on u.id = uo.unit_id
    where p.auth_user_id = auth.uid()
      and p.condominium_id = target_condominium
      and p.status = 'active'
      and uo.occupancy_type = 'tenant'
      and uo.ends_at is null
      and u.condominium_id = target_condominium
      and u.status = 'active'
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
          cm.role <> 'tenant'::public.condominium_role
          or public.has_active_tenant_occupancy(target)
        )
    );
$$;

-- Replace the earlier owner/tenant unit helper without widening owner access. Staff still see
-- the whole condominium, owners only their owned units, and pilot tenants only active tenant
-- occupancies. Active relationship/status checks prevent stale historical links from granting access.
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
          select 1
          from public.condominium_memberships cm
          where cm.condominium_id = u.condominium_id
            and cm.user_id = auth.uid()
            and cm.role in (
              'condominium_admin', 'accountant', 'assistant', 'payment_reviewer', 'board_member'
            )
        )
        or exists (
          select 1
          from public.unit_owners owner_link
          join public.people p on p.id = owner_link.person_id
          where owner_link.unit_id = u.id
            and p.condominium_id = u.condominium_id
            and p.auth_user_id = auth.uid()
            and p.status = 'active'
            and owner_link.ends_at is null
        )
        or public.is_active_tenant_for_unit(u.condominium_id, u.id)
      )
  );
$$;

revoke execute on function public.is_active_tenant_for_unit(uuid,uuid) from public;
revoke execute on function public.has_active_tenant_occupancy(uuid) from public;
revoke execute on function public.can_read_unit(uuid) from public;
grant execute on function public.is_active_tenant_for_unit(uuid,uuid) to authenticated, service_role;
grant execute on function public.has_active_tenant_occupancy(uuid) to authenticated, service_role;
grant execute on function public.can_read_unit(uuid) to authenticated, service_role;

-- Preserve the existing explicit grant after replacing can_read_condominium.
revoke execute on function public.can_read_condominium(uuid) from public;
grant execute on function public.can_read_condominium(uuid) to authenticated, service_role;

-- Main already contains unit_read_v2. Drop every historical version so PostgreSQL's permissive
-- policy OR semantics cannot accidentally preserve the older, broader resident scope.
drop policy if exists unit_read on public.units;
drop policy if exists unit_read_v2 on public.units;
create policy unit_read_v3 on public.units
for select
using (public.can_read_unit(units.id));

create function public.revoke_stale_tenant_membership_after_occupancy()
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
  if old.occupancy_type <> 'tenant'::public.occupancy_type then
    return null;
  end if;

  -- Only a closed/removed tenant occupancy can reduce delegated access.
  if tg_op = 'UPDATE' and new.occupancy_type = 'tenant'::public.occupancy_type
     and new.ends_at is null and new.person_id = old.person_id and new.unit_id = old.unit_id then
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
      and uo.occupancy_type = 'tenant'
      and uo.ends_at is null
      and u.condominium_id = old_condominium
      and u.status = 'active'
  ) then
    delete from public.condominium_memberships cm
    where cm.condominium_id = old_condominium
      and cm.user_id = old_user
      and cm.role = 'tenant'::public.condominium_role;
  end if;

  return null;
end;
$$;

revoke all on function public.revoke_stale_tenant_membership_after_occupancy()
  from public, anon, authenticated, service_role;

drop trigger if exists unit_occupancies_revoke_stale_tenant_membership on public.unit_occupancies;
create trigger unit_occupancies_revoke_stale_tenant_membership
after update of ends_at, occupancy_type, person_id, unit_id or delete
on public.unit_occupancies
for each row execute function public.revoke_stale_tenant_membership_after_occupancy();
