begin;
select plan(13);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, created_at, updated_at
) values
  ('a4000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab164-admin@test.local', 'x', now(), now()),
  ('a4000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab164-tenant@test.local', 'x', now(), now());

insert into public.organizations (id, name, created_by) values
  ('a4100000-0000-0000-0000-000000000001', 'HAB-164 Org A', 'a4000000-0000-0000-0000-000000000001'),
  ('a4200000-0000-0000-0000-000000000002', 'HAB-164 Org B', 'a4000000-0000-0000-0000-000000000001');

insert into public.organization_memberships (organization_id, user_id, role) values
  ('a4100000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'organization_owner'),
  ('a4200000-0000-0000-0000-000000000002', 'a4000000-0000-0000-0000-000000000001', 'organization_owner');

insert into public.condominiums (id, organization_id, name, created_by) values
  ('a4110000-0000-0000-0000-000000000001', 'a4100000-0000-0000-0000-000000000001', 'Condo HAB-164 A', 'a4000000-0000-0000-0000-000000000001'),
  ('a4220000-0000-0000-0000-000000000002', 'a4200000-0000-0000-0000-000000000002', 'Condo HAB-164 B', 'a4000000-0000-0000-0000-000000000001');

insert into public.condominium_memberships (condominium_id, user_id, role) values
  ('a4110000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'condominium_admin'),
  ('a4220000-0000-0000-0000-000000000002', 'a4000000-0000-0000-0000-000000000001', 'condominium_admin'),
  ('a4110000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000002', 'tenant');

insert into public.units (id, condominium_id, code, type, status, created_by) values
  ('a4111000-0000-0000-0000-000000000001', 'a4110000-0000-0000-0000-000000000001', 'A-01', 'apartment', 'active', 'a4000000-0000-0000-0000-000000000001'),
  ('a4111000-0000-0000-0000-000000000002', 'a4110000-0000-0000-0000-000000000001', 'A-02', 'apartment', 'active', 'a4000000-0000-0000-0000-000000000001'),
  ('a4111000-0000-0000-0000-000000000003', 'a4110000-0000-0000-0000-000000000001', 'A-03', 'apartment', 'active', 'a4000000-0000-0000-0000-000000000001'),
  ('a4221000-0000-0000-0000-000000000001', 'a4220000-0000-0000-0000-000000000002', 'B-01', 'apartment', 'active', 'a4000000-0000-0000-0000-000000000001');

insert into public.people (
  id, condominium_id, auth_user_id, first_name, last_name, email, status, created_by
) values (
  'a4112000-0000-0000-0000-000000000001',
  'a4110000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000002',
  'Tenant', 'Pilot', 'hab164-tenant@test.local', 'active',
  'a4000000-0000-0000-0000-000000000001'
);

insert into public.unit_occupancies (
  id, unit_id, person_id, occupancy_type, is_primary_contact, starts_at, created_by
) values
  ('a4113000-0000-0000-0000-000000000001', 'a4111000-0000-0000-0000-000000000001', 'a4112000-0000-0000-0000-000000000001', 'tenant', true, current_date, 'a4000000-0000-0000-0000-000000000001'),
  ('a4113000-0000-0000-0000-000000000002', 'a4111000-0000-0000-0000-000000000002', 'a4112000-0000-0000-0000-000000000001', 'tenant', false, current_date, 'a4000000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4000000-0000-0000-0000-000000000002', true);

select is(
  public.can_read_condominium('a4110000-0000-0000-0000-000000000001'),
  true,
  'tenant with active occupancy keeps condominium context'
);
select is(
  public.is_active_tenant_for_unit('a4110000-0000-0000-0000-000000000001', 'a4111000-0000-0000-0000-000000000001'),
  true,
  'tenant is active for first delegated unit'
);
select is(
  public.is_active_tenant_for_unit('a4110000-0000-0000-0000-000000000001', 'a4111000-0000-0000-0000-000000000002'),
  true,
  'tenant is active for second delegated unit'
);
select is(
  public.can_read_unit('a4111000-0000-0000-0000-000000000003'),
  false,
  'tenant cannot read another unit in the same condominium'
);
select is(
  (select count(*) from public.units where condominium_id = 'a4110000-0000-0000-0000-000000000001'),
  2::bigint,
  'unit RLS exposes only actively delegated units to tenant'
);
select is(
  public.can_read_condominium('a4220000-0000-0000-0000-000000000002'),
  false,
  'tenant cannot read another condominium'
);

reset role;

update public.unit_occupancies
set ends_at = current_date
where id = 'a4113000-0000-0000-0000-000000000001';

select is(
  (select count(*) from public.condominium_memberships
   where condominium_id = 'a4110000-0000-0000-0000-000000000001'
     and user_id = 'a4000000-0000-0000-0000-000000000002'
     and role = 'tenant'),
  1::bigint,
  'closing one of multiple active occupancies preserves tenant membership'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4000000-0000-0000-0000-000000000002', true);

select is(
  public.can_read_unit('a4111000-0000-0000-0000-000000000001'),
  false,
  'closed occupancy immediately removes access to that unit'
);
select is(
  public.can_read_unit('a4111000-0000-0000-0000-000000000002'),
  true,
  'remaining active occupancy keeps its own unit accessible'
);
select is(
  (select count(*) from public.units where condominium_id = 'a4110000-0000-0000-0000-000000000001'),
  1::bigint,
  'unit RLS contracts as tenant delegations end'
);

reset role;

update public.unit_occupancies
set ends_at = current_date
where id = 'a4113000-0000-0000-0000-000000000002';

select is(
  (select count(*) from public.condominium_memberships
   where condominium_id = 'a4110000-0000-0000-0000-000000000001'
     and user_id = 'a4000000-0000-0000-0000-000000000002'
     and role = 'tenant'),
  0::bigint,
  'closing the final active occupancy revokes stale tenant membership'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4000000-0000-0000-0000-000000000002', true);

select is(
  public.can_read_condominium('a4110000-0000-0000-0000-000000000001'),
  false,
  'tenant loses condominium delegation after final occupancy ends'
);
select is(
  (select count(*) from public.units where condominium_id = 'a4110000-0000-0000-0000-000000000001'),
  0::bigint,
  'tenant sees no delegated units after final occupancy ends'
);

select * from finish();
rollback;
