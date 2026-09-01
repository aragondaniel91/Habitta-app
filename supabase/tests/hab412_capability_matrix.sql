begin;
select plan(48);

-- HAB-412 capability matrix. Every row of the security model in issue #412, asserted.
--
-- The shape of the thing being defended: `family_member` and `authorized_occupant` are residential
-- relationships, not financial standing and not staff. They may know where they live and read what
-- the community publishes. They may not touch money, governance, or anybody else's unit -- and
-- holding one of them must never remove a capability somebody legitimately has for another reason.

-- ------------------------------------------------------------------ fixture

insert into auth.users(id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select ('41500000-0000-4000-8000-00000000000' || g)::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'u' || g || '@hab412m.test', 'x', now(), now()
from generate_series(1, 9) g;

insert into public.organizations(id, name, created_by) values
  ('41510000-0000-4000-8000-00000000000a', 'Org A', '41500000-0000-4000-8000-000000000001'),
  ('41510000-0000-4000-8000-00000000000b', 'Org B', '41500000-0000-4000-8000-000000000001');

insert into public.condominiums(id, organization_id, name, created_by) values
  ('41520000-0000-4000-8000-00000000000a', '41510000-0000-4000-8000-00000000000a', 'Condo A', '41500000-0000-4000-8000-000000000001'),
  ('41520000-0000-4000-8000-00000000000b', '41510000-0000-4000-8000-00000000000b', 'Condo B', '41500000-0000-4000-8000-000000000001');

insert into public.units(id, condominium_id, code, type, status, created_by) values
  ('41530000-0000-4000-8000-00000000000a', '41520000-0000-4000-8000-00000000000a', '1A', 'apartment', 'active', '41500000-0000-4000-8000-000000000001'),
  ('41530000-0000-4000-8000-00000000000b', '41520000-0000-4000-8000-00000000000a', '1B', 'apartment', 'active', '41500000-0000-4000-8000-000000000001'),
  ('41530000-0000-4000-8000-00000000000c', '41520000-0000-4000-8000-00000000000b', '2A', 'apartment', 'active', '41500000-0000-4000-8000-000000000001'),
  ('41530000-0000-4000-8000-00000000000d', '41520000-0000-4000-8000-00000000000a', '1C', 'apartment', 'inactive', '41500000-0000-4000-8000-000000000001');

-- user 1 family-only, 2 authorized-only, 3 both, 4 owner+family, 5 tenant+family,
-- 6 tenant+authorized, 7 admin+family, 8 accountant+authorized, 9 family in Condo B
insert into public.people(id, condominium_id, first_name, last_name, status, auth_user_id, created_by)
select ('41540000-0000-4000-8000-00000000000' || g)::uuid,
       (case when g = 9 then '41520000-0000-4000-8000-00000000000b'
             else '41520000-0000-4000-8000-00000000000a' end)::uuid,
       'P' || g, 'Apellido', 'active',
       ('41500000-0000-4000-8000-00000000000' || g)::uuid,
       '41500000-0000-4000-8000-000000000001'
from generate_series(1, 9) g;

insert into public.unit_occupancies(unit_id, person_id, occupancy_type, starts_at, created_by) values
  ('41530000-0000-4000-8000-00000000000a', '41540000-0000-4000-8000-000000000001', 'family_member', current_date - 10, '41500000-0000-4000-8000-000000000001'),
  ('41530000-0000-4000-8000-00000000000a', '41540000-0000-4000-8000-000000000002', 'authorized_occupant', current_date - 10, '41500000-0000-4000-8000-000000000001'),
  ('41530000-0000-4000-8000-00000000000a', '41540000-0000-4000-8000-000000000003', 'family_member', current_date - 10, '41500000-0000-4000-8000-000000000001'),
  ('41530000-0000-4000-8000-00000000000a', '41540000-0000-4000-8000-000000000004', 'family_member', current_date - 10, '41500000-0000-4000-8000-000000000001'),
  ('41530000-0000-4000-8000-00000000000a', '41540000-0000-4000-8000-000000000005', 'tenant', current_date - 10, '41500000-0000-4000-8000-000000000001'),
  ('41530000-0000-4000-8000-00000000000a', '41540000-0000-4000-8000-000000000006', 'tenant', current_date - 10, '41500000-0000-4000-8000-000000000001'),
  ('41530000-0000-4000-8000-00000000000a', '41540000-0000-4000-8000-000000000007', 'family_member', current_date - 10, '41500000-0000-4000-8000-000000000001'),
  ('41530000-0000-4000-8000-00000000000a', '41540000-0000-4000-8000-000000000008', 'authorized_occupant', current_date - 10, '41500000-0000-4000-8000-000000000001'),
  ('41530000-0000-4000-8000-00000000000c', '41540000-0000-4000-8000-000000000009', 'family_member', current_date - 10, '41500000-0000-4000-8000-000000000001');

insert into public.unit_owners(unit_id, person_id, created_by)
values ('41530000-0000-4000-8000-00000000000a', '41540000-0000-4000-8000-000000000004', '41500000-0000-4000-8000-000000000001');

insert into public.condominium_memberships(condominium_id, user_id, role) values
  ('41520000-0000-4000-8000-00000000000a', '41500000-0000-4000-8000-000000000001', 'family_member'),
  ('41520000-0000-4000-8000-00000000000a', '41500000-0000-4000-8000-000000000002', 'authorized_occupant'),
  ('41520000-0000-4000-8000-00000000000a', '41500000-0000-4000-8000-000000000003', 'family_member'),
  ('41520000-0000-4000-8000-00000000000a', '41500000-0000-4000-8000-000000000003', 'authorized_occupant'),
  ('41520000-0000-4000-8000-00000000000a', '41500000-0000-4000-8000-000000000004', 'owner'),
  ('41520000-0000-4000-8000-00000000000a', '41500000-0000-4000-8000-000000000004', 'family_member'),
  ('41520000-0000-4000-8000-00000000000a', '41500000-0000-4000-8000-000000000005', 'tenant'),
  ('41520000-0000-4000-8000-00000000000a', '41500000-0000-4000-8000-000000000005', 'family_member'),
  ('41520000-0000-4000-8000-00000000000a', '41500000-0000-4000-8000-000000000006', 'tenant'),
  ('41520000-0000-4000-8000-00000000000a', '41500000-0000-4000-8000-000000000006', 'authorized_occupant'),
  ('41520000-0000-4000-8000-00000000000a', '41500000-0000-4000-8000-000000000007', 'condominium_admin'),
  ('41520000-0000-4000-8000-00000000000a', '41500000-0000-4000-8000-000000000007', 'family_member'),
  ('41520000-0000-4000-8000-00000000000a', '41500000-0000-4000-8000-000000000008', 'accountant'),
  ('41520000-0000-4000-8000-00000000000a', '41500000-0000-4000-8000-000000000008', 'authorized_occupant'),
  ('41520000-0000-4000-8000-00000000000b', '41500000-0000-4000-8000-000000000009', 'family_member');

create or replace function pg_temp.as_user(who text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', who, 'role', 'authenticated')::text, true);
end;
$$;

set local role authenticated;

-- ------------------------------------------------------------------ family only

select pg_temp.as_user('41500000-0000-4000-8000-000000000001');
select ok(public.can_read_condominium('41520000-0000-4000-8000-00000000000a'), 'family only reads its condominium');
select ok(public.can_read_unit('41530000-0000-4000-8000-00000000000a'), 'family only reads its own unit');
select ok(not public.can_read_unit('41530000-0000-4000-8000-00000000000b'), 'family only cannot read another unit in the same condominium');
select ok(not public.can_read_financial_unit('41530000-0000-4000-8000-00000000000a'), 'family only has no financial unit access');
select ok(not public.can_submit_payment('41530000-0000-4000-8000-00000000000a'), 'family only cannot submit a payment');
select ok(not public.can_read_governance('41520000-0000-4000-8000-00000000000a'), 'family only has no governance');
select ok(not public.can_create_service_request('41520000-0000-4000-8000-00000000000a'), 'family only cannot create a service request');
select ok(public.is_restricted_resident_only_for_condominium('41520000-0000-4000-8000-00000000000a'), 'family only is a restricted resident');
select ok(not public.can_read_expenses('41520000-0000-4000-8000-00000000000a'), 'family only reads no expenses');
select ok(not public.can_read_receivables('41520000-0000-4000-8000-00000000000a'), 'family only reads no receivables');

-- ------------------------------------------------------------------ authorized only

select pg_temp.as_user('41500000-0000-4000-8000-000000000002');
select ok(public.can_read_condominium('41520000-0000-4000-8000-00000000000a'), 'authorized only reads its condominium');
select ok(public.can_read_unit('41530000-0000-4000-8000-00000000000a'), 'authorized only reads its own unit');
select ok(not public.can_read_financial_unit('41530000-0000-4000-8000-00000000000a'), 'authorized only has no financial unit access');
select ok(not public.can_submit_payment('41530000-0000-4000-8000-00000000000a'), 'authorized only cannot submit a payment');
select ok(not public.can_read_governance('41520000-0000-4000-8000-00000000000a'), 'authorized only has no governance');
select ok(not public.can_create_service_request('41520000-0000-4000-8000-00000000000a'), 'authorized only cannot create a service request');

-- ------------------------------------------------------------------ both restricted roles

select pg_temp.as_user('41500000-0000-4000-8000-000000000003');
select ok(not public.can_read_financial_unit('41530000-0000-4000-8000-00000000000a'), 'two restricted roles are still no financial standing');
select ok(not public.can_submit_payment('41530000-0000-4000-8000-00000000000a'), 'two restricted roles still cannot submit a payment');
select ok(public.is_restricted_resident_only_for_condominium('41520000-0000-4000-8000-00000000000a'), 'two restricted roles remain restricted');

-- ------------------------------------------------------------------ owner + family

select pg_temp.as_user('41500000-0000-4000-8000-000000000004');
select ok(public.can_read_financial_unit('41530000-0000-4000-8000-00000000000a'), 'an owner keeps financial access when also family');
select ok(public.can_submit_payment('41530000-0000-4000-8000-00000000000a'), 'an owner keeps payment submission when also family');
select ok(public.can_read_governance('41520000-0000-4000-8000-00000000000a'), 'an owner keeps governance when also family');
select ok(not public.is_restricted_resident_only_for_condominium('41520000-0000-4000-8000-00000000000a'), 'an owner is never a restricted resident');

-- ------------------------------------------------------------------ tenant + family, tenant + authorized
--
-- The sixth vector. `is_tenant_only` used to be "has a tenant membership and something that is not
-- tenant", so handing a tenant a family membership turned it false and switched off the read-only
-- triggers that depend on it. A restricted role adds no capability, so it can remove no restriction.

select pg_temp.as_user('41500000-0000-4000-8000-000000000005');
select ok(public.is_tenant_only_for_condominium('41520000-0000-4000-8000-00000000000a'), 'tenant + family is still tenant-only');
select ok(public.is_restricted_resident_only_for_condominium('41520000-0000-4000-8000-00000000000a'), 'tenant + family is still restricted');
select ok(not public.can_submit_payment('41530000-0000-4000-8000-00000000000a'), 'tenant + family still cannot submit a payment');
-- Identical to tenant-only, in both directions. A tenant with a live occupancy could always create
-- requests, so the contract is that the family role neither grants this nor takes it away. Family
-- on its own is refused a few assertions above, which is what shows where the capability comes from.
select ok(public.can_create_service_request('41520000-0000-4000-8000-00000000000a'), 'tenant + family creates requests exactly as a tenant does, through the tenant relationship');

select pg_temp.as_user('41500000-0000-4000-8000-000000000006');
select ok(public.is_tenant_only_for_condominium('41520000-0000-4000-8000-00000000000a'), 'tenant + authorized is still tenant-only');
select ok(not public.can_submit_payment('41530000-0000-4000-8000-00000000000a'), 'tenant + authorized still cannot submit a payment');

-- ------------------------------------------------------------------ staff + restricted role
--
-- The other direction: a restricted residential role must never take a capability away.

select pg_temp.as_user('41500000-0000-4000-8000-000000000007');
select ok(public.can_submit_payment('41530000-0000-4000-8000-00000000000a'), 'an administrator who is also family keeps payment capability');
select ok(public.can_read_governance('41520000-0000-4000-8000-00000000000a'), 'an administrator who is also family keeps governance');
select ok(public.can_create_service_request('41520000-0000-4000-8000-00000000000a'), 'an administrator who is also family keeps request creation');
select ok(not public.is_restricted_resident_only_for_condominium('41520000-0000-4000-8000-00000000000a'), 'an administrator is never a restricted resident');

select pg_temp.as_user('41500000-0000-4000-8000-000000000008');
select ok(public.can_read_receivables('41520000-0000-4000-8000-00000000000a'), 'an accountant who is also an authorized occupant keeps receivables');
select ok(public.can_read_expenses('41520000-0000-4000-8000-00000000000a'), 'an accountant who is also an authorized occupant keeps expenses');
select ok(not public.is_restricted_resident_only_for_condominium('41520000-0000-4000-8000-00000000000a'), 'an accountant is never a restricted resident');

-- ------------------------------------------------------------------ cross-condominium

select pg_temp.as_user('41500000-0000-4000-8000-000000000009');
select ok(public.can_read_condominium('41520000-0000-4000-8000-00000000000b'), 'a family member reads their own condominium');
select ok(not public.can_read_condominium('41520000-0000-4000-8000-00000000000a'), 'a family member of one condominium cannot read another');
select ok(not public.can_read_unit('41530000-0000-4000-8000-00000000000a'), 'a family member cannot read a unit in another condominium');
select is((select count(*)::integer from public.condominiums where id = '41520000-0000-4000-8000-00000000000a'), 0,
  'the other condominium is not even visible as a row');
select is((select count(*)::integer from public.units where condominium_id = '41520000-0000-4000-8000-00000000000a'), 0,
  'no unit of the other condominium is visible');

-- ------------------------------------------------------------------ the relationship must be live

reset role;

-- A membership with no relationship behind it. This is the stale-membership case, and it is also
-- what an old JWT amounts to: the session is still valid, the relationship is not.
delete from public.unit_occupancies
where person_id = '41540000-0000-4000-8000-000000000001'
  and occupancy_type = 'family_member';

set local role authenticated;
select pg_temp.as_user('41500000-0000-4000-8000-000000000001');
select ok(not public.can_read_condominium('41520000-0000-4000-8000-00000000000a'),
  'a membership with no live relationship reads nothing, which is also what a stale token buys');
select ok(not public.can_read_unit('41530000-0000-4000-8000-00000000000a'),
  'a membership with no live relationship cannot name the unit either');

-- Future, expired, inactive person and inactive unit, each one on its own.
reset role;
insert into public.unit_occupancies(unit_id, person_id, occupancy_type, starts_at, created_by)
values ('41530000-0000-4000-8000-00000000000a', '41540000-0000-4000-8000-000000000001', 'family_member', current_date + 5, '41500000-0000-4000-8000-000000000001');
set local role authenticated;
select pg_temp.as_user('41500000-0000-4000-8000-000000000001');
select ok(not public.can_read_condominium('41520000-0000-4000-8000-00000000000a'), 'a relationship starting in the future is not active today');

reset role;
update public.unit_occupancies set starts_at = current_date - 30, ends_at = current_date - 1
where person_id = '41540000-0000-4000-8000-000000000001' and occupancy_type = 'family_member';
set local role authenticated;
select pg_temp.as_user('41500000-0000-4000-8000-000000000001');
select ok(not public.can_read_condominium('41520000-0000-4000-8000-00000000000a'), 'an expired relationship grants nothing');

reset role;
update public.unit_occupancies set ends_at = null
where person_id = '41540000-0000-4000-8000-000000000001' and occupancy_type = 'family_member';
update public.people set status = 'inactive' where id = '41540000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.as_user('41500000-0000-4000-8000-000000000001');
select ok(not public.can_read_condominium('41520000-0000-4000-8000-00000000000a'), 'an inactive person grants nothing');

reset role;
update public.people set status = 'active' where id = '41540000-0000-4000-8000-000000000001';
update public.units set status = 'inactive' where id = '41530000-0000-4000-8000-00000000000a';
set local role authenticated;
select pg_temp.as_user('41500000-0000-4000-8000-000000000001');
select ok(not public.can_read_condominium('41520000-0000-4000-8000-00000000000a'), 'an inactive unit grants nothing');
select ok(not public.can_read_unit('41530000-0000-4000-8000-00000000000a'), 'an inactive unit cannot be named');

reset role;
select * from finish();
rollback;
