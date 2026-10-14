begin;
select plan(19);

select has_table('public', 'recurring_charge_run_governance_events', 'governance history is append-only table');
select has_function('public', 'return_recurring_charge_run_for_correction', array['uuid', 'text'], 'return RPC exists');
select has_function('public', 'cancel_recurring_charge_run', array['uuid', 'text'], 'cancel RPC exists');
select ok(not has_table_privilege('authenticated', 'public.recurring_charge_run_governance_events', 'INSERT'), 'clients cannot forge governance history');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000095501', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'run-governance-admin@test.local', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000095502', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'run-governance-other@test.local', 'x', now(), now());
insert into public.organizations (id, name, created_by)
values ('95000000-0000-0000-0000-000000000001', 'HAB run governance', '00000000-0000-0000-0000-000000095501');
insert into public.condominiums (id, organization_id, name, created_by)
values ('95010000-0000-0000-0000-000000000001', '95000000-0000-0000-0000-000000000001', 'HAB run governance condo', '00000000-0000-0000-0000-000000095501');
insert into public.organization_memberships (organization_id, user_id, role)
values ('95000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000095501', 'organization_owner');
insert into public.condominium_memberships (condominium_id, user_id, role)
values ('95010000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000095501', 'condominium_admin');
insert into public.charge_concepts (id, condominium_id, code, name, category, default_currency_code, created_by)
values
  ('95040000-0000-0000-0000-000000000001', '95010000-0000-0000-0000-000000000001', 'ORD', 'Ordinaria', 'regular_dues', 'USD', '00000000-0000-0000-0000-000000095501'),
  ('95040000-0000-0000-0000-000000000002', '95010000-0000-0000-0000-000000000001', 'EXTRA', 'Extraordinaria', 'extraordinary_dues', 'USD', '00000000-0000-0000-0000-000000095501');
insert into public.financial_scopes (id, condominium_id, kind, code, name, created_by)
values ('95050000-0000-0000-0000-000000000001', '95010000-0000-0000-0000-000000000001', 'condominium', 'general', 'General', '00000000-0000-0000-0000-000000095501');
insert into public.recurring_charge_plans (id, condominium_id, concept_id, financial_scope_id, name, distribution, amount, currency_code, starts_on, created_by)
values ('95060000-0000-0000-0000-000000000001', '95010000-0000-0000-0000-000000000001', '95040000-0000-0000-0000-000000000001', '95050000-0000-0000-0000-000000000001', 'Plan', 'fixed_per_unit', 10, 'USD', '2026-01-01', '00000000-0000-0000-0000-000000095501');
-- Creating the plan schedules its first run via recurring_plan_schedule_initial_run.
-- Reuse that run instead of inserting a duplicate (plan_id, period) test fixture.
update public.recurring_charge_runs
set id = '95070000-0000-0000-0000-000000000001',
    status = 'pending_review',
    distribution_snapshot = '[]'::jsonb,
    total_amount = 10,
    prepared_at = now(),
    prepared_by = '00000000-0000-0000-0000-000000095501'
where plan_id = '95060000-0000-0000-0000-000000000001' and period = '2026-01';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000095501', true);

-- HAB-003 ordinary-only invariant: recurring ordinary dues may never carry an extraordinary concept.
select throws_ok(
  $$select public.create_recurring_charge_plan('95010000-0000-0000-0000-000000000001','95040000-0000-0000-0000-000000000002','95050000-0000-0000-0000-000000000001','Intento extraordinario','fixed_per_unit',10,'USD','2026-01-01'::date,1::smallint,10::smallint,null::date)$$,
  'P0001', 'recurring charge plan requires regular dues concept', 'creation rejects an extraordinary concept on an ordinary recurring plan'
);

select throws_ok(
  $$select public.return_recurring_charge_run_for_correction('95070000-0000-0000-0000-000000000001', '   ')$$,
  'P0001', 'recurring run governance reason is required', 'return rejects a blank reason'
);

select lives_ok($$select public.return_recurring_charge_run_for_correction('95070000-0000-0000-0000-000000000001', 'Corregir alcance')$$, 'admin returns pending review run');
select is((select status::text from public.recurring_charge_runs where id = '95070000-0000-0000-0000-000000000001'), 'scheduled', 'returned run is editable/preparable scheduled state');
select is((select distribution_snapshot from public.recurring_charge_runs where id = '95070000-0000-0000-0000-000000000001'), null, 'returned run clears frozen allocation');
select is((select total_amount from public.recurring_charge_runs where id = '95070000-0000-0000-0000-000000000001'), null, 'returned run clears frozen total');
select is((select count(*) from public.recurring_charge_run_governance_events where run_id = '95070000-0000-0000-0000-000000000001' and action = 'returned_for_correction'), 1::bigint, 'return keeps documented audit history');

select throws_ok(
  $$select public.return_recurring_charge_run_for_correction('95070000-0000-0000-0000-000000000001', 'Ya no está en revisión')$$,
  'P0001', 'only pending review recurring runs can be returned for correction', 'a scheduled run cannot be returned again'
);

-- Tenant isolation: the second seeded user holds no membership in this condominium at all.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000095502', true);
select throws_ok($$select public.cancel_recurring_charge_run('95070000-0000-0000-0000-000000000001', 'Intento de otro tenant')$$, 'P0001', 'permission denied', 'an unrelated user cannot govern another tenant run');
select is((select count(*) from public.recurring_charge_runs where id = '95070000-0000-0000-0000-000000000001'), 0::bigint, 'RLS hides another tenant run from an unrelated user');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000095501', true);

select lives_ok($$select public.cancel_recurring_charge_run('95070000-0000-0000-0000-000000000001', 'Período no aplicable')$$, 'admin cancels returned scheduled run');
select is((select status::text from public.recurring_charge_runs where id = '95070000-0000-0000-0000-000000000001'), 'cancelled', 'cancelled run is terminal');
select is((select count(*) from public.receivable_items where description like '%2026-01%'), 0::bigint, 'governance-only paths create no receivables');
select lives_ok($$select public.cancel_recurring_charge_run('95070000-0000-0000-0000-000000000001', 'Repeated request')$$, 'cancellation is idempotent');

-- With no pending review run left in the way, editing still cannot swap in an extraordinary concept.
select throws_ok(
  $$select public.update_recurring_charge_plan('95010000-0000-0000-0000-000000000001','95060000-0000-0000-0000-000000000001','95040000-0000-0000-0000-000000000002','95050000-0000-0000-0000-000000000001','Plan','fixed_per_unit',10,'USD','2026-01-01'::date,1::smallint,10::smallint,null::date)$$,
  'P0001', 'recurring charge plan requires regular dues concept', 'editing the plan cannot swap in an extraordinary concept either'
);
reset role;

select * from finish();
rollback;
