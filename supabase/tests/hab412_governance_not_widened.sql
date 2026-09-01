begin;
select plan(18);

-- HAB-412: governance must not widen when the condominium read capability widens.
--
-- `can_read_governance` used to be `select public.can_read_condominium(target)`. That delegation
-- was harmless while the two capabilities described the same audience. Admitting family members
-- and authorized occupants to the condominium made it a transitive grant of assemblies, proposals,
-- options, attachments, agenda items, resolutions and action items -- seven policies and five
-- functions, none of which this branch set out to touch.
--
-- Being someone's family is not a reason to see how the building votes. This file pins both
-- halves: the two new roles are refused, and the audience that had governance before still has it.

insert into auth.users(id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('41300000-0000-4000-8000-00000000000f', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'family@hab412g.test', 'x', now(), now()),
  ('41300000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'authorized@hab412g.test', 'x', now(), now()),
  ('41300000-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'both@hab412g.test', 'x', now(), now()),
  ('41300000-0000-4000-8000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@hab412g.test', 'x', now(), now()),
  ('41300000-0000-4000-8000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tenant@hab412g.test', 'x', now(), now()),
  ('41300000-0000-4000-8000-00000000000e', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'board@hab412g.test', 'x', now(), now()),
  ('41300000-0000-4000-8000-000000000010', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@hab412g.test', 'x', now(), now());

insert into public.organizations(id, name, created_by)
values ('41310000-0000-4000-8000-00000000000a', 'Org G', '41300000-0000-4000-8000-00000000000c');
insert into public.condominiums(id, organization_id, name, created_by)
values ('41320000-0000-4000-8000-00000000000a', '41310000-0000-4000-8000-00000000000a', 'Condo G', '41300000-0000-4000-8000-00000000000c');
insert into public.units(id, condominium_id, code, type, status, created_by)
values ('41330000-0000-4000-8000-00000000000a', '41320000-0000-4000-8000-00000000000a', '1A', 'apartment', 'active', '41300000-0000-4000-8000-00000000000c');

-- Every role gets a person, a live relationship and a membership, so each one is refused or
-- admitted on the merits rather than for want of a fixture.
insert into public.people(id, condominium_id, first_name, last_name, status, auth_user_id, created_by) values
  ('41340000-0000-4000-8000-00000000000f', '41320000-0000-4000-8000-00000000000a', 'Fam', 'Uno', 'active', '41300000-0000-4000-8000-00000000000f', '41300000-0000-4000-8000-00000000000c'),
  ('41340000-0000-4000-8000-00000000000a', '41320000-0000-4000-8000-00000000000a', 'Aut', 'Uno', 'active', '41300000-0000-4000-8000-00000000000a', '41300000-0000-4000-8000-00000000000c'),
  ('41340000-0000-4000-8000-00000000000b', '41320000-0000-4000-8000-00000000000a', 'Ambos', 'Uno', 'active', '41300000-0000-4000-8000-00000000000b', '41300000-0000-4000-8000-00000000000c'),
  ('41340000-0000-4000-8000-00000000000d', '41320000-0000-4000-8000-00000000000a', 'Inq', 'Uno', 'active', '41300000-0000-4000-8000-00000000000d', '41300000-0000-4000-8000-00000000000c');

insert into public.unit_occupancies(unit_id, person_id, occupancy_type, starts_at, created_by) values
  ('41330000-0000-4000-8000-00000000000a', '41340000-0000-4000-8000-00000000000f', 'family_member', current_date - 10, '41300000-0000-4000-8000-00000000000c'),
  ('41330000-0000-4000-8000-00000000000a', '41340000-0000-4000-8000-00000000000a', 'authorized_occupant', current_date - 10, '41300000-0000-4000-8000-00000000000c'),
  ('41330000-0000-4000-8000-00000000000a', '41340000-0000-4000-8000-00000000000b', 'family_member', current_date - 10, '41300000-0000-4000-8000-00000000000c'),
  ('41330000-0000-4000-8000-00000000000a', '41340000-0000-4000-8000-00000000000d', 'tenant', current_date - 10, '41300000-0000-4000-8000-00000000000c');

insert into public.condominium_memberships(condominium_id, user_id, role) values
  ('41320000-0000-4000-8000-00000000000a', '41300000-0000-4000-8000-00000000000f', 'family_member'),
  ('41320000-0000-4000-8000-00000000000a', '41300000-0000-4000-8000-00000000000a', 'authorized_occupant'),
  ('41320000-0000-4000-8000-00000000000a', '41300000-0000-4000-8000-00000000000b', 'family_member'),
  ('41320000-0000-4000-8000-00000000000a', '41300000-0000-4000-8000-00000000000b', 'authorized_occupant'),
  ('41320000-0000-4000-8000-00000000000a', '41300000-0000-4000-8000-00000000000c', 'owner'),
  ('41320000-0000-4000-8000-00000000000a', '41300000-0000-4000-8000-00000000000d', 'tenant'),
  ('41320000-0000-4000-8000-00000000000a', '41300000-0000-4000-8000-00000000000e', 'board_member'),
  ('41320000-0000-4000-8000-00000000000a', '41300000-0000-4000-8000-000000000010', 'condominium_admin');

insert into public.assemblies(id, condominium_id, title, scheduled_at, created_by, updated_by)
values ('41350000-0000-4000-8000-00000000000a', '41320000-0000-4000-8000-00000000000a', 'Asamblea G',
        now() + interval '10 days', '41300000-0000-4000-8000-000000000010', '41300000-0000-4000-8000-000000000010');

create or replace function pg_temp.as_user(who uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', who::text, 'role', 'authenticated')::text, true);
end;
$$;

set local role authenticated;

-- ------------------------------------------------------------------ refused

select pg_temp.as_user('41300000-0000-4000-8000-00000000000f');
select ok(not public.can_read_governance('41320000-0000-4000-8000-00000000000a'),
  'a family member cannot read governance');
-- The exclusion has to exist where the data is, not only in the helper.
select is((select count(*)::integer from public.assemblies
           where condominium_id = '41320000-0000-4000-8000-00000000000a'), 0,
  'a family member sees no assemblies');
select is((select count(*)::integer from public.governance_proposals
           where condominium_id = '41320000-0000-4000-8000-00000000000a'), 0,
  'a family member sees no proposals');
select throws_ok(
  $$select public.get_governance_eligibility('41320000-0000-4000-8000-00000000000a', null)$$,
  null, null, 'a family member cannot read governance eligibility');
select throws_ok(
  $$select public.get_governance_results('41320000-0000-4000-8000-00000000000a', null)$$,
  null, null, 'a family member cannot read governance results');

select pg_temp.as_user('41300000-0000-4000-8000-00000000000a');
select ok(not public.can_read_governance('41320000-0000-4000-8000-00000000000a'),
  'an authorized occupant cannot read governance');
select is((select count(*)::integer from public.assemblies
           where condominium_id = '41320000-0000-4000-8000-00000000000a'), 0,
  'an authorized occupant sees no assemblies');
select throws_ok(
  $$select public.get_governance_results('41320000-0000-4000-8000-00000000000a', null)$$,
  null, null, 'an authorized occupant cannot read governance results');

-- Holding both restricted roles is still no capability. Two zeros do not add up to one.
select pg_temp.as_user('41300000-0000-4000-8000-00000000000b');
select ok(not public.can_read_governance('41320000-0000-4000-8000-00000000000a'),
  'holding both restricted roles still cannot read governance');
select is((select count(*)::integer from public.assemblies
           where condominium_id = '41320000-0000-4000-8000-00000000000a'), 0,
  'holding both restricted roles still sees no assemblies');

-- Voting and the decision transitions are never acquired, whatever the read state.
select throws_ok(
  $$select public.cast_governance_vote('41320000-0000-4000-8000-00000000000a', null, null)$$,
  null, null, 'holding both restricted roles cannot cast a governance vote');

-- ------------------------------------------------------------------ preserved

select pg_temp.as_user('41300000-0000-4000-8000-00000000000c');
select ok(public.can_read_governance('41320000-0000-4000-8000-00000000000a'),
  'an owner keeps governance exactly as before');
select is((select count(*)::integer from public.assemblies
           where condominium_id = '41320000-0000-4000-8000-00000000000a'), 1,
  'an owner still sees the assembly');

select pg_temp.as_user('41300000-0000-4000-8000-00000000000d');
select ok(public.can_read_governance('41320000-0000-4000-8000-00000000000a'),
  'a tenant with an active occupancy keeps governance exactly as before');
select is((select count(*)::integer from public.assemblies
           where condominium_id = '41320000-0000-4000-8000-00000000000a'), 1,
  'a tenant still sees the assembly');

select pg_temp.as_user('41300000-0000-4000-8000-00000000000e');
select ok(public.can_read_governance('41320000-0000-4000-8000-00000000000a'),
  'a board member keeps governance');

select pg_temp.as_user('41300000-0000-4000-8000-000000000010');
select ok(public.can_read_governance('41320000-0000-4000-8000-00000000000a'),
  'a condominium admin keeps governance');

-- Stated structurally as well: the delegation that caused this must not come back.
reset role;
select ok(
  pg_get_functiondef('public.can_read_governance(uuid)'::regprocedure) not like '%can_read_condominium%',
  'governance no longer delegates to the condominium read capability'
);

select * from finish();
rollback;
