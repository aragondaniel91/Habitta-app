-- HAB-PILOT-004 B2: identity and topology guards for one billable unit
-- per physical building. No financial postings or existing row rewrites.

-- A building may be charged once (one immutable public.units.id).
-- Different buildings remain independent even when their names repeat.
create unique index units_one_billable_account_per_building
  on public.units (condominium_id, building_id)
  where type = 'building' and building_id is not null;

create or replace function public.guard_building_billing_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  configured_scope public.condominium_charge_scope;
  configured_topology public.condominium_property_topology;
begin
  select c.charge_scope, c.property_topology
    into configured_scope, configured_topology
  from public.condominiums c
  where c.id = new.condominium_id
  for share; -- serialize account creation against charge-scope changes

  if configured_scope is null then
    raise exception using errcode = '23514',
      message = 'billable condominium not found';
  end if;

  if new.type = 'building' then
    if configured_scope <> 'building'
       or configured_topology <> 'multi_building_complex' then
      raise exception using errcode = '23514',
        message = 'building billing requires multi-building general condominium scope';
    end if;

    if new.building_id is null then
      raise exception using errcode = '23514',
        message = 'billable building unit needs a physical building';
    end if;

    -- Cross-tenant physical building references are already rejected by
    -- hab209_units_match_topology and units_building_tenant_guard; do not
    -- duplicate their validation or change their established error contract.
    -- Freeze the fiscal identity. Editing the visible name or archiving remains
    -- possible, but linking historical obligations to a different building is not.
    if tg_op = 'UPDATE' then
      if old.type is distinct from new.type
         or old.building_id is distinct from new.building_id
         or old.condominium_id is distinct from new.condominium_id then
        raise exception using errcode = '23514',
          message = 'billable building identity is immutable';
      end if;
    end if;
  else
    if configured_scope = 'building' then
      raise exception using errcode = '23514',
        message = 'building billing cannot contain direct apartment or house accounts';
    end if;

    if tg_op = 'UPDATE' then
      if old.type = 'building' then
        raise exception using errcode = '23514',
          message = 'billable building identity is immutable';
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_building_billing_identity()
  from public, anon, authenticated;

drop trigger if exists hab_billable_building_identity on public.units;
create trigger hab_billable_building_identity
  before insert or update of type, building_id, condominium_id on public.units
  for each row execute function public.guard_building_billing_identity();

-- Once an account exists, changing billing granularity could reassign debt
-- semantics. Explicitly forbid such conversions until a separate reviewed
-- accounting migration is designed for the customer's ledger.
create or replace function public.guard_condominium_charge_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if old.charge_scope is distinct from new.charge_scope and exists (
    select 1 from public.units u where u.condominium_id = new.id
  ) then
    raise exception using errcode = '23514',
      message = 'charge scope cannot change after units exist';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_condominium_charge_scope()
  from public, anon, authenticated;

drop trigger if exists hab_charge_scope_change_guard on public.condominiums;
create trigger hab_charge_scope_change_guard
  before update of charge_scope on public.condominiums
  for each row execute function public.guard_condominium_charge_scope();

-- This migration adds no exposed tables/functions and expands no Data API
-- grants. Existing protected units and condominiums retain their RLS policies.
