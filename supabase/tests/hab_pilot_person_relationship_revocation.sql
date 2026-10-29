begin;
select plan(20);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('23000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operator@hab23.test', 'x', now(), now()),
  ('23000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'former@hab23.test', 'x', now(), now()),
  ('23000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other@hab23.test', 'x', now(), now());

insert into public.organizations(id, name, created_by) values
  ('23100000-0000-4000-8000-000000000001', 'HAB 23 Org A', '23000000-0000-4000-8000-000000000001'),
  ('23100000-0000-4000-8000-000000000002', 'HAB 23 Org B', '23000000-0000-4000-8000-000000000001');
insert into public.condominiums(id, organization_id, name, created_by) values
  ('23200000-0000-4000-8000-000000000001', '23100000-0000-4000-8000-000000000001', 'HAB 23 Houses', '23000000-0000-4000-8000-000000000001'),
  ('23200000-0000-4000-8000-000000000002', '23100000-0000-4000-8000-000000000002', 'HAB 23 Other', '23000000-0000-4000-8000-000000000001');
insert into public.units(id, condominium_id, code, type, status, created_by) values
  ('23300000-0000-4000-8000-000000000001', '23200000-0000-4000-8000-000000000001', 'CASA-23', 'house', 'active', '23000000-0000-4000-8000-000000000001'),
  ('23300000-0000-4000-8000-000000000002', '23200000-0000-4000-8000-000000000002', 'CASA-OTRA', 'house', 'active', '23000000-0000-4000-8000-000000000001');
insert into public.people(id, condominium_id, auth_user_id, first_name, last_name, status, created_by) values
  ('23400000-0000-4000-8000-000000000001', '23200000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000002', 'Former', 'Resident', 'active', '23000000-0000-4000-8000-000000000001'),
  ('23400000-0000-4000-8000-000000000002', '23200000-0000-4000-8000-000000000002', '23000000-0000-4000-8000-000000000003', 'Other', 'Tenant', 'active', '23000000-0000-4000-8000-000000000001');
insert into public.condominium_memberships(condominium_id, user_id, role) values
  ('23200000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000002', 'owner'),
  ('23200000-0000-4000-8000-000000000002', '23000000-0000-4000-8000-000000000003', 'owner');
insert into public.unit_owners(id, unit_id, person_id, starts_at, created_by) values
  ('23500000-0000-4000-8000-000000000001', '23300000-0000-4000-8000-000000000001', '23400000-0000-4000-8000-000000000001', current_date - 10, '23000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '23000000-0000-4000-8000-000000000002', true);
select ok(public.can_read_unit('23300000-0000-4000-8000-000000000001'), 'active owner reads their real house unit');
select ok(public.can_read_condominium('23200000-0000-4000-8000-000000000001'), 'active owner reads current condominium');
select ok(public.can_read_financial_unit('23300000-0000-4000-8000-000000000001'), 'active owner reads current financial unit');
reset role;

update public.unit_owners set ends_at = current_date - 1 where id = '23500000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', '23000000-0000-4000-8000-000000000002', true);
select ok(not public.can_read_unit('23300000-0000-4000-8000-000000000001'), 'expired same-unit owner link immediately denies the authenticated unit read');
select ok(not public.can_read_financial_unit('23300000-0000-4000-8000-000000000001'), 'expired same-unit owner link immediately denies financial reads');
select ok(not public.can_read_condominium('23200000-0000-4000-8000-000000000001'), 'expired owner membership cannot retain condominium access');
select is((select count(*)::integer from public.units where id = '23300000-0000-4000-8000-000000000001'), 0, 'the authenticated units RLS read is revoked');
select is((select count(*)::integer from public.units where id = '23300000-0000-4000-8000-000000000002'), 0, 'former owner cannot cross tenant isolation');
reset role;

select is((select count(*)::integer from public.condominium_memberships where condominium_id = '23200000-0000-4000-8000-000000000001' and user_id = '23000000-0000-4000-8000-000000000002' and role = 'owner'), 0, 'ending the last effective owner link removes only owner membership');
insert into public.condominium_memberships(condominium_id, user_id, role) values
  ('23200000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000002', 'board_member');
select is((select count(*)::integer from public.condominium_memberships where condominium_id = '23200000-0000-4000-8000-000000000001' and user_id = '23000000-0000-4000-8000-000000000002' and role = 'board_member'), 1, 'ending owner link preserves unrelated board membership');
set local role authenticated;
select set_config('request.jwt.claim.sub', '23000000-0000-4000-8000-000000000002', true);
select ok(public.can_read_unit('23300000-0000-4000-8000-000000000001'), 'a current board role, not expired ownership, is the remaining grant');
reset role;
delete from public.condominium_memberships where condominium_id = '23200000-0000-4000-8000-000000000001' and user_id = '23000000-0000-4000-8000-000000000002' and role = 'board_member';
select is((select count(*)::integer from public.unit_owners where id = '23500000-0000-4000-8000-000000000001' and ends_at = current_date - 1), 1, 'ended ownership remains an auditable historic record');
select ok(not has_table_privilege('authenticated', 'public.unit_owners', 'DELETE'), 'authenticated users cannot hard-delete ownership history');

insert into public.unit_occupancies(id, unit_id, person_id, occupancy_type, starts_at, created_by) values
  ('23600000-0000-4000-8000-000000000001', '23300000-0000-4000-8000-000000000001', '23400000-0000-4000-8000-000000000001', 'authorized_occupant', current_date - 5, '23000000-0000-4000-8000-000000000001');
insert into public.condominium_memberships(condominium_id, user_id, role) values
  ('23200000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000002', 'authorized_occupant');
set local role authenticated;
select set_config('request.jwt.claim.sub', '23000000-0000-4000-8000-000000000002', true);
select ok(public.can_read_unit('23300000-0000-4000-8000-000000000001'), 'current authorized occupant can read their assigned house unit');
select ok(not public.can_read_financial_unit('23300000-0000-4000-8000-000000000001'), 'authorized occupant never receives financial access');
reset role;
update public.unit_occupancies set ends_at = current_date - 1 where id = '23600000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '23000000-0000-4000-8000-000000000002', true);
select ok(not public.can_read_unit('23300000-0000-4000-8000-000000000001'), 'expired authorized occupant link revokes current unit read');
select ok(not public.can_read_condominium('23200000-0000-4000-8000-000000000001'), 'expired authorized membership cannot retain condominium access');
reset role;
select is((select count(*)::integer from public.unit_occupancies where id = '23600000-0000-4000-8000-000000000001' and ends_at = current_date - 1), 1, 'ended authorized occupancy remains historical');
select is((select count(*)::integer from public.condominium_memberships where condominium_id = '23200000-0000-4000-8000-000000000001' and user_id = '23000000-0000-4000-8000-000000000002' and role = 'authorized_occupant'), 0, 'expired authorized link removes its matching membership only');
select ok(not public.can_read_unit('23300000-0000-4000-8000-000000000002'), 'former relationship cannot read a unit in another tenant');

select * from finish();
rollback;
