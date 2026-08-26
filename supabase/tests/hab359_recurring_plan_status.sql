begin;
select plan(22);

select has_function(
  'public',
  'set_recurring_charge_plan_status',
  array['uuid','uuid','boolean'],
  'recurring plan status transition RPC exists'
);
select ok(
  not has_table_privilege('authenticated', 'public.recurring_charge_plans', 'UPDATE'),
  'authenticated clients still cannot update recurring plans directly'
);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000035901', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab359-admin@test.local', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000035902', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab359-board@test.local', 'x', now(), now());

insert into public.organizations (id, name, created_by)
values ('35900000-0000-4000-8000-000000000001', 'HAB 359 Org', '00000000-0000-0000-0000-000000035901');

insert into public.condominiums (id, organization_id, name, created_by)
values ('35910000-0000-4000-8000-000000000001', '35900000-0000-4000-8000-000000000001', 'HAB 359 Condo', '00000000-0000-0000-0000-000000035901');

insert into public.organization_memberships (organization_id, user_id, role)
values ('35900000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000035901', 'organization_owner');

insert into public.condominium_memberships (condominium_id, user_id, role)
values
  ('35910000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000035901', 'condominium_admin'),
  ('35910000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000035902', 'board_member');

insert into public.buildings (id, condominium_id, name, created_by)
values ('35920000-0000-4000-8000-000000000001', '35910000-0000-4000-8000-000000000001', 'Torre HAB 359', '00000000-0000-0000-0000-000000035901');

insert into public.units (id, condominium_id, building_id, code, type, ownership_percentage, created_by)
values
  ('35930000-0000-4000-8000-000000000001', '35910000-0000-4000-8000-000000000001', '35920000-0000-4000-8000-000000000001', 'C-01', 'apartment', 60, '00000000-0000-0000-0000-000000035901'),
  ('35930000-0000-4000-8000-000000000002', '35910000-0000-4000-8000-000000000001', '35920000-0000-4000-8000-000000000001', 'C-02', 'apartment', 40, '00000000-0000-0000-0000-000000035901');

insert into public.charge_concepts (id, condominium_id, code, name, category, default_currency_code, created_by)
values ('35940000-0000-4000-8000-000000000001', '35910000-0000-4000-8000-000000000001', 'ORD359', 'Cuota ordinaria HAB 359', 'regular_dues', 'USD', '00000000-0000-0000-0000-000000035901');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000035901', true);

select lives_ok(
  $$select public.create_financial_scope('35910000-0000-4000-8000-000000000001','hab359-general','General HAB 359','condominium',null,null)$$,
  'administrator creates the scope the plan will depend on'
);
select lives_ok(
  $$select public.create_recurring_charge_plan('35910000-0000-4000-8000-000000000001','35940000-0000-4000-8000-000000000001',(select id from public.financial_scopes where code='hab359-general'),'Cuota HAB 359','fixed_per_unit',20.00,'USD','2026-09-01'::date,1::smallint,10::smallint,null::date)$$,
  'administrator creates the recurring plan'
);

-- Publish September so the test can prove deactivation never touches published history.
select lives_ok(
  $$select public.prepare_recurring_charge_run((select id from public.recurring_charge_runs where plan_id=(select id from public.recurring_charge_plans where name='Cuota HAB 359') and period='2026-09'))$$,
  'September freezes for review'
);
select throws_ok(
  $$select public.set_recurring_charge_plan_status('35910000-0000-4000-8000-000000000001',(select id from public.recurring_charge_plans where name='Cuota HAB 359'),false)$$,
  'P0001',
  'recurring plan has pending review run',
  'a reviewed period blocks stopping the plan underneath it'
);
select lives_ok(
  $$select public.post_recurring_charge_run((select id from public.recurring_charge_runs where plan_id=(select id from public.recurring_charge_plans where name='Cuota HAB 359') and period='2026-09'))$$,
  'September publishes'
);
select is(
  (select total_amount from public.recurring_charge_runs where plan_id=(select id from public.recurring_charge_plans where name='Cuota HAB 359') and period='2026-09'),
  40.00::numeric,
  'published period totals both units'
);

