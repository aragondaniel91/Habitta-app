-- HAB-PILOT-004 B1: register a first-class billable building without
-- changing the accounting target of any existing condominium.
--
-- IMPORTANT: the new enum value is not used in this same transaction.
-- B2 applies the guards in a separate timestamped migration.
alter type public.unit_type add value if not exists 'building';

create type public.condominium_charge_scope as enum ('unit', 'building');

alter table public.condominiums
  add column charge_scope public.condominium_charge_scope
    not null default 'unit';

-- Building-level quotas are allowed only for a general condominium with
-- multiple physical buildings. Houses and existing apartments stay unchanged.
alter table public.condominiums
  add constraint condominiums_charge_scope_topology_guard
  check (
    charge_scope = 'unit'
    or property_topology = 'multi_building_complex'
  );

-- No new table or function is exposed to the Data API. Existing RLS and
-- least-privilege table grants stay in force; no blanket anon grants.
