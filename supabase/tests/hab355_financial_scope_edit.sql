begin;
select plan(52);

select has_function(
  'public',
  'update_financial_scope',
  array['uuid','uuid','text','text','public.financial_scope_kind','uuid','uuid[]','boolean'],
  'lifecycle-safe financial scope update RPC exists'
);
select ok(
  not has_table_privilege('authenticated', 'public.financial_scopes', 'UPDATE'),
  'authenticated clients still cannot update financial scopes directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.financial_scope_units', 'UPDATE'),
  'authenticated clients still cannot update financial scope memberships directly'
);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000035501', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab355-admin@test.local', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000035502', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab355-board@test.local', 'x', now(), now());

insert into public.organizations (id, name, created_by)
values ('35500000-0000-4000-8000-000000000001', 'HAB 355 Org', '00000000-0000-0000-0000-000000035501');

insert into public.condominiums (id, organization_id, name, created_by)
values
  ('35510000-0000-4000-8000-000000000001', '35500000-0000-4000-8000-000000000001', 'HAB 355 Condo A', '00000000-0000-0000-0000-000000035501'),
  ('35510000-0000-4000-8000-000000000002', '35500000-0000-4000-8000-000000000001', 'HAB 355 Condo B', '00000000-0000-0000-0000-000000035501');

insert into public.organization_memberships (organization_id, user_id, role)
values ('35500000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000035501', 'organization_owner');

insert into public.condominium_memberships (condominium_id, user_id, role)
values
  ('35510000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000035501', 'condominium_admin'),
  ('35510000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000035502', 'board_member');

insert into public.buildings (id, condominium_id, name, created_by)
values
  ('35520000-0000-4000-8000-000000000001', '35510000-0000-4000-8000-000000000001', 'Torre HAB 355 A', '00000000-0000-0000-0000-000000035501'),
  ('35520000-0000-4000-8000-000000000002', '35510000-0000-4000-8000-000000000002', 'Torre HAB 355 B', '00000000-0000-0000-0000-000000035501');

insert into public.units (id, condominium_id, building_id, code, type, ownership_percentage, created_by)
values
  ('35530000-0000-4000-8000-000000000001', '35510000-0000-4000-8000-000000000001', '35520000-0000-4000-8000-000000000001', 'A-01', 'apartment', 50, '00000000-0000-0000-0000-000000035501'),
  ('35530000-0000-4000-8000-000000000002', '35510000-0000-4000-8000-000000000001', '35520000-0000-4000-8000-000000000001', 'A-02', 'apartment', 50, '00000000-0000-0000-0000-000000035501'),
  ('35530000-0000-4000-8000-000000000003', '35510000-0000-4000-8000-000000000002', '35520000-0000-4000-8000-000000000002', 'B-01', 'apartment', 100, '00000000-0000-0000-0000-000000035501');

insert into public.charge_concepts (id, condominium_id, code, name, category, default_currency_code, created_by)
values ('35540000-0000-4000-8000-000000000001', '35510000-0000-4000-8000-000000000001', 'ORD355', 'Cuota ordinaria HAB 355', 'regular_dues', 'USD', '00000000-0000-0000-0000-000000035501');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000035501', true);

select lives_ok(
  $$select public.create_financial_scope('35510000-0000-4000-8000-000000000001','hab355-custom','Grupo HAB 355','custom',null,array['35530000-0000-4000-8000-000000000001'::uuid,'35530000-0000-4000-8000-000000000002'::uuid])$$,
  'administrator creates custom financial scope'
);
select is(
  (select count(*) from public.financial_scope_units where scope_id=(select id from public.financial_scopes where code='hab355-custom')),
  2::bigint,
  'custom scope starts with both units'
);

select lives_ok(
  $$select public.create_recurring_charge_plan('35510000-0000-4000-8000-000000000001','35540000-0000-4000-8000-000000000001',(select id from public.financial_scopes where code='hab355-custom'),'Cuota HAB 355','fixed_per_unit',10.00,'USD','2026-09-01'::date,1::smallint,10::smallint,null::date)$$,
  'administrator creates recurring plan using scope'
);