select lives_ok(
  $$select public.schedule_recurring_charge_run((select id from public.recurring_charge_plans where name='Cuota HAB 359'),'2026-10')$$,
  'October is scheduled but never prepared'
);

-- Permission boundary before the happy path so a failure cannot be masked by an inactive plan.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000035902', true);
select throws_ok(
  $$select public.set_recurring_charge_plan_status('35910000-0000-4000-8000-000000000001',(select id from public.recurring_charge_plans where name='Cuota HAB 359'),false)$$,
  'P0001',
  'permission denied',
  'a board member cannot stop a recurring plan'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000035901', true);

select lives_ok(
  $$select public.set_recurring_charge_plan_status('35910000-0000-4000-8000-000000000001',(select id from public.recurring_charge_plans where name='Cuota HAB 359'),false)$$,
  'administrator stops the recurring plan'
);
select is(
  (select status from public.recurring_charge_plans where name='Cuota HAB 359'),
  'inactive'::public.recurring_charge_plan_status,
  'plan is deactivated instead of deleted'
);
select is(
  (select status from public.recurring_charge_runs where plan_id=(select id from public.recurring_charge_plans where name='Cuota HAB 359') and period='2026-10'),
  'cancelled'::public.recurring_charge_run_status,
  'the scheduled period is cancelled with the plan'
);
select is(
  (select status from public.recurring_charge_runs where plan_id=(select id from public.recurring_charge_plans where name='Cuota HAB 359') and period='2026-09'),
  'posted'::public.recurring_charge_run_status,
  'the published period keeps its posted status'
);
select is(
  (select total_amount from public.recurring_charge_runs where plan_id=(select id from public.recurring_charge_plans where name='Cuota HAB 359') and period='2026-09'),
  40.00::numeric,
  'deactivation does not rewrite the published total'
);
select is(
  (select sum(original_amount) from public.receivable_items where charge_batch_id=(select charge_batch_id from public.recurring_charge_runs where plan_id=(select id from public.recurring_charge_plans where name='Cuota HAB 359') and period='2026-09')),
  40.00::numeric,
  'deactivation does not touch published receivables'
);

select throws_ok(
  $$select public.schedule_recurring_charge_run((select id from public.recurring_charge_plans where name='Cuota HAB 359'),'2026-11')$$,
  'P0001',
  'period outside active plan',
  'a stopped plan cannot schedule new periods'
);

-- HAB-355 archive guard becomes reachable once the dependent plan is stopped.
select lives_ok(
  $$select public.update_financial_scope('35910000-0000-4000-8000-000000000001',(select id from public.financial_scopes where code='hab359-general'),'hab359-general','General HAB 359','condominium',null,null,false)$$,
  'the scope can finally be archived once no active plan depends on it'
);
select lives_ok(
  $$select public.update_financial_scope('35910000-0000-4000-8000-000000000001',(select id from public.financial_scopes where code='hab359-general'),'hab359-general','General HAB 359','condominium',null,null,true)$$,
  'the scope is restored so reactivation can be exercised'
);

select lives_ok(
  $$select public.set_recurring_charge_plan_status('35910000-0000-4000-8000-000000000001',(select id from public.recurring_charge_plans where name='Cuota HAB 359'),true)$$,
  'a stopped plan can be restarted'
);
select is(
  (select status from public.recurring_charge_runs where plan_id=(select id from public.recurring_charge_plans where name='Cuota HAB 359') and period='2026-10'),
  'cancelled'::public.recurring_charge_run_status,
  'restarting never resurrects a cancelled period'
);

select throws_ok(
  $$update public.recurring_charge_plans set status='inactive' where name='Cuota HAB 359'$$,
  '42501',
  'permission denied for table recurring_charge_plans',
  'authenticated clients cannot bypass the RPC with a direct status update'
);

select * from finish();
rollback;
