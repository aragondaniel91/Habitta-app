begin;
select plan(23);

select has_function(
  'public',
  'update_recurring_charge_plan',
  array['uuid','uuid','uuid','uuid','text','public.recurring_charge_distribution','numeric','text','date','smallint','smallint','date'],
  'lifecycle-safe recurring plan update RPC exists'
);
select ok(
  not has_table_privilege('authenticated', 'public.recurring_charge_plans', 'UPDATE'),
  'authenticated clients still cannot update recurring plans directly'
);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000035201', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab352-admin@test.local', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000035202', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab352-board@test.local', 'x', now(), now());

insert into public.organizations (id, name, created_by)
values ('35200000-0000-4000-8000-000000000001', 'HAB 352 Org', '00000000-0000-0000-0000-000000035201');

insert into public.condominiums (id, organization_id, name, created_by)
values ('35210000-0000-4000-8000-000000000001', '35200000-0000-4000-8000-000000000001', 'HAB 352 Condo', '00000000-0000-0000-0000-000000035201');

insert into public.organization_memberships (organization_id, user_id, role)
values ('35200000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000035201', 'organization_owner');

insert into public.condominium_memberships (condominium_id, user_id, role)
values
  ('35210000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000035201', 'condominium_admin'),
  ('35210000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000035202', 'board_member');

insert into public.buildings (id, condominium_id, name, created_by)
values ('35220000-0000-4000-8000-000000000001', '35210000-0000-4000-8000-000000000001', 'Torre HAB 352', '00000000-0000-0000-0000-000000035201');

insert into public.units (id, condominium_id, building_id, code, type, ownership_percentage, created_by)
values
  ('35230000-0000-4000-8000-000000000001', '35210000-0000-4000-8000-000000000001', '35220000-0000-4000-8000-000000000001', 'A-01', 'apartment', 50, '00000000-0000-0000-0000-000000035201'),
  ('35230000-0000-4000-8000-000000000002', '35210000-0000-4000-8000-000000000001', '35220000-0000-4000-8000-000000000001', 'A-02', 'apartment', 50, '00000000-0000-0000-0000-000000035201');

insert into public.charge_concepts (id, condominium_id, code, name, category, default_currency_code, created_by)
values ('35240000-0000-4000-8000-000000000001', '35210000-0000-4000-8000-000000000001', 'ORD352', 'Cuota ordinaria HAB 352', 'regular_dues', 'USD', '00000000-0000-0000-0000-000000035201');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000035201', true);

select lives_ok(
  $$select public.create_financial_scope('35210000-0000-4000-8000-000000000001','hab352-building','Torre HAB 352','building','35220000-0000-4000-8000-000000000001',null)$$,
  'administrator creates edit-test financial scope'
);

select lives_ok(
  $$select public.create_recurring_charge_plan('35210000-0000-4000-8000-000000000001','35240000-0000-4000-8000-000000000001',(select id from public.financial_scopes where code='hab352-building'),'Cuota HAB 352','fixed_per_unit',42.00,'USD','2026-09-01'::date,1::smallint,10::smallint,null::date)$$,
  'administrator creates recurring plan before editing'
);

select is(
  (select count(*) from public.recurring_charge_runs where plan_id=(select id from public.recurring_charge_plans where name='Cuota HAB 352')),
  1::bigint,
  'initial scheduled run exists before edit'
);

select lives_ok(
  $$select public.update_recurring_charge_plan('35210000-0000-4000-8000-000000000001',(select id from public.recurring_charge_plans where name='Cuota HAB 352'),'35240000-0000-4000-8000-000000000001',(select id from public.financial_scopes where code='hab352-building'),'Cuota HAB 352 editada','fixed_per_unit',55.00,'USD','2026-09-01'::date,3::smallint,15::smallint,null::date)$$,
  'administrator edits unprepared recurring plan'
);

select is((select amount from public.recurring_charge_plans where name='Cuota HAB 352 editada'), 55.00::numeric, 'edited plan stores new amount');
select is((select issue_date from public.recurring_charge_runs where period='2026-09' and plan_id=(select id from public.recurring_charge_plans where name='Cuota HAB 352 editada')), '2026-09-03'::date, 'scheduled occurrence issue date resynchronizes');
select is((select due_date from public.recurring_charge_runs where period='2026-09' and plan_id=(select id from public.recurring_charge_plans where name='Cuota HAB 352 editada')), '2026-09-15'::date, 'scheduled occurrence due date resynchronizes');
select is((select status::text from public.recurring_charge_runs where period='2026-09' and plan_id=(select id from public.recurring_charge_plans where name='Cuota HAB 352 editada')), 'scheduled', 'editing does not prepare or post scheduled money');