select throws_ok(
  $$select public.update_financial_scope('35510000-0000-4000-8000-000000000001',(select id from public.financial_scopes where code='hab355-custom'),'hab355-custom','Grupo inválido','custom',null,array['35530000-0000-4000-8000-000000000003'::uuid],true)$$,
  'P0001',
  'scope unit and financial scope must share condominium',
  'cross-tenant unit membership is denied'
);
select throws_ok(
  $$select public.update_financial_scope('35510000-0000-4000-8000-000000000001',(select id from public.financial_scopes where code='hab355-custom'),'hab355-building','Torre inválida','building','35520000-0000-4000-8000-000000000002',null,true)$$,
  'P0001',
  'building and financial scope must share condominium',
  'cross-tenant building assignment is denied'
);

select lives_ok(
  $$select public.prepare_recurring_charge_run((select id from public.recurring_charge_runs where plan_id=(select id from public.recurring_charge_plans where name='Cuota HAB 355') and period='2026-09'))$$,
  'scheduled run can be prepared before scope edit test'
);
select throws_ok(
  $$select public.update_financial_scope('35510000-0000-4000-8000-000000000001',(select id from public.financial_scopes where code='hab355-custom'),'hab355-custom','No debe cambiar','custom',null,array['35530000-0000-4000-8000-000000000001'::uuid],true)$$,
  'P0001',
  'financial scope has pending review run',
  'pending-review allocation blocks scope edits'
);

select lives_ok(
  $$select public.post_recurring_charge_run((select id from public.recurring_charge_runs where plan_id=(select id from public.recurring_charge_plans where name='Cuota HAB 355') and period='2026-09'))$$,
  'pending run posts before prospective scope edit'
);
select is(
  (select total_amount from public.recurring_charge_runs where plan_id=(select id from public.recurring_charge_plans where name='Cuota HAB 355') and period='2026-09'),
  20.00::numeric,
  'posted period froze both scoped units'
);

select lives_ok(
  $$select public.update_financial_scope('35510000-0000-4000-8000-000000000001',(select id from public.financial_scopes where code='hab355-custom'),'hab355-custom','Grupo HAB 355 ajustado','custom',null,array['35530000-0000-4000-8000-000000000001'::uuid],true)$$,
  'scope can change prospectively after prior period posts'
);
select is(
  (select count(*) from public.financial_scope_units where scope_id=(select id from public.financial_scopes where code='hab355-custom')),
  1::bigint,
  'custom membership is atomically replaced'
);
select is(
  (select total_amount from public.recurring_charge_runs where plan_id=(select id from public.recurring_charge_plans where name='Cuota HAB 355') and period='2026-09'),
  20.00::numeric,
  'prospective scope edit does not change posted total'
);
select is(
  (select jsonb_array_length(distribution_snapshot) from public.recurring_charge_runs where plan_id=(select id from public.recurring_charge_plans where name='Cuota HAB 355') and period='2026-09'),
  2,
  'prospective scope edit does not rewrite posted snapshot'
);

select lives_ok(
  $$select public.schedule_recurring_charge_run((select id from public.recurring_charge_plans where name='Cuota HAB 355'),'2026-10')$$,
  'next unprepared period remains schedulable after scope edit'
);
select lives_ok(
  $$select public.prepare_recurring_charge_run((select id from public.recurring_charge_runs where plan_id=(select id from public.recurring_charge_plans where name='Cuota HAB 355') and period='2026-10'))$$,
  'future scheduled run prepares from current scope membership'
);
select is(
  (select total_amount from public.recurring_charge_runs where plan_id=(select id from public.recurring_charge_plans where name='Cuota HAB 355') and period='2026-10'),
  10.00::numeric,
  'future preparation uses only the edited scope membership'
);
select is(
  (select jsonb_array_length(distribution_snapshot) from public.recurring_charge_runs where plan_id=(select id from public.recurring_charge_plans where name='Cuota HAB 355') and period='2026-10'),
  1,
  'future allocation snapshot deterministically reflects edited scope'
);

