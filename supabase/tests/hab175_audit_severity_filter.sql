begin;
select plan(3);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values (
  '17500000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'hab175-admin@test.local',
  'x',
  now(),
  now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '17500000-0000-0000-0000-000000000001', true);

create temporary table hab175_workspace as
select public.create_admin_workspace(
  'HAB-175 Org', 'independent', 'HAB-175 Condo', 'VE', 'Caracas',
  'America/Caracas', 'USD', 'VES', 1, 'Torre A'
) as payload;

reset role;

insert into public.treasury_events (
  id, condominium_id, entity_type, entity_id, event_type, actor_user_id, metadata, occurred_at
)
select
  '17500000-0000-0000-0000-000000000101',
  (payload #>> '{condominium,id}')::uuid,
  'movement',
  '17500000-0000-0000-0000-000000000111',
  'movement_recorded',
  '17500000-0000-0000-0000-000000000001',
  '{}'::jsonb,
  now() - interval '2 minutes'
from hab175_workspace;

insert into public.treasury_events (
  id, condominium_id, entity_type, entity_id, event_type, actor_user_id, metadata, occurred_at
)
select
  '17500000-0000-0000-0000-000000000102',
  (payload #>> '{condominium,id}')::uuid,
  'movement',
  '17500000-0000-0000-0000-000000000112',
  'movement_reversed',
  '17500000-0000-0000-0000-000000000001',
  '{"private":"must-not-leak"}'::jsonb,
  now() - interval '1 minute'
from hab175_workspace;

set local role authenticated;
select set_config('request.jwt.claim.sub', '17500000-0000-0000-0000-000000000001', true);

select is(
  (select count(*) from public.list_admin_audit_events(
    (select (payload #>> '{condominium,id}')::uuid from hab175_workspace),
    null, null, null, null, null, 50, 0, 'warning'
  )),
  1::bigint,
  'warning severity filter is applied before pagination'
);

select is(
  (select count(*) from public.list_admin_audit_events(
    (select (payload #>> '{condominium,id}')::uuid from hab175_workspace),
    null, null, null, null, null, 50, 0, 'info'
  )),
  1::bigint,
  'info severity filter returns only informational events'
);

select throws_ok(
  $$select * from public.list_admin_audit_events(
    (select (payload #>> '{condominium,id}')::uuid from hab175_workspace),
    null, null, null, null, null, 50, 0, 'critical'
  )$$,
  'P0001',
  'invalid audit severity filter',
  'unsupported severity filters are rejected server-side'
);

select * from finish();
rollback;
