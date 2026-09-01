begin;
select plan(29);

-- HAB-412: the invitation lifecycle, the revocation rules, and the read-only guards.
--
-- The invitation is the only door through which these two roles get a membership, so the door is
-- what gets tested: the relationship must exist and match exactly when the token is minted, and it
-- must still exist and still match when the token is used. Everything in between -- the token
-- ageing, the relationship ending, its type changing, the person going inactive -- has to close it.

insert into auth.users(id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('41600000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@hab412i.test', 'x', now(), now()),
  ('41600000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fam@hab412i.test', 'x', now(), now()),
  ('41600000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'aut@hab412i.test', 'x', now(), now()),
  ('41600000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'otro@hab412i.test', 'x', now(), now());

insert into public.organizations(id, name, created_by)
values ('41610000-0000-4000-8000-000000000001', 'Org I', '41600000-0000-4000-8000-000000000001');
insert into public.condominiums(id, organization_id, name, created_by)
values ('41620000-0000-4000-8000-000000000001', '41610000-0000-4000-8000-000000000001', 'Condo I', '41600000-0000-4000-8000-000000000001');
insert into public.units(id, condominium_id, code, type, status, created_by) values
  ('41630000-0000-4000-8000-000000000001', '41620000-0000-4000-8000-000000000001', '1A', 'apartment', 'active', '41600000-0000-4000-8000-000000000001'),
  ('41630000-0000-4000-8000-000000000002', '41620000-0000-4000-8000-000000000001', '1B', 'apartment', 'active', '41600000-0000-4000-8000-000000000001');

insert into public.condominium_memberships(condominium_id, user_id, role)
values ('41620000-0000-4000-8000-000000000001', '41600000-0000-4000-8000-000000000001', 'condominium_admin');

insert into public.people(id, condominium_id, first_name, last_name, status, email, created_by) values
  ('41640000-0000-4000-8000-000000000002', '41620000-0000-4000-8000-000000000001', 'Fam', 'Uno', 'active', 'fam@hab412i.test', '41600000-0000-4000-8000-000000000001'),
  ('41640000-0000-4000-8000-000000000003', '41620000-0000-4000-8000-000000000001', 'Aut', 'Uno', 'active', 'aut@hab412i.test', '41600000-0000-4000-8000-000000000001');

insert into public.unit_occupancies(unit_id, person_id, occupancy_type, starts_at, created_by) values
  ('41630000-0000-4000-8000-000000000001', '41640000-0000-4000-8000-000000000002', 'family_member', current_date - 5, '41600000-0000-4000-8000-000000000001'),
  ('41630000-0000-4000-8000-000000000001', '41640000-0000-4000-8000-000000000003', 'authorized_occupant', current_date - 5, '41600000-0000-4000-8000-000000000001');

create or replace function pg_temp.as_user(who text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', who, 'role', 'authenticated')::text, true);
end;
$$;

create or replace function pg_temp.invite(person uuid, unit uuid, want public.condominium_role)
returns text language plpgsql as $$
declare payload jsonb;
begin
  payload := public.create_resident_invitation(
    '41620000-0000-4000-8000-000000000001'::uuid, person, unit, want, null);
  return payload ->> 'raw_token';
end;
$$;

set local role authenticated;
select pg_temp.as_user('41600000-0000-4000-8000-000000000001');

-- ------------------------------------------------------------------ creation

select lives_ok(
  $$select pg_temp.invite('41640000-0000-4000-8000-000000000002', '41630000-0000-4000-8000-000000000001', 'family_member')$$,
  'a family invitation is allowed where the family relationship exists');
select lives_ok(
  $$select pg_temp.invite('41640000-0000-4000-8000-000000000003', '41630000-0000-4000-8000-000000000001', 'authorized_occupant')$$,
  'an authorized-occupant invitation is allowed where that relationship exists');

-- Cross-mapping, both directions. The relationship type and the invited role have to be the same
-- thing; being an authorized occupant is not a weaker kind of family.
select throws_ok(
  $$select pg_temp.invite('41640000-0000-4000-8000-000000000003', '41630000-0000-4000-8000-000000000001', 'family_member')$$,
  null, null, 'an authorized occupant cannot be invited as family');
select throws_ok(
  $$select pg_temp.invite('41640000-0000-4000-8000-000000000002', '41630000-0000-4000-8000-000000000001', 'authorized_occupant')$$,
  null, null, 'a family member cannot be invited as an authorized occupant');
select throws_ok(
  $$select pg_temp.invite('41640000-0000-4000-8000-000000000002', '41630000-0000-4000-8000-000000000001', 'tenant')$$,
  null, null, 'a family relationship does not satisfy a tenant invitation');

-- Wrong unit, and no relationship at all.
select throws_ok(
  $$select pg_temp.invite('41640000-0000-4000-8000-000000000002', '41630000-0000-4000-8000-000000000002', 'family_member')$$,
  null, null, 'a family invitation for the wrong unit is refused');

-- Future and expired relationships are not relationships you can be invited into.
update public.unit_occupancies set starts_at = current_date + 3
where person_id = '41640000-0000-4000-8000-000000000002';
select throws_ok(
  $$select pg_temp.invite('41640000-0000-4000-8000-000000000002', '41630000-0000-4000-8000-000000000001', 'family_member')$$,
  null, null, 'a relationship starting in the future cannot be invited');

update public.unit_occupancies set starts_at = current_date - 30, ends_at = current_date - 1
where person_id = '41640000-0000-4000-8000-000000000002';
select throws_ok(
  $$select pg_temp.invite('41640000-0000-4000-8000-000000000002', '41630000-0000-4000-8000-000000000001', 'family_member')$$,
  null, null, 'an expired relationship cannot be invited');

update public.unit_occupancies set starts_at = current_date - 5, ends_at = null
where person_id = '41640000-0000-4000-8000-000000000002';

-- ------------------------------------------------------------------ acceptance

select set_config('hab412.family_token',
  pg_temp.invite('41640000-0000-4000-8000-000000000002', '41630000-0000-4000-8000-000000000001', 'family_member'), true);

-- The wrong person cannot spend somebody else's token, however valid it is.
select pg_temp.as_user('41600000-0000-4000-8000-000000000004');
select throws_ok(
  format($$select public.accept_invitation(%L)$$, current_setting('hab412.family_token')),
  null, null, 'an invitation cannot be accepted by a different authenticated user');

select pg_temp.as_user('41600000-0000-4000-8000-000000000002');
select lives_ok(
  format($$select public.accept_invitation(%L)$$, current_setting('hab412.family_token')),
  'the invited family member accepts their own invitation');

select is(
  (select count(*)::integer from public.condominium_memberships
   where condominium_id = '41620000-0000-4000-8000-000000000001'
     and user_id = '41600000-0000-4000-8000-000000000002'
     and role = 'family_member'),
  1, 'acceptance creates exactly the family membership');
select is(
  (select auth_user_id from public.people where id = '41640000-0000-4000-8000-000000000002'),
  '41600000-0000-4000-8000-000000000002'::uuid,
  'acceptance binds the person to the authenticated user');
select is(
  (select count(*)::integer from public.condominium_memberships
   where user_id = '41600000-0000-4000-8000-000000000002'
     and role <> 'family_member'),
  0, 'acceptance creates no other membership');

-- A token is spent once.
select throws_ok(
  format($$select public.accept_invitation(%L)$$, current_setting('hab412.family_token')),
  null, null, 'the same token cannot be accepted twice');

-- ------------------------------------------------------------------ the relationship changing under a live token

select pg_temp.as_user('41600000-0000-4000-8000-000000000001');
select set_config('hab412.aut_token',
  pg_temp.invite('41640000-0000-4000-8000-000000000003', '41630000-0000-4000-8000-000000000001', 'authorized_occupant'), true);

-- Type changed after the token was minted. The token still exists, the person still lives there,
-- and it must still fail, because the invitation was for a different standing.
reset role;
update public.unit_occupancies set occupancy_type = 'family_member'
where person_id = '41640000-0000-4000-8000-000000000003';
set local role authenticated;
select pg_temp.as_user('41600000-0000-4000-8000-000000000003');
select throws_ok(
  format($$select public.accept_invitation(%L)$$, current_setting('hab412.aut_token')),
  null, null, 'a token cannot be accepted after the relationship changed type');

reset role;
update public.unit_occupancies set occupancy_type = 'authorized_occupant'
where person_id = '41640000-0000-4000-8000-000000000003';
update public.unit_occupancies set ends_at = current_date - 1
where person_id = '41640000-0000-4000-8000-000000000003';
set local role authenticated;
select pg_temp.as_user('41600000-0000-4000-8000-000000000003');
select throws_ok(
  format($$select public.accept_invitation(%L)$$, current_setting('hab412.aut_token')),
  null, null, 'a token cannot be accepted after the relationship ended');

reset role;
update public.unit_occupancies set ends_at = null where person_id = '41640000-0000-4000-8000-000000000003';
delete from public.unit_occupancies where person_id = '41640000-0000-4000-8000-000000000003';
set local role authenticated;
select pg_temp.as_user('41600000-0000-4000-8000-000000000003');
select throws_ok(
  format($$select public.accept_invitation(%L)$$, current_setting('hab412.aut_token')),
  null, null, 'a token cannot be accepted after the relationship was deleted');

reset role;
insert into public.unit_occupancies(unit_id, person_id, occupancy_type, starts_at, created_by)
values ('41630000-0000-4000-8000-000000000001', '41640000-0000-4000-8000-000000000003', 'authorized_occupant', current_date - 5, '41600000-0000-4000-8000-000000000001');
update public.people set status = 'inactive' where id = '41640000-0000-4000-8000-000000000003';
set local role authenticated;
select pg_temp.as_user('41600000-0000-4000-8000-000000000003');
select throws_ok(
  format($$select public.accept_invitation(%L)$$, current_setting('hab412.aut_token')),
  null, null, 'a token cannot be accepted once the person is inactive');

reset role;
update public.people set status = 'active' where id = '41640000-0000-4000-8000-000000000003';
update public.units set status = 'inactive' where id = '41630000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.as_user('41600000-0000-4000-8000-000000000003');
select throws_ok(
  format($$select public.accept_invitation(%L)$$, current_setting('hab412.aut_token')),
  null, null, 'a token cannot be accepted once the unit is inactive');

reset role;
update public.units set status = 'active' where id = '41630000-0000-4000-8000-000000000001';

-- Revoked and expired tokens.
set local role authenticated;
select pg_temp.as_user('41600000-0000-4000-8000-000000000001');
update public.invitations set status = 'revoked', revoked_at = now()
where email = 'aut@hab412i.test' and status = 'pending';
select pg_temp.as_user('41600000-0000-4000-8000-000000000003');
select throws_ok(
  format($$select public.accept_invitation(%L)$$, current_setting('hab412.aut_token')),
  null, null, 'a revoked token cannot be accepted');

select pg_temp.as_user('41600000-0000-4000-8000-000000000001');
select set_config('hab412.exp_token',
  pg_temp.invite('41640000-0000-4000-8000-000000000003', '41630000-0000-4000-8000-000000000001', 'authorized_occupant'), true);
reset role;
update public.invitations set expires_at = now() - interval '1 hour'
where email = 'aut@hab412i.test' and status = 'pending';
set local role authenticated;
select pg_temp.as_user('41600000-0000-4000-8000-000000000003');
select throws_ok(
  format($$select public.accept_invitation(%L)$$, current_setting('hab412.exp_token')),
  null, null, 'an expired token cannot be accepted');

-- ------------------------------------------------------------------ revocation

reset role;

-- A second family relationship for the same person, so closing one does not end the standing.
insert into public.unit_occupancies(unit_id, person_id, occupancy_type, starts_at, created_by)
values ('41630000-0000-4000-8000-000000000002', '41640000-0000-4000-8000-000000000002', 'family_member', current_date - 5, '41600000-0000-4000-8000-000000000001');

update public.unit_occupancies set ends_at = current_date - 1
where person_id = '41640000-0000-4000-8000-000000000002'
  and unit_id = '41630000-0000-4000-8000-000000000001';

select is(
  (select count(*)::integer from public.condominium_memberships
   where user_id = '41600000-0000-4000-8000-000000000002' and role = 'family_member'),
  1, 'closing one of two family relationships keeps the membership');

update public.unit_occupancies set ends_at = current_date - 1
where person_id = '41640000-0000-4000-8000-000000000002'
  and unit_id = '41630000-0000-4000-8000-000000000002';

select is(
  (select count(*)::integer from public.condominium_memberships
   where user_id = '41600000-0000-4000-8000-000000000002' and role = 'family_member'),
  0, 'closing the last family relationship removes the family membership');

-- Independence: the two residential roles, and everything else, are separate memberships. The
-- closed rows above still occupy their unique key, so they are cleared before fresh ones land.
delete from public.unit_occupancies where person_id = '41640000-0000-4000-8000-000000000002';

insert into public.unit_occupancies(unit_id, person_id, occupancy_type, starts_at, created_by) values
  ('41630000-0000-4000-8000-000000000001', '41640000-0000-4000-8000-000000000002', 'family_member', current_date - 5, '41600000-0000-4000-8000-000000000001'),
  ('41630000-0000-4000-8000-000000000001', '41640000-0000-4000-8000-000000000002', 'authorized_occupant', current_date - 5, '41600000-0000-4000-8000-000000000001');
insert into public.condominium_memberships(condominium_id, user_id, role) values
  ('41620000-0000-4000-8000-000000000001', '41600000-0000-4000-8000-000000000002', 'family_member'),
  ('41620000-0000-4000-8000-000000000001', '41600000-0000-4000-8000-000000000002', 'authorized_occupant'),
  ('41620000-0000-4000-8000-000000000001', '41600000-0000-4000-8000-000000000002', 'owner')
on conflict do nothing;

delete from public.unit_occupancies
where person_id = '41640000-0000-4000-8000-000000000002' and occupancy_type = 'family_member';

select is(
  (select count(*)::integer from public.condominium_memberships
   where user_id = '41600000-0000-4000-8000-000000000002' and role = 'family_member'),
  0, 'ending the family relationship removes the family membership');
select is(
  (select count(*)::integer from public.condominium_memberships
   where user_id = '41600000-0000-4000-8000-000000000002' and role = 'authorized_occupant'),
  1, 'and leaves the authorized-occupant membership alone');
select is(
  (select count(*)::integer from public.condominium_memberships
   where user_id = '41600000-0000-4000-8000-000000000002' and role = 'owner'),
  1, 'and never touches an owner membership');

-- ------------------------------------------------------------------ read-only guards
--
-- Point seven: the triggers, not only the helpers. Whatever path a caller finds, the write fails.

insert into public.people(id, condominium_id, first_name, last_name, status, auth_user_id, created_by)
values ('41640000-0000-4000-8000-000000000009', '41620000-0000-4000-8000-000000000001', 'Solo', 'Fam', 'active', '41600000-0000-4000-8000-000000000004', '41600000-0000-4000-8000-000000000001');
insert into public.unit_occupancies(unit_id, person_id, occupancy_type, starts_at, created_by)
values ('41630000-0000-4000-8000-000000000001', '41640000-0000-4000-8000-000000000009', 'family_member', current_date - 5, '41600000-0000-4000-8000-000000000001');
insert into public.condominium_memberships(condominium_id, user_id, role)
values ('41620000-0000-4000-8000-000000000001', '41600000-0000-4000-8000-000000000004', 'family_member');
insert into public.service_request_categories(id, condominium_id, code, name, created_by)
values ('41650000-0000-4000-8000-000000000001', '41620000-0000-4000-8000-000000000001', 'general', 'General', '41600000-0000-4000-8000-000000000001');

set local role authenticated;
select pg_temp.as_user('41600000-0000-4000-8000-000000000004');

select throws_ok(
  $$insert into public.payments(condominium_id, unit_id, submitted_by_user_id, payment_method_id,
      payment_date, original_amount, original_currency_code, payer_name, idempotency_key)
    values ('41620000-0000-4000-8000-000000000001', '41630000-0000-4000-8000-000000000001',
            '41600000-0000-4000-8000-000000000004', gen_random_uuid(), current_date, 10, 'USD', 'Fam', 'k1')$$,
  null, null, 'a family-only user cannot insert a payment');

select throws_ok(
  $$insert into public.service_requests(condominium_id, category_id, unit_id, title, description, created_by)
    values ('41620000-0000-4000-8000-000000000001', '41650000-0000-4000-8000-000000000001',
            '41630000-0000-4000-8000-000000000001', 'x', 'y', '41600000-0000-4000-8000-000000000004')$$,
  null, null, 'a family-only user cannot insert a service request');

select throws_ok(
  $$select public.create_service_request('41620000-0000-4000-8000-000000000001',
      '41650000-0000-4000-8000-000000000001', '41630000-0000-4000-8000-000000000001', 'x', 'y', null)$$,
  null, null, 'a family-only user cannot create a service request through the RPC');

reset role;
select * from finish();
rollback;
