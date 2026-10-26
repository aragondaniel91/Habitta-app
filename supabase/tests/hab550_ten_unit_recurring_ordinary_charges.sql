begin;
select plan(22);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('55000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab550-admin@test.local', 'x', now(), now()),
  ('55000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab550-board@test.local', 'x', now(), now()),
  ('55000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab550-other-admin@test.local', 'x', now(), now());

insert into public.organizations (id, name, created_by)
values
  ('55010000-0000-4000-8000-000000000001', 'HAB 550 primary organization', '55000000-0000-4000-8000-000000000001'),
  ('55010000-0000-4000-8000-000000000002', 'HAB 550 isolated organization', '55000000-0000-4000-8000-000000000003');

insert into public.condominiums (id, organization_id, name, property_topology, charge_scope, declared_building_count, created_by)
values
  ('55020000-0000-4000-8000-000000000001', '55010000-0000-4000-8000-000000000001', 'HAB 550 primary condominium', 'multi_building_complex', 'building', 10, '55000000-0000-4000-8000-000000000001'),
  ('55020000-0000-4000-8000-000000000002', '55010000-0000-4000-8000-000000000002', 'HAB 550 isolated condominium', 'multi_building_complex', 'unit', 2, '55000000-0000-4000-8000-000000000003');

insert into public.organization_memberships (organization_id, user_id, role)
values
  ('55010000-0000-4000-8000-000000000001', '55000000-0000-4000-8000-000000000001', 'organization_owner'),
  ('55010000-0000-4000-8000-000000000002', '55000000-0000-4000-8000-000000000003', 'organization_owner');

insert into public.condominium_memberships (condominium_id, user_id, role)
values
  ('55020000-0000-4000-8000-000000000001', '55000000-0000-4000-8000-000000000001', 'condominium_admin'),
  ('55020000-0000-4000-8000-000000000001', '55000000-0000-4000-8000-000000000002', 'board_member'),
  ('55020000-0000-4000-8000-000000000002', '55000000-0000-4000-8000-000000000003', 'condominium_admin');

