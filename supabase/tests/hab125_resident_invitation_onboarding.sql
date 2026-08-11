begin;
select plan(14);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000012501',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'hab125-admin@test.local', 'x',
    '{"full_name":"HAB-125 Admin"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000012502',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'hab125-owner@test.local', 'x',
    '{"full_name":"HAB-125 Owner"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000012503',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'hab125-other@test.local', 'x',
    '{"full_name":"HAB-125 Other"}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000012501', true);

create temporary table hab125_workspace as
select public.create_admin_workspace(
  'Habitta HAB-125 Org',
  'independent',
  'Condominio HAB-125',
  'VE',
  'Caracas',
  'America/Caracas',
  'USD',
  'VES',
  10,
  'Torre HAB-125'
) as payload;

create temporary table hab125_ids as
select
  (payload #>> '{condominium,id}')::uuid as condominium_id,
  (payload #>> '{building,id}')::uuid as building_id
from hab125_workspace;

reset role;

insert into public.units(id, condominium_id, building_id, code, type, status, created_by)
values (
  '00000000-0000-0000-0000-000000012510',
  (select condominium_id from hab125_ids),
  (select building_id from hab125_ids),
  'A-125', 'apartment', 'active',
  '00000000-0000-0000-0000-000000012501'
);

insert into public.people(
  id, condominium_id, first_name, last_name, email, status, created_by
) values (
  '00000000-0000-0000-0000-000000012511',
  (select condominium_id from hab125_ids),
  'Olivia', 'Owner', 'hab125-owner@test.local', 'active',
  '00000000-0000-0000-0000-000000012501'
);

insert into public.unit_owners(unit_id, person_id, is_primary_contact, created_by)
values (
  '00000000-0000-0000-0000-000000012510',
  '00000000-0000-0000-0000-000000012511',
  true,
  '00000000-0000-0000-0000-000000012501'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000012501', true);

create temporary table hab125_first_invite as
select public.create_resident_invitation(
  (select condominium_id from hab125_ids),
  '00000000-0000-0000-0000-000000012511',
  '00000000-0000-0000-0000-000000012510',
  'owner',
  null
) as payload;

select is(
  (select payload #>> '{invitation,status}' from hab125_first_invite),
  'pending',
  'administrator creates a pending resident invitation'
);

select is(
  (select payload #>> '{invitation,email}' from hab125_first_invite),
  'hab125-owner@test.local',
  'invitation uses the canonical person email'
);

select is(
  (
    select person_name
    from public.get_resident_invitation_preview(
      (select payload ->> 'raw_token' from hab125_first_invite)
    )
  ),
  'Olivia Owner',
  'public preview exposes the intended resident without exposing the token hash'
);

select throws_like(
  $$select public.create_resident_invitation(
    (select condominium_id from hab125_ids),
    '00000000-0000-0000-0000-000000012511',
    '00000000-0000-0000-0000-000000012510',
    'tenant', null
  )$$,
  '%active tenant assignment%',
  'tenant invitation requires an active tenant relationship'
);

create temporary table hab125_second_invite as
select public.create_resident_invitation(
  (select condominium_id from hab125_ids),
  '00000000-0000-0000-0000-000000012511',
  '00000000-0000-0000-0000-000000012510',
  'owner',
  null
) as payload;

select is(
  (
    select status::text
    from public.invitations
    where id = (select (payload #>> '{invitation,id}')::uuid from hab125_first_invite)
  ),
  'revoked',
  'creating a replacement revokes the previous pending invitation'
);

select is(
  (
    select count(*)
    from public.invitations
    where condominium_id = (select condominium_id from hab125_ids)
      and person_id = '00000000-0000-0000-0000-000000012511'
      and status = 'pending'
  ),
  1::bigint,
  'only one pending invitation remains for the same resident unit and role'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000012503', true);
select throws_like(
  format(
    'select public.accept_invitation(%L)',
    (select payload ->> 'raw_token' from hab125_second_invite)
  ),
  '%invalid invitation%',
  'a different authenticated email cannot accept the invitation'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000012502', true);
select lives_ok(
  format(
    'select public.accept_invitation(%L)',
    (select payload ->> 'raw_token' from hab125_second_invite)
  ),
  'matching resident accepts the invitation'
);

select is(
  (
    select auth_user_id
    from public.people
    where id = '00000000-0000-0000-0000-000000012511'
  ),
  '00000000-0000-0000-0000-000000012502'::uuid,
  'acceptance links the person to the authenticated account'
);

select is(
  (
    select count(*)
    from public.condominium_memberships
    where condominium_id = (select condominium_id from hab125_ids)
      and user_id = '00000000-0000-0000-0000-000000012502'
      and role = 'owner'
  ),
  1::bigint,
  'acceptance creates the owner condominium membership'
);

select is(
  (
    select count(*)
    from public.units
    where id = '00000000-0000-0000-0000-000000012510'
  ),
  1::bigint,
  'accepted owner can read the assigned unit through RLS'
);

select throws_like(
  format(
    'select public.accept_invitation(%L)',
    (select payload ->> 'raw_token' from hab125_second_invite)
  ),
  '%invalid invitation%',
  'accepted invitation cannot be reused'
);

reset role;
update public.people
set auth_user_id = null
where id = '00000000-0000-0000-0000-000000012511';
delete from public.condominium_memberships
where condominium_id = (select condominium_id from hab125_ids)
  and user_id = '00000000-0000-0000-0000-000000012502'
  and role = 'owner';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000012501', true);
create temporary table hab125_revoked_invite as
select public.create_resident_invitation(
  (select condominium_id from hab125_ids),
  '00000000-0000-0000-0000-000000012511',
  '00000000-0000-0000-0000-000000012510',
  'owner',
  null
) as payload;

select lives_ok(
  format(
    'select public.revoke_resident_invitation(%L::uuid)',
    (select payload #>> '{invitation,id}' from hab125_revoked_invite)
  ),
  'administrator can revoke a pending resident invitation'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000012502', true);
select throws_like(
  format(
    'select public.accept_invitation(%L)',
    (select payload ->> 'raw_token' from hab125_revoked_invite)
  ),
  '%invalid invitation%',
  'revoked invitation cannot be accepted'
);

select * from finish();
rollback;