select lives_ok(
  $$select public.prepare_recurring_charge_run((select id from public.recurring_charge_runs where period='2026-09' and plan_id=(select id from public.recurring_charge_plans where name='Cuota HAB 352 editada')))$$,
  'edited occurrence can be prepared for review'
);

select throws_ok(
  $$select public.update_recurring_charge_plan('35210000-0000-4000-8000-000000000001',(select id from public.recurring_charge_plans where name='Cuota HAB 352 editada'),'35240000-0000-4000-8000-000000000001',(select id from public.financial_scopes where code='hab352-building'),'No debe cambiar','fixed_per_unit',60.00,'USD','2026-09-01'::date,3::smallint,15::smallint,null::date)$$,
  'P0001',
  'recurring plan has pending review run',
  'pending-review snapshot blocks plan edits'
);

select lives_ok(
  $$select public.post_recurring_charge_run((select id from public.recurring_charge_runs where period='2026-09' and plan_id=(select id from public.recurring_charge_plans where name='Cuota HAB 352 editada')))$$,
  'reviewed edited occurrence can post'
);

select is((select total_amount from public.recurring_charge_runs where period='2026-09' and status='posted'), 110.00::numeric, 'posted occurrence preserves edited pre-publication amount');
select is((select sum(original_amount) from public.receivable_items where charge_batch_id=(select charge_batch_id from public.recurring_charge_runs where period='2026-09' and status='posted')), 110.00::numeric, 'posted receivables reconcile to edited amount');

select lives_ok(
  $$select public.update_recurring_charge_plan('35210000-0000-4000-8000-000000000001',(select id from public.recurring_charge_plans where name='Cuota HAB 352 editada'),'35240000-0000-4000-8000-000000000001',(select id from public.financial_scopes where code='hab352-building'),'Cuota HAB 352 futura','fixed_per_unit',60.00,'USD','2026-09-01'::date,4::smallint,16::smallint,null::date)$$,
  'plan can change prospectively after prior period posts'
);

select is((select total_amount from public.recurring_charge_runs where period='2026-09' and status='posted'), 110.00::numeric, 'prospective edit never reprices posted occurrence');
select is((select sum(original_amount) from public.receivable_items where charge_batch_id=(select charge_batch_id from public.recurring_charge_runs where period='2026-09' and status='posted')), 110.00::numeric, 'prospective edit never rewrites posted receivables');
select is((select due_date from public.recurring_charge_runs where period='2026-10' and status='scheduled'), '2026-10-16'::date, 'future scheduled occurrence resynchronizes after edit');
select is((select issue_date from public.recurring_charge_runs where period='2026-10' and status='scheduled'), '2026-10-04'::date, 'future scheduled issue date resynchronizes after edit');

select throws_ok(
  $$select public.update_recurring_charge_plan('35210000-0000-4000-8000-000000000001',(select id from public.recurring_charge_plans where name='Cuota HAB 352 futura'),'35240000-0000-4000-8000-000000000001',(select id from public.financial_scopes where code='hab352-building'),'Cuota fuera de historia','fixed_per_unit',60.00,'USD','2026-10-01'::date,4::smallint,16::smallint,null::date)$$,
  'P0001',
  'posted recurring history outside edited plan',
  'plan vigency cannot be edited to contradict posted history'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000035202', true);
select throws_ok(
  $$select public.update_recurring_charge_plan('35210000-0000-4000-8000-000000000001',(select id from public.recurring_charge_plans where name='Cuota HAB 352 futura'),'35240000-0000-4000-8000-000000000001',(select id from public.financial_scopes where code='hab352-building'),'Intento board','fixed_per_unit',61.00,'USD','2026-09-01'::date,4::smallint,16::smallint,null::date)$$,
  'P0001',
  'permission denied',
  'board member cannot edit recurring financial configuration without finance permission'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000035201', true);
select throws_ok(
  $$update public.recurring_charge_plans set amount=999 where name='Cuota HAB 352 futura'$$,
  '42501',
  'permission denied for table recurring_charge_plans',
  'authenticated clients cannot bypass RPC with direct update'
);

select * from finish();
rollback;
