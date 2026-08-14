begin;
select plan(4);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, created_at, updated_at
) values
  ('b1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pilot-admin@test.local', 'x', now(), now()),
  ('b1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pilot-tenant@test.local', 'x', now(), now());

insert into public.organizations (id, name, created_by) values
  ('b1100000-0000-0000-0000-000000000001', 'Pilot Org', 'b1000000-0000-0000-0000-000000000001');
insert into public.organization_memberships (organization_id, user_id, role) values
  ('b1100000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'organization_owner');
insert into public.condominiums (id, organization_id, name, created_by) values
  ('b1110000-0000-0000-0000-000000000001', 'b1100000-0000-0000-0000-000000000001', 'Pilot Condo', 'b1000000-0000-0000-0000-000000000001');
insert into public.condominium_memberships (condominium_id, user_id, role) values
  ('b1110000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'condominium_admin'),
  ('b1110000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'tenant');
insert into public.units (id, condominium_id, code, type, status, created_by) values
  ('b1111000-0000-0000-0000-000000000001', 'b1110000-0000-0000-0000-000000000001', 'P-01', 'apartment', 'active', 'b1000000-0000-0000-0000-000000000001');
insert into public.people (
  id, condominium_id, auth_user_id, first_name, last_name, email, status, created_by
) values (
  'b1112000-0000-0000-0000-000000000001', 'b1110000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000002', 'Pilot', 'Tenant', 'pilot-tenant@test.local', 'active',
  'b1000000-0000-0000-0000-000000000001'
);
insert into public.unit_occupancies (
  id, unit_id, person_id, occupancy_type, is_primary_contact, starts_at, created_by
) values (
  'b1113000-0000-0000-0000-000000000001', 'b1111000-0000-0000-0000-000000000001',
  'b1112000-0000-0000-0000-000000000001', 'tenant', true, current_date,
  'b1000000-0000-0000-0000-000000000001'
);

update public.unit_occupancies
set ends_at = current_date + 7
where id = 'b1113000-0000-0000-0000-000000000001';

select is(
  (select count(*) from public.condominium_memberships where condominium_id = 'b1110000-0000-0000-0000-000000000001' and user_id = 'b1000000-0000-0000-0000-000000000002' and role = 'tenant'),
  1::bigint,
  'future end date preserves tenant membership'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000002', true);
select is(public.can_read_unit('b1111000-0000-0000-0000-000000000001'), true, 'future end date preserves unit access');
reset role;

update public.unit_occupancies
set ends_at = current_date
where id = 'b1113000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000002', true);
select is(public.can_read_unit('b1111000-0000-0000-0000-000000000001'), true, 'end date is inclusive through today');
reset role;

update public.unit_occupancies
set ends_at = current_date - 1
where id = 'b1113000-0000-0000-0000-000000000001';
select is(
  (select count(*) from public.condominium_memberships where condominium_id = 'b1110000-0000-0000-0000-000000000001' and user_id = 'b1000000-0000-0000-0000-000000000002' and role = 'tenant'),
  0::bigint,
  'past end date revokes final tenant membership'
);

select * from finish();
rollback;
