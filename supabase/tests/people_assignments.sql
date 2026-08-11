begin;
select plan(20);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@test.local', 'x', now(), now()),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test.local', 'x', now(), now()),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'accountant@test.local', 'x', now(), now());
insert into public.organizations (id, name, created_by) values
  ('10000000-0000-0000-0000-000000000001', 'Org A', '00000000-0000-0000-0000-0000000000a1'),
  ('20000000-0000-0000-0000-000000000002', 'Org B', '00000000-0000-0000-0000-0000000000b1');
insert into public.condominiums (id, organization_id, name, created_by) values
  ('11000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Condo A', '00000000-0000-0000-0000-0000000000a1'),
  ('22000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Condo B', '00000000-0000-0000-0000-0000000000b1');
insert into public.organization_memberships (organization_id, user_id, role)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'organization_owner');
insert into public.condominium_memberships (condominium_id, user_id, role) values
  ('11000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'condominium_admin'),
  ('22000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', 'owner'),
  ('11000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'accountant');
insert into public.units (id, condominium_id, code, type, created_by) values
  ('11110000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'A-1', 'apartment', '00000000-0000-0000-0000-0000000000a1'),
  ('22220000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000002', 'B-1', 'apartment', '00000000-0000-0000-0000-0000000000b1');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select lives_ok($$insert into public.people (id, condominium_id, first_name, last_name, email, created_by) values ('11111111-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','Ada','Admin','ada@test.local','00000000-0000-0000-0000-0000000000a1')$$, 'administrator creates person');
select is((select count(*) from public.people where condominium_id = '22000000-0000-0000-0000-000000000002'), 0::bigint, 'user A cannot read people from condominium B');
select lives_ok($$insert into public.unit_owners (unit_id, person_id, created_by) values ('11110000-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1')$$, 'administrator creates owner assignment');
select throws_ok($$insert into public.unit_owners (unit_id, person_id, created_by) values ('22220000-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1')$$, null, 'person and unit must share condominium', 'different person and unit condominiums are rejected');
select throws_ok($$insert into public.unit_owners (unit_id, person_id, created_by) values ('11110000-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1')$$, null, null, 'duplicate active relationship is rejected');
select lives_ok($$update public.unit_owners set ends_at = current_date where unit_id = '11110000-0000-0000-0000-000000000001'$$, 'ends_at closes an assignment');
select is((select count(*) from public.unit_owners where ends_at is not null), 1::bigint, 'ends_at preserves assignment history');
select throws_ok($$select public.import_people_csv('11000000-0000-0000-0000-000000000001', '[{"unit_code":"missing","first_name":"No","last_name":"Unit","relationship":"tenant"}]'::jsonb, 'unknown-unit')$$, null, 'unknown unit missing', 'import with unknown unit rolls back');
select is((select count(*) from public.people), 1::bigint, 'failed import did not create people');
select lives_ok($$select public.import_people_csv('11000000-0000-0000-0000-000000000001', '[{"unit_code":"A-1","first_name":"Ivy","last_name":"Import","email":"ivy@test.local","relationship":"tenant"}]'::jsonb, 'repeatable')$$, 'first idempotent import succeeds');
select lives_ok($$select public.import_people_csv('11000000-0000-0000-0000-000000000001', '[{"unit_code":"A-1","first_name":"Ivy","last_name":"Import","email":"ivy@test.local","relationship":"tenant"}]'::jsonb, 'repeatable')$$, 'repeated idempotency key returns saved result');
select is((select count(*) from public.people_imports where idempotency_key = 'repeatable'), 1::bigint, 'idempotency key does not duplicate imports');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
select is((select count(*) from public.people), 2::bigint, 'accountant can read people');
update public.people
set first_name = 'Blocked'
where id = '11111111-0000-0000-0000-000000000001';
select is((select first_name from public.people where id = '11111111-0000-0000-0000-000000000001'), 'Ada', 'accountant cannot modify people');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);

reset role;
insert into public.people (id, condominium_id, auth_user_id, first_name, last_name, email, created_by) values
  ('22222222-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', 'Owen', 'Owner', 'owner@test.local', '00000000-0000-0000-0000-0000000000b1'),
  ('11111111-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000001', null, 'Invite', 'Good', 'owner@test.local', '00000000-0000-0000-0000-0000000000a1');
insert into public.unit_owners (unit_id, person_id, created_by) values
  ('11110000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1');
insert into public.invitations (condominium_id, person_id, unit_id, email, intended_role, token_hash, expires_at, invited_by) values
  ('11000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003', '11110000-0000-0000-0000-000000000001', 'owner@test.local', 'owner', encode(digest('wrong-email','sha256'),'hex'), now() + interval '1 day', '00000000-0000-0000-0000-0000000000a1'),
  ('11000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003', '11110000-0000-0000-0000-000000000001', 'owner@test.local', 'owner', encode(digest('correct','sha256'),'hex'), now() + interval '1 day', '00000000-0000-0000-0000-0000000000a1'),
  ('11000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003', '11110000-0000-0000-0000-000000000001', 'owner@test.local', 'owner', encode(digest('expired','sha256'),'hex'), now() - interval '1 day', '00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
select throws_ok($$select public.accept_invitation('wrong-email')$$, null, 'invalid invitation', 'different authenticated email is rejected');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
select lives_ok($$select public.accept_invitation('correct')$$, 'matching invitation is accepted');
select throws_ok($$select public.accept_invitation('correct')$$, null, 'invalid invitation', 'accepted invitation cannot be reused');
select throws_ok($$select public.accept_invitation('expired')$$, null, 'invalid invitation', 'expired invitation is rejected');
select is((select count(*) from public.people), 2::bigint, 'owner reads only their linked people');
select throws_ok($$insert into public.people (condominium_id, first_name, last_name, created_by) values ('22000000-0000-0000-0000-000000000002','No','Write','00000000-0000-0000-0000-0000000000b1')$$, '42501', null, 'owner cannot create person');

select * from finish();
rollback;