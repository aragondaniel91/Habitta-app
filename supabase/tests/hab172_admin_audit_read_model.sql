begin;
select plan(13);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('17200000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab172-admin-a@test.local', 'x', now(), now()),
  ('17200000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab172-admin-b@test.local', 'x', now(), now()),
  ('17200000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab172-owner@test.local', 'x', now(), now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '17200000-0000-0000-0000-000000000001', true);
create temporary table hab172_workspace_a as
select public.create_admin_workspace(
  'HAB-172 Org A', 'independent', 'HAB-172 Condo A', 'VE', 'Caracas',
  'America/Caracas', 'USD', 'VES', 1, 'Torre A'
) as payload;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '17200000-0000-0000-0000-000000000002', true);
create temporary table hab172_workspace_b as
select public.create_admin_workspace(
  'HAB-172 Org B', 'independent', 'HAB-172 Condo B', 'VE', 'Valencia',
  'America/Caracas', 'USD', 'VES', 1, 'Torre B'
) as payload;
reset role;

insert into public.units (id, condominium_id, building_id, code, type, status, created_by)
select
  '17200000-0000-0000-0000-000000000101',
  (payload #>> '{condominium,id}')::uuid,
  (payload #>> '{building,id}')::uuid,
  'A-01', 'apartment', 'active',
  '17200000-0000-0000-0000-000000000001'
from hab172_workspace_a;

insert into public.condominium_payment_methods (
  id, condominium_id, method_type, display_name, currency_code,
  requires_reference, requires_proof, is_active, created_by
)
select
  '17200000-0000-0000-0000-000000000102',
  (payload #>> '{condominium,id}')::uuid,
  'cash', 'Caja USD', 'USD', false, false, true,
  '17200000-0000-0000-0000-000000000001'
from hab172_workspace_a;

insert into public.condominium_memberships (condominium_id, user_id, role)
select (payload #>> '{condominium,id}')::uuid, '17200000-0000-0000-0000-000000000003', 'owner'
from hab172_workspace_a;

set local role authenticated;
select set_config('request.jwt.claim.sub', '17200000-0000-0000-0000-000000000001', true);

select public.create_payment_draft(
  (select (payload #>> '{condominium,id}')::uuid from hab172_workspace_a),
  '17200000-0000-0000-0000-000000000101',
  '17200000-0000-0000-0000-000000000102',
  null,
  current_date,
  25,
  'USD',
  'HAB-172 Admin',
  null,
  null,
  'hab172-audit-payment'
);

select public.create_expense(
  (select (payload #>> '{condominium,id}')::uuid from hab172_workspace_a),
  (
    select id from public.expense_categories
    where condominium_id = (select (payload #>> '{condominium,id}')::uuid from hab172_workspace_a)
      and code = 'maintenance'
  ),
  null,
  'Gasto para auditoría',
  null,
  current_date,
  null,
  50,
  'USD',
  null,
  null,
  null,
  'Nota interna que no debe aparecer en el feed'
);

select public.create_governance_proposal(
  (select (payload #>> '{condominium,id}')::uuid from hab172_workspace_a),
  'Propuesta HAB-172',
  'Resumen',
  'Propuesta para validar auditoría',
  'community',
  'one_per_unit',
  50,
  null,
  null,
  null,
  now() + interval '7 days',
  '[{"label":"Sí","sortOrder":0},{"label":"No","sortOrder":1}]'::jsonb,
  '[]'::jsonb
);

select public.create_assembly(
  (select (payload #>> '{condominium,id}')::uuid from hab172_workspace_a),
  'Asamblea HAB-172',
  'Auditoría unificada',
  now() + interval '2 days',
  'Salón principal',
  'one_per_unit',
  50
);

reset role;

insert into public.treasury_events (
  id, condominium_id, entity_type, entity_id, event_type, actor_user_id, metadata, occurred_at
)
select
  '17200000-0000-0000-0000-000000000201',
  (payload #>> '{condominium,id}')::uuid,
  'movement',
  '17200000-0000-0000-0000-000000000211',
  'movement_recorded',
  '17200000-0000-0000-0000-000000000001',
  '{"secret":"must-not-leak","amount":"999"}'::jsonb,
  clock_timestamp()
from hab172_workspace_a;

insert into public.maintenance_events (
  id, condominium_id, entity_type, entity_id, event_type, actor_user_id,
  from_value, to_value, metadata, occurred_at
)
select
  '17200000-0000-0000-0000-000000000202',
  (payload #>> '{condominium,id}')::uuid,
  'work_order',
  '17200000-0000-0000-0000-000000000212',
  'created',
  '17200000-0000-0000-0000-000000000001',
  '{"private":"before"}'::jsonb,
  '{"private":"after"}'::jsonb,
  '{"secret":"must-not-leak"}'::jsonb,
  clock_timestamp()
from hab172_workspace_a;

insert into public.treasury_events (
  id, condominium_id, entity_type, entity_id, event_type, actor_user_id, metadata, occurred_at
)
select
  '17200000-0000-0000-0000-000000000203',
  (payload #>> '{condominium,id}')::uuid,
  'movement',
  '17200000-0000-0000-0000-000000000213',
  'movement_recorded',
  '17200000-0000-0000-0000-000000000002',
  '{}'::jsonb,
  clock_timestamp()
from hab172_workspace_b;

set local role authenticated;
select set_config('request.jwt.claim.sub', '17200000-0000-0000-0000-000000000001', true);

select is(
  (select count(*) from public.list_admin_audit_events(
    (select (payload #>> '{condominium,id}')::uuid from hab172_workspace_a)
  )),
  6::bigint,
  'administrator feed normalizes one event from each supported module'
);

select is(
  (select count(distinct module) from public.list_admin_audit_events(
    (select (payload #>> '{condominium,id}')::uuid from hab172_workspace_a)
  )),
  6::bigint,
  'all six supported audit modules are represented'
);

select is(
  (select count(*) from public.list_admin_audit_events(
    (select (payload #>> '{condominium,id}')::uuid from hab172_workspace_a),
    'payments'
  )),
  1::bigint,
  'module filter returns only payment events'
);

select is(
  (select count(*) from public.list_admin_audit_events(
    (select (payload #>> '{condominium,id}')::uuid from hab172_workspace_a),
    null,
    '17200000-0000-0000-0000-000000000001'
  )),
  6::bigint,
  'actor filter returns the matching administrator events'
);

select is(
  (select count(*) from public.list_admin_audit_events(
    (select (payload #>> '{condominium,id}')::uuid from hab172_workspace_a),
    null,
    null,
    'assembly'
  )),
  1::bigint,
  'entity type filter is deterministic'
);

select is(
  (
    select metadata
    from public.list_admin_audit_events(
      (select (payload #>> '{condominium,id}')::uuid from hab172_workspace_a),
      'treasury'
    )
    limit 1
  ),
  '{}'::jsonb,
  'treasury source metadata is redacted instead of leaking arbitrary source fields'
);

select ok(
  not exists (
    select 1
    from public.list_admin_audit_events(
      (select (payload #>> '{condominium,id}')::uuid from hab172_workspace_a)
    )
    where metadata::text like '%must-not-leak%'
       or metadata::text like '%Nota interna%'
       or metadata::text like '%private%'
  ),
  'unified audit feed does not leak source secrets, private values or internal notes'
);

select is(
  (select count(*) from public.list_admin_audit_events(
    (select (payload #>> '{condominium,id}')::uuid from hab172_workspace_a),
    null, null, null, null, null, 2, 0
  )),
  2::bigint,
  'result limit bounds the page size'
);

select is(
  (select count(*) from public.list_admin_audit_events(
    (select (payload #>> '{condominium,id}')::uuid from hab172_workspace_a),
    null, null, null, null, null, 100, 6
  )),
  0::bigint,
  'result offset advances beyond the six-event fixture'
);

select throws_ok(
  $$select * from public.list_admin_audit_events(
    (select (payload #>> '{condominium,id}')::uuid from hab172_workspace_a),
    'unknown-module'
  )$$,
  'P0001',
  'invalid audit module filter',
  'unknown module filters are rejected'
);

select throws_ok(
  $$select * from public.list_admin_audit_events(
    (select (payload #>> '{condominium,id}')::uuid from hab172_workspace_a),
    null, null, null, null, null, 101, 0
  )$$,
  'P0001',
  'audit result limit must be between 1 and 100',
  'oversized audit pages are rejected'
);

select set_config('request.jwt.claim.sub', '17200000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select * from public.list_admin_audit_events(
    (select (payload #>> '{condominium,id}')::uuid from hab172_workspace_a)
  )$$,
  'P0001',
  'not authorized to read administrator audit log',
  'administrator from another condominium cannot read the feed'
);

select set_config('request.jwt.claim.sub', '17200000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select * from public.list_admin_audit_events(
    (select (payload #>> '{condominium,id}')::uuid from hab172_workspace_a)
  )$$,
  'P0001',
  'not authorized to read administrator audit log',
  'owner role does not receive administrator audit access'
);

select * from finish();
rollback;
