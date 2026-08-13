begin;
select plan(19);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-00000000e101','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-admin@test.local','x','{"full_name":"Owner Admin"}'::jsonb,now(),now()),
  ('00000000-0000-0000-0000-00000000e102','00000000-0000-0000-0000-000000000000','authenticated','authenticated','second-admin@test.local','x','{"full_name":"Second Admin"}'::jsonb,now(),now()),
  ('00000000-0000-0000-0000-00000000e103','00000000-0000-0000-0000-000000000000','authenticated','authenticated','staff@test.local','x','{"full_name":"Staff Member"}'::jsonb,now(),now()),
  ('00000000-0000-0000-0000-00000000e104','00000000-0000-0000-0000-000000000000','authenticated','authenticated','outsider-team@test.local','x','{}'::jsonb,now(),now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e101', true);

create temporary table lifecycle_workspace as
select public.create_admin_workspace(
  'HAB-167 Organization', 'independent', 'HAB-167 Condominium', 'US', 'Houston',
  'America/Chicago', 'USD', null, 24, null
) as payload;

create temporary table second_admin_invite as
select public.create_admin_invitation(
  (select (payload #>> '{condominium,id}')::uuid from lifecycle_workspace),
  'second-admin@test.local', 'condominium_admin', now() + interval '7 days'
) as payload;

create temporary table staff_invite as
select public.create_admin_invitation(
  (select (payload #>> '{condominium,id}')::uuid from lifecycle_workspace),
  'staff@test.local', 'assistant', now() + interval '7 days'
) as payload;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e102', true);
select lives_ok(
  format('select public.accept_admin_invitation(%L)', (select payload ->> 'raw_token' from second_admin_invite)),
  'a second condominium administrator can accept an invitation'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e103', true);
select lives_ok(
  format('select public.accept_admin_invitation(%L)', (select payload ->> 'raw_token' from staff_invite)),
  'an administrative staff member can accept an invitation'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e101', true);

select is(
  (select count(*) from public.list_condominium_team_access((select (payload #>> '{condominium,id}')::uuid from lifecycle_workspace)) where status = 'active'),
  3::bigint,
  'team access lists all active administrative members'
);

select lives_ok(
  format(
    'select public.manage_condominium_team_member(%L::uuid, %L::uuid, %L, %L)',
    (select payload #>> '{condominium,id}' from lifecycle_workspace),
    '00000000-0000-0000-0000-00000000e103', 'change_role', 'accountant'
  ),
  'an administrator can change an active team member role'
);

select is(
  (select role::text from public.condominium_memberships where condominium_id = (select (payload #>> '{condominium,id}')::uuid from lifecycle_workspace) and user_id = '00000000-0000-0000-0000-00000000e103'),
  'accountant',
  'role change updates the active membership'
);

select is(
  (select count(*) from public.condominium_memberships where condominium_id = (select (payload #>> '{condominium,id}')::uuid from lifecycle_workspace) and user_id = '00000000-0000-0000-0000-00000000e103' and role in ('condominium_admin','accountant','assistant','payment_reviewer')),
  1::bigint,
  'a user keeps exactly one active administrative role'
);

select lives_ok(
  format(
    'select public.manage_condominium_team_member(%L::uuid, %L::uuid, %L, null)',
    (select payload #>> '{condominium,id}' from lifecycle_workspace),
    '00000000-0000-0000-0000-00000000e103', 'suspend'
  ),
  'an administrator can suspend a team member'
);

select is(
  (select count(*) from public.condominium_memberships where condominium_id = (select (payload #>> '{condominium,id}')::uuid from lifecycle_workspace) and user_id = '00000000-0000-0000-0000-00000000e103' and role in ('condominium_admin','accountant','assistant','payment_reviewer')),
  0::bigint,
  'suspension removes the active access membership immediately'
);

select is(
  (select status from public.condominium_team_access_states where condominium_id = (select (payload #>> '{condominium,id}')::uuid from lifecycle_workspace) and user_id = '00000000-0000-0000-0000-00000000e103'),
  'suspended',
  'suspension preserves lifecycle state for reactivation'
);

select lives_ok(
  format(
    'select public.manage_condominium_team_member(%L::uuid, %L::uuid, %L, null)',
    (select payload #>> '{condominium,id}' from lifecycle_workspace),
    '00000000-0000-0000-0000-00000000e103', 'reactivate'
  ),
  'a suspended team member can be reactivated'
);

select is(
  (select role::text from public.condominium_memberships where condominium_id = (select (payload #>> '{condominium,id}')::uuid from lifecycle_workspace) and user_id = '00000000-0000-0000-0000-00000000e103'),
  'accountant',
  'reactivation restores the stored role'
);

select lives_ok(
  format(
    'select public.manage_condominium_team_member(%L::uuid, %L::uuid, %L, null)',
    (select payload #>> '{condominium,id}' from lifecycle_workspace),
    '00000000-0000-0000-0000-00000000e103', 'remove'
  ),
  'an administrator can remove a team member access without deleting the auth user'
);

select is(
  (select status from public.condominium_team_access_states where condominium_id = (select (payload #>> '{condominium,id}')::uuid from lifecycle_workspace) and user_id = '00000000-0000-0000-0000-00000000e103'),
  'removed',
  'removed access remains represented in lifecycle history'
);

select is(
  (select count(*) from auth.users where id = '00000000-0000-0000-0000-00000000e103'),
  1::bigint,
  'removing condominium access does not delete the global Auth account'
);

select lives_ok(
  format(
    'select public.manage_condominium_team_member(%L::uuid, %L::uuid, %L, null)',
    (select payload #>> '{condominium,id}' from lifecycle_workspace),
    '00000000-0000-0000-0000-00000000e102', 'remove'
  ),
  'one administrator can be removed while another administrator remains'
);

select throws_ok(
  format(
    'select public.manage_condominium_team_member(%L::uuid, %L::uuid, %L, %L)',
    (select payload #>> '{condominium,id}' from lifecycle_workspace),
    '00000000-0000-0000-0000-00000000e101', 'change_role', 'accountant'
  ),
  'P0001', 'last condominium administrator required',
  'the final condominium administrator cannot be demoted'
);

select throws_ok(
  format(
    'select public.manage_condominium_team_member(%L::uuid, %L::uuid, %L, null)',
    (select payload #>> '{condominium,id}' from lifecycle_workspace),
    '00000000-0000-0000-0000-00000000e101', 'suspend'
  ),
  'P0001', 'last condominium administrator required',
  'the final condominium administrator cannot be suspended'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e104', true);
select throws_ok(
  format(
    'select public.manage_condominium_team_member(%L::uuid, %L::uuid, %L, %L)',
    (select payload #>> '{condominium,id}' from lifecycle_workspace),
    '00000000-0000-0000-0000-00000000e101', 'change_role', 'assistant'
  ),
  'P0001', 'condominium administrator required',
  'an unrelated user cannot manage condominium team access'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e101', true);
select is(
  (select count(*) from public.condominium_team_access_events where condominium_id = (select (payload #>> '{condominium,id}')::uuid from lifecycle_workspace) and event_type in ('role_changed','suspended','reactivated','removed')),
  5::bigint,
  'role changes, suspension, reactivation and removals are recorded immutably'
);

select * from finish();
rollback;
