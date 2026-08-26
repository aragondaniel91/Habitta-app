begin;
select plan(9);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000036101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab361-admin@test.local', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000036102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab361-member@test.local', 'x', now(), now());

insert into public.organizations (id, name, created_by)
values ('36100000-0000-4000-8000-000000000001', 'HAB 361 Org', '00000000-0000-0000-0000-000000036101');

insert into public.condominiums (id, organization_id, name, created_by)
values ('36110000-0000-4000-8000-000000000001', '36100000-0000-4000-8000-000000000001', 'HAB 361 Condo', '00000000-0000-0000-0000-000000036101');

insert into public.organization_memberships (organization_id, user_id, role)
values ('36100000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000036101', 'organization_owner');

insert into public.condominium_memberships (condominium_id, user_id, role)
values
  ('36110000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000036101', 'condominium_admin'),
  ('36110000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000036102', 'accountant');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000036101', true);

-- The defect: `null not in (...)` is null, so the guard was skipped and the null reached the write.
select throws_ok(
  $$select public.manage_condominium_team_member('36110000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000036102','change_role',null)$$,
  'P0001',
  'invalid administrative role',
  'a null role is rejected as a domain error, not a raw constraint violation'
);
select is(
  (select role::text from public.condominium_memberships
   where condominium_id='36110000-0000-4000-8000-000000000001'
     and user_id='00000000-0000-0000-0000-000000036102'),
  'accountant',
  'the rejected change leaves the stored role untouched'
);
select throws_ok(
  $$select public.manage_condominium_team_member('36110000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000036102','change_role','owner')$$,
  'P0001',
  'invalid administrative role',
  'a non-administrative role is still rejected'
);

select lives_ok(
  $$select public.manage_condominium_team_member('36110000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000036102','change_role','assistant')$$,
  'a valid administrative role change still succeeds'
);
select is(
  (select role::text from public.condominium_memberships
   where condominium_id='36110000-0000-4000-8000-000000000001'
     and user_id='00000000-0000-0000-0000-000000036102'),
  'assistant',
  'the valid change is applied'
);

-- The last-administrator rule is what the page now explains up front; it must still be enforced.
select throws_ok(
  $$select public.manage_condominium_team_member('36110000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000036101','change_role','accountant')$$,
  'P0001',
  'last condominium administrator required',
  'the only administrator cannot demote themselves'
);
select is(
  (select role::text from public.condominium_memberships
   where condominium_id='36110000-0000-4000-8000-000000000001'
     and user_id='00000000-0000-0000-0000-000000036101'),
  'condominium_admin',
  'the condominium still has its administrator'
);

-- The invitation RPC carried the same null trap.
select throws_ok(
  $$select public.create_admin_invitation('36110000-0000-4000-8000-000000000001','nuevo@test.local',null,null)$$,
  'P0001',
  'invalid administrative role',
  'an invitation without a role is rejected as a domain error'
);
select is(
  (select count(*) from public.admin_invitations where condominium_id='36110000-0000-4000-8000-000000000001'),
  0::bigint,
  'the rejected invitation was never created'
);

select * from finish();
rollback;
