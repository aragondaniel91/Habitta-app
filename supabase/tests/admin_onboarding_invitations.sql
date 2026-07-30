begin;
select plan(15);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-0000000000d1',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'admin@test.local',
    'x',
    '{"full_name":"Admin Test"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-0000000000d2',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'invitee@test.local',
    'x',
    '{"full_name":"Invited Admin"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-0000000000d3',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'outsider@test.local',
    'x',
    '{}'::jsonb,
    now(),
    now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);

create temporary table test_workspace as
select public.create_admin_workspace(
  'Administradora Habitta Test',
  'management_company',
  'Residencias Seguras',
  'VE',
  'Caracas',
  'America/Caracas',
  'VES',
  'USD',
  120,
  'Torre A'
) as payload;

select is(
  (select payload #>> '{organization,organization_type}' from test_workspace),
  'management_company',
  'onboarding stores the administration model'
);
select is(
  (select payload #>> '{condominium,country_code}' from test_workspace),
  'VE',
  'onboarding stores the condominium country'
);
select is(
  (select payload #>> '{condominium,primary_currency_code}' from test_workspace),
  'VES',
  'onboarding stores the primary currency'
);
select is(
  (select payload #>> '{condominium,secondary_currency_code}' from test_workspace),
  'USD',
  'onboarding stores the secondary currency separately'
);
select is(
  (
    select count(*)
    from public.organization_memberships
    where organization_id = (select (payload #>> '{organization,id}')::uuid from test_workspace)
      and user_id = '00000000-0000-0000-0000-0000000000d1'
      and role = 'organization_owner'
  ),
  1::bigint,
  'onboarding assigns organization_owner on the server'
);
select is(
  (
    select count(*)
    from public.condominium_memberships
    where condominium_id = (select (payload #>> '{condominium,id}')::uuid from test_workspace)
      and user_id = '00000000-0000-0000-0000-0000000000d1'
      and role = 'condominium_admin'
  ),
  1::bigint,
  'onboarding assigns condominium_admin on the server'
);
select is(
  (
    select count(*)
    from public.buildings
    where condominium_id = (select (payload #>> '{condominium,id}')::uuid from test_workspace)
      and name = 'Torre A'
  ),
  1::bigint,
  'onboarding creates the optional first tower'
);

create temporary table test_invitation as
select public.create_admin_invitation(
  (select (payload #>> '{condominium,id}')::uuid from test_workspace),
  'invitee@test.local',
  'assistant',
  now() + interval '7 days'
) as payload;

select is(
  length((select payload ->> 'raw_token' from test_invitation)),
  64,
  'administrator invitation returns a one-time 256-bit token'
);
select isnt(
  (
    select token_hash
    from public.admin_invitations
    where id = (select (payload #>> '{invitation,id}')::uuid from test_invitation)
  ),
  (select payload ->> 'raw_token' from test_invitation),
  'administrator invitation stores only the token hash'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d3', true);
select throws_ok(
  format(
    'select public.create_admin_invitation(%L::uuid, %L, %L, now() + interval ''7 days'')',
    (select payload #>> '{condominium,id}' from test_workspace),
    'blocked@test.local',
    'assistant'
  ),
  'P0001',
  null,
  'an unrelated user cannot invite administrators'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d2', true);
select is(
  (
    select public.get_admin_invitation_preview(
      (select payload ->> 'raw_token' from test_invitation)
    ) ->> 'email'
  ),
  'invitee@test.local',
  'the invitee can preview the invitation before accepting'
);
select lives_ok(
  format(
    'select public.accept_admin_invitation(%L)',
    (select payload ->> 'raw_token' from test_invitation)
  ),
  'the matching authenticated email accepts the invitation'
);
select is(
  (
    select count(*)
    from public.condominium_memberships
    where condominium_id = (select (payload #>> '{condominium,id}')::uuid from test_workspace)
      and user_id = '00000000-0000-0000-0000-0000000000d2'
      and role = 'assistant'
  ),
  1::bigint,
  'acceptance assigns only the invited role and condominium'
);
select throws_ok(
  format(
    'select public.accept_admin_invitation(%L)',
    (select payload ->> 'raw_token' from test_invitation)
  ),
  'P0001',
  null,
  'an accepted invitation cannot be reused'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
select is(
  (
    select count(*)
    from public.admin_invitation_events
    where invitation_id = (select (payload #>> '{invitation,id}')::uuid from test_invitation)
      and event_type in ('created', 'accepted')
  ),
  2::bigint,
  'creation and acceptance are recorded in the audit trail'
);

select * from finish();
rollback;