insert into public.buildings (id, condominium_id, name, created_by)
select ('55030000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, '55020000-0000-4000-8000-000000000001', 'Edificio ' || n, '55000000-0000-4000-8000-000000000001' from generate_series(1,10) n;

insert into public.units (id, condominium_id, building_id, code, type, ownership_percentage, created_by)
select
  ('55040000-0000-4000-8000-' || lpad(unit_number::text, 12, '0'))::uuid,
  '55020000-0000-4000-8000-000000000001',
  ('55030000-0000-4000-8000-' || lpad(unit_number::text, 12, '0'))::uuid,
  'Edificio ' || unit_number,
  'building',
  10,
  '55000000-0000-4000-8000-000000000001'
from generate_series(1, 10) as unit_number;

insert into public.charge_concepts (id, condominium_id, code, name, category, default_currency_code, created_by)
values ('55050000-0000-4000-8000-000000000001', '55020000-0000-4000-8000-000000000001', 'ORD550', 'Cuota ordinaria HAB 550', 'regular_dues', 'USD', '55000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '55000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$select public.create_financial_scope('55020000-0000-4000-8000-000000000001', 'hab550-general', 'Condominio general', 'condominium', null, null)$$,
  'administrator creates the ten-unit building financial scope'
);
select lives_ok(
  $$select public.create_recurring_charge_plan('55020000-0000-4000-8000-000000000001', '55050000-0000-4000-8000-000000000001', (select id from public.financial_scopes where code = 'hab550-general'), 'Cuota ordinaria HAB 550', 'fixed_per_unit', 12.34, 'USD', '2026-11-01'::date, 1::smallint, 10::smallint, null::date)$$,
  'administrator creates an ordinary recurring plan for the building'
);
create temporary table hab550_context (
  plan_id uuid not null
) on commit drop;

insert into hab550_context (plan_id)
select id
from public.recurring_charge_plans
where name = 'Cuota ordinaria HAB 550';
select is((select count(*) from hab550_context), 1::bigint,
 'the authorized administrator captures exactly one real recurring plan for denial testing');

select lives_ok(
  $$select public.schedule_recurring_charge_run((select id from public.recurring_charge_plans where name = 'Cuota ordinaria HAB 550'), '2026-12')$$,
  'administrator schedules the ten-unit ordinary charge run'
);
select is(
  (select status::text from public.recurring_charge_runs where plan_id = (select id from public.recurring_charge_plans where name = 'Cuota ordinaria HAB 550') and period = '2026-12'),
  'scheduled',
  'scheduled run has not created receivables'
);
select is(
  (select count(*) from public.receivable_items where condominium_id = '55020000-0000-4000-8000-000000000001'),
  0::bigint,
  'scheduling creates no receivables before review'
);
select lives_ok(
  $$select public.prepare_recurring_charge_run((select id from public.recurring_charge_runs where plan_id = (select id from public.recurring_charge_plans where name = 'Cuota ordinaria HAB 550') and period = '2026-12'))$$,
  'administrator prepares the scheduled run for review'
);
select is(
  (select status::text from public.recurring_charge_runs where plan_id = (select id from public.recurring_charge_plans where name = 'Cuota ordinaria HAB 550') and period = '2026-12'),
  'pending_review',
  'prepared run is pending review'
);
select is(
  (select jsonb_array_length(distribution_snapshot) from public.recurring_charge_runs where plan_id = (select id from public.recurring_charge_plans where name = 'Cuota ordinaria HAB 550') and period = '2026-12'),
  10,
  'review snapshot contains all ten building units'
);
select is(
  (select sum((allocation->>'amount')::numeric) from public.recurring_charge_runs run, lateral jsonb_array_elements(run.distribution_snapshot) allocation where run.plan_id = (select id from public.recurring_charge_plans where name = 'Cuota ordinaria HAB 550') and run.period = '2026-12'),
  123.40::numeric,
  'review snapshot reconciles exactly to ten ordinary charges'
);
select lives_ok(
  $$select public.post_recurring_charge_run((select id from public.recurring_charge_runs where plan_id = (select id from public.recurring_charge_plans where name = 'Cuota ordinaria HAB 550') and period = '2026-12'))$$,
  'administrator posts the reviewed recurring charge run'
);
select is(
  (select status::text from public.recurring_charge_runs where plan_id = (select id from public.recurring_charge_plans where name = 'Cuota ordinaria HAB 550') and period = '2026-12'),
  'posted',
  'reviewed run posts successfully'
);
select is(
  (select count(*) from public.receivable_items where charge_batch_id = (select charge_batch_id from public.recurring_charge_runs where plan_id = (select id from public.recurring_charge_plans where name = 'Cuota ordinaria HAB 550') and period = '2026-12')),
  10::bigint,
  'posting creates ten receivables'
);
select is(
  (select count(distinct unit_id) from public.receivable_items where charge_batch_id = (select charge_batch_id from public.recurring_charge_runs where plan_id = (select id from public.recurring_charge_plans where name = 'Cuota ordinaria HAB 550') and period = '2026-12')),
  10::bigint,
  'posting creates a receivable for each distinct building unit'
);
select is(
  (select count(distinct id) from public.receivable_items where charge_batch_id = (select charge_batch_id from public.recurring_charge_runs where plan_id = (select id from public.recurring_charge_plans where name = 'Cuota ordinaria HAB 550') and period = '2026-12')),
  10::bigint,
  'posting creates ten distinct receivable records'
);
select is(
  (select sum(original_amount) from public.receivable_items where charge_batch_id = (select charge_batch_id from public.recurring_charge_runs where plan_id = (select id from public.recurring_charge_plans where name = 'Cuota ordinaria HAB 550') and period = '2026-12')),
  123.40::numeric,
  'posted receivable amounts reconcile exactly to the reviewed total'
);
select is(
  (select sum(entry.amount) from public.receivable_ledger_entries entry join public.receivable_items item on item.id = entry.receivable_item_id where item.charge_batch_id = (select charge_batch_id from public.recurring_charge_runs where plan_id = (select id from public.recurring_charge_plans where name = 'Cuota ordinaria HAB 550') and period = '2026-12') and entry.direction = 'debit'),
  123.40::numeric,
  'posted debit ledger entries reconcile exactly to the receivable total'
);

select set_config('request.jwt.claim.sub', '55000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.schedule_recurring_charge_run((select plan_id from hab550_context), '2027-01')$$,
  'P0001',
  'permission denied',
  'board member cannot schedule recurring ordinary charges'
);

select set_config('request.jwt.claim.sub', '55000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select public.schedule_recurring_charge_run((select plan_id from hab550_context), '2027-01')$$,
  'P0001',
  'permission denied',
  'administrator from another tenant cannot schedule this recurring charge run'
);

-- These direct table reads exercise RLS, unlike the SECURITY DEFINER RPC denials above.
select is((select count(*) from public.units where condominium_id='55020000-0000-4000-8000-000000000001'), 0::bigint,
 'foreign tenant cannot read primary condominium building accounts via RLS');
select is((select count(*) from public.receivable_items where condominium_id='55020000-0000-4000-8000-000000000001'), 0::bigint,
 'foreign tenant cannot read primary condominium receivables via RLS');
select is((select count(*) from public.financial_scopes where condominium_id='55020000-0000-4000-8000-000000000001'), 0::bigint,
 'foreign tenant cannot read primary condominium financial scopes via RLS');

select * from finish();
rollback;