select lives_ok(
  $$select public.post_recurring_charge_run((select id from public.recurring_charge_runs where plan_id=(select id from public.recurring_charge_plans where name='Cuota HAB 355') and period='2026-10'))$$,
  'future edited-scope run can post normally'
);
select throws_ok(
  $$select public.update_financial_scope('35510000-0000-4000-8000-000000000001',(select id from public.financial_scopes where code='hab355-custom'),'hab355-custom','Grupo HAB 355 ajustado','custom',null,array['35530000-0000-4000-8000-000000000001'::uuid],false)$$,
  'P0001',
  'active recurring plan requires financial scope',
  'scope cannot be deactivated while an active recurring plan depends on it'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000035502', true);
select throws_ok(
  $$select public.update_financial_scope('35510000-0000-4000-8000-000000000001',(select id from public.financial_scopes where code='hab355-custom'),'hab355-custom','Intento board','custom',null,array['35530000-0000-4000-8000-000000000001'::uuid],true)$$,
  'P0001',
  'permission denied',
  'board member cannot edit financial configuration without finance permission'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000035501', true);
select throws_ok(
  $$update public.financial_scopes set name='bypass' where code='hab355-custom'$$,
  '42501',
  'permission denied for table financial_scopes',
  'authenticated clients cannot bypass RPC with direct scope update'
);
select throws_ok(
  $$update public.financial_scope_units set unit_id='35530000-0000-4000-8000-000000000002' where scope_id=(select id from public.financial_scopes where code='hab355-custom')$$,
  '42501',
  'permission denied for table financial_scope_units',
  'authenticated clients cannot bypass RPC with direct membership update'
);

select is(
  (select condominium_id from public.financial_scopes where code='hab355-custom'),
  '35510000-0000-4000-8000-000000000001'::uuid,
  'scope tenant identity remains unchanged'
);

-- Kind transitions, uniqueness and archival use a second scope so the narrative above stays intact.
select lives_ok(
  $$select public.create_financial_scope('35510000-0000-4000-8000-000000000001','hab355-general','Condominio general HAB 355','condominium',null,null)$$,
  'administrator creates a condominium-wide scope'
);
select throws_ok(
  $$select public.create_financial_scope('35510000-0000-4000-8000-000000000001','hab355-general-2','Otro general','condominium',null,null)$$,
  'P0001',
  'condominium financial scope already exists',
  'a condominium may only have one condominium-wide scope'
);
select throws_ok(
  $$select public.update_financial_scope('35510000-0000-4000-8000-000000000001',(select id from public.financial_scopes where code='hab355-custom'),'hab355-general','Codigo duplicado','custom',null,array['35530000-0000-4000-8000-000000000001'::uuid],true)$$,
  'P0001',
  'financial scope code already exists',
  'duplicate scope codes are reported as a domain error instead of a unique violation'
);

select lives_ok(
  $$select public.update_financial_scope('35510000-0000-4000-8000-000000000001',(select id from public.financial_scopes where code='hab355-general'),'hab355-general','Torre convertida','building','35520000-0000-4000-8000-000000000001',null,true)$$,
  'scope kind can move from condominium to building'
);
select is(
  (select building_id from public.financial_scopes where code='hab355-general'),
  '35520000-0000-4000-8000-000000000001'::uuid,
  'building transition stores the selected building'
);
select lives_ok(
  $$select public.update_financial_scope('35510000-0000-4000-8000-000000000001',(select id from public.financial_scopes where code='hab355-general'),'hab355-general','Grupo convertido','custom',null,array['35530000-0000-4000-8000-000000000002'::uuid],true)$$,
  'scope kind can move from building to custom'
);
select is(
  (select count(*) from public.financial_scope_units where scope_id=(select id from public.financial_scopes where code='hab355-general')),
  1::bigint,
  'custom transition creates the requested membership'
);
select is(
  (select building_id from public.financial_scopes where code='hab355-general'),
  null::uuid,
  'leaving building kind clears the building reference'
);
select lives_ok(
  $$select public.update_financial_scope('35510000-0000-4000-8000-000000000001',(select id from public.financial_scopes where code='hab355-general'),'hab355-general','General otra vez','condominium',null,null,true)$$,
  'scope kind can move back to condominium'
);
select is(
  (select count(*) from public.financial_scope_units where scope_id=(select id from public.financial_scopes where code='hab355-general')),
  0::bigint,
  'leaving custom kind clears the previous membership'
);
select throws_ok(
  $$select public.update_financial_scope('35510000-0000-4000-8000-000000000001',(select id from public.financial_scopes where code='hab355-general'),'hab355-general','General invalido','condominium',null,array['35530000-0000-4000-8000-000000000002'::uuid],true)$$,
  'P0001',
  'invalid financial scope configuration',
  'units cannot be attached to a non-custom scope'
);

select lives_ok(
  $$select public.update_financial_scope('35510000-0000-4000-8000-000000000001',(select id from public.financial_scopes where code='hab355-general'),'hab355-general','General otra vez','condominium',null,null,false)$$,
  'a scope without dependent plans can be archived'
);
select is(
  (select is_active from public.financial_scopes where code='hab355-general'),
  false,
  'archived scope is deactivated instead of deleted'
);

-- Published history must survive every edit above untouched.
select is(
  (select count(*) from public.receivable_items where charge_batch_id=(select charge_batch_id from public.recurring_charge_runs where plan_id=(select id from public.recurring_charge_plans where name='Cuota HAB 355') and period='2026-09')),
  2::bigint,
  'posted period keeps every receivable it published'
);
select is(
  (select sum(original_amount) from public.receivable_items where charge_batch_id=(select charge_batch_id from public.recurring_charge_runs where plan_id=(select id from public.recurring_charge_plans where name='Cuota HAB 355') and period='2026-09')),
  20.00::numeric,
  'posted receivables keep their original published amounts'
);
select is(
  (select sum(amount) from public.receivable_ledger_entries where condominium_id='35510000-0000-4000-8000-000000000001' and direction='debit'),
  30.00::numeric,
  'ledger history across both posted periods is unchanged by scope edits'
);

-- Guards the API promises to translate for the administrator but that nothing exercised at runtime.

select throws_ok(
  $$select public.create_financial_scope('35510000-0000-4000-8000-000000000001','   ','   ','custom',null,array['35530000-0000-4000-8000-000000000001'::uuid])$$,
  'P0001',
  'scope code and name are required',
  'a scope cannot be created without a code and a name'
);
select throws_ok(
  $$select public.create_financial_scope('35510000-0000-4000-8000-000000000001','hab355-vacio','Grupo vacio','custom',null,null)$$,
  'P0001',
  'custom financial scope requires units',
  'a custom scope with no units is refused'
);
select lives_ok(
  $$select public.create_financial_scope('35510000-0000-4000-8000-000000000001','hab355-torre','Torre A','building','35520000-0000-4000-8000-000000000001',null)$$,
  'the first building scope is created'
);
select throws_ok(
  $$select public.create_financial_scope('35510000-0000-4000-8000-000000000001','hab355-torre-2','Torre A otra vez','building','35520000-0000-4000-8000-000000000001',null)$$,
  'P0001',
  'building financial scope already exists',
  'a building cannot carry two financial scopes'
);
select throws_ok(
  $$select public.create_recurring_charge_plan('35510000-0000-4000-8000-000000000001','35540000-0000-4000-8000-000000000001',(select id from public.financial_scopes where code='hab355-custom'),'Plan invalido','fixed_per_unit',0.00,'USD','2026-09-01'::date,1::smallint,10::smallint,null::date)$$,
  'P0001',
  'invalid recurring charge plan',
  'a plan with a non-positive amount is refused'
);
select throws_ok(
  $$select public.update_recurring_charge_plan('35510000-0000-4000-8000-000000000001','35599999-0000-4000-8000-000000000999','35540000-0000-4000-8000-000000000001',(select id from public.financial_scopes where code='hab355-custom'),'Inexistente','fixed_per_unit',10.00,'USD','2026-09-01'::date,1::smallint,10::smallint,null::date)$$,
  'P0001',
  'recurring plan unavailable',
  'editing a plan that does not exist is refused by name'
);
select throws_ok(
  $$select public.set_recurring_charge_plan_status('35510000-0000-4000-8000-000000000001',(select id from public.recurring_charge_plans where name='Cuota HAB 355'),null)$$,
  'P0001',
  'invalid recurring plan status',
  'a plan status must say which state it wants'
);
select throws_ok(
  $$select public.schedule_recurring_charge_run((select id from public.recurring_charge_plans where name='Cuota HAB 355'),'2026-13')$$,
  'P0001',
  'invalid recurring period',
  'a period outside the calendar is refused before anything is written'
);

-- Narrowing a plan's window must not strand a period already scheduled outside it.
select lives_ok(
  $$select public.schedule_recurring_charge_run((select id from public.recurring_charge_plans where name='Cuota HAB 355'),'2026-12')$$,
  'a later period is scheduled'
);
select throws_ok(
  $$select public.update_recurring_charge_plan('35510000-0000-4000-8000-000000000001',(select id from public.recurring_charge_plans where name='Cuota HAB 355'),'35540000-0000-4000-8000-000000000001',(select id from public.financial_scopes where code='hab355-custom'),'Cuota HAB 355','fixed_per_unit',10.00,'USD','2026-09-01'::date,1::smallint,10::smallint,'2026-10-31'::date)$$,
  'P0001',
  'scheduled recurring period outside edited plan',
  'the plan cannot end before a period it already has scheduled'
);

select * from finish();
rollback;
