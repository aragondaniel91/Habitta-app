-- Pilot blocker #148: a tenant occupancy remains active through its ends_at date.
-- A future or current-date end must not revoke tenant access early.

create or replace function public.is_active_tenant_for_unit(
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
      and (uo.ends_at is null or uo.ends_at >= current_date)
      and u.condominium_id = target_condominium
      and u.status = 'active'
  );
$$;

create or replace function public.has_active_tenant_occupancy(target_condominium uuid)
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
      and (uo.ends_at is null or uo.ends_at >= current_date)
      and u.condominium_id = target_condominium
      and u.status = 'active'
  );
$$;

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
begin
  if old.occupancy_type <> 'tenant'::public.occupancy_type then
    return null;
  end if;

  -- Updating the same tenant occupancy to a current/future end date keeps it active.
  if tg_op = 'UPDATE'
     and new.occupancy_type = 'tenant'::public.occupancy_type
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
      and uo.occupancy_type = 'tenant'
      and (uo.ends_at is null or uo.ends_at >= current_date)
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

revoke execute on function public.is_active_tenant_for_unit(uuid,uuid) from public;
revoke execute on function public.has_active_tenant_occupancy(uuid) from public;
grant execute on function public.is_active_tenant_for_unit(uuid,uuid) to authenticated, service_role;
grant execute on function public.has_active_tenant_occupancy(uuid) to authenticated, service_role;

revoke all on function public.revoke_stale_tenant_membership_after_occupancy()
  from public, anon, authenticated, service_role;
