begin;
select plan(17);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000035401', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab354-admin@test.local', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000035402', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab354-board@test.local', 'x', now(), now());

insert into public.organizations (id, name, created_by)
values ('35400000-0000-4000-8000-000000000001', 'HAB 354 Org', '00000000-0000-0000-0000-000000035401');

insert into public.condominiums (id, organization_id, name, created_by)
values
  ('35410000-0000-4000-8000-000000000001', '35400000-0000-4000-8000-000000000001', 'HAB 354 Condo', '00000000-0000-0000-0000-000000035401'),
  ('35410000-0000-4000-8000-000000000002', '35400000-0000-4000-8000-000000000001', 'HAB 354 Other Condo', '00000000-0000-0000-0000-000000035401');

insert into public.organization_memberships (organization_id, user_id, role)
values ('35400000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000035401', 'organization_owner');

insert into public.condominium_memberships (condominium_id, user_id, role)
values
  ('35410000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000035401', 'condominium_admin'),
  ('35410000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000035402', 'board_member');

insert into public.buildings (id, condominium_id, name, created_by)
values ('35420000-0000-4000-8000-000000000001', '35410000-0000-4000-8000-000000000001', 'Torre HAB 354', '00000000-0000-0000-0000-000000035401');

insert into public.units (id, condominium_id, building_id, code, type, ownership_percentage, created_by)
values ('35430000-0000-4000-8000-000000000001', '35410000-0000-4000-8000-000000000001', '35420000-0000-4000-8000-000000000001', 'A-01', 'apartment', 100, '00000000-0000-0000-0000-000000035401');

insert into public.charge_concepts (id, condominium_id, code, name, category, default_currency_code, default_amount, created_by)
values ('35440000-0000-4000-8000-000000000001', '35410000-0000-4000-8000-000000000001', 'TEMP354', 'Concepto temporal', 'other', 'USD', 30.00, '00000000-0000-0000-0000-000000035401');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000035401', true);

select lives_ok(
  $$update public.charge_concepts set code='MANT354', name='Cuota HAB 354', category='regular_dues' where id='35440000-0000-4000-8000-000000000001'$$,
  'semantic fields can be corrected before financial history exists'
);
select is((select code from public.charge_concepts where id='35440000-0000-4000-8000-000000000001'), 'MANT354', 'pre-history code edit persists');
select is((select category::text from public.charge_concepts where id='35440000-0000-4000-8000-000000000001'), 'regular_dues', 'pre-history category edit persists');

select lives_ok(
  $$update public.charge_concepts set description='Configuración prospectiva', default_amount=35.00, default_currency_code='VES' where id='35440000-0000-4000-8000-000000000001'$$,
  'defaults and description are editable before posting'
);

select lives_ok(
  $$select public.create_receivable_item('35410000-0000-4000-8000-000000000001','35430000-0000-4000-8000-000000000001','35440000-0000-4000-8000-000000000001','Cargo HAB 354 publicado',35.00,'VES','2026-08-25'::date,'2026-09-10'::date)$$,
  'administrator creates financial history for the concept'
);

select throws_ok(
  $$update public.charge_concepts set name='Nombre retroactivo' where id='35440000-0000-4000-8000-000000000001'$$,
  'P0001',
  'historical charge concept semantics are immutable',
  'concept name cannot rewrite historical presentation'
);
select throws_ok(
  $$update public.charge_concepts set code='RETRO354' where id='35440000-0000-4000-8000-000000000001'$$,
  'P0001',
  'historical charge concept semantics are immutable',
  'concept code cannot change after financial history exists'
);
select throws_ok(
  $$update public.charge_concepts set category='other' where id='35440000-0000-4000-8000-000000000001'$$,
  'P0001',
  'historical charge concept semantics are immutable',
  'concept category cannot change after financial history exists'
);
select is((select name from public.charge_concepts where id='35440000-0000-4000-8000-000000000001'), 'Cuota HAB 354', 'failed semantic edits leave the historical name unchanged');

select lives_ok(
  $$update public.charge_concepts set description='Nueva guía prospectiva', default_amount=40.00, default_currency_code='USD' where id='35440000-0000-4000-8000-000000000001'$$,
  'description and defaults remain prospectively editable after history exists'
);
select is((select default_amount from public.charge_concepts where id='35440000-0000-4000-8000-000000000001'), 40.00::numeric, 'future default amount stores without repricing history');
select is((select description from public.receivable_ledger_entries where receivable_item_id=(select id from public.receivable_items where concept_id='35440000-0000-4000-8000-000000000001' limit 1)), 'Cargo HAB 354 publicado', 'ledger history is unchanged by concept default edits');

select throws_ok(
  $$update public.charge_concepts set condominium_id='35410000-0000-4000-8000-000000000002' where id='35440000-0000-4000-8000-000000000001'$$,
  'P0001',
  'charge concept tenant is immutable',
  'concept cannot move between condominiums even for an organization owner'
);

select lives_ok(
  $$select public.create_financial_scope('35410000-0000-4000-8000-000000000001','hab354-building','Torre HAB 354','building','35420000-0000-4000-8000-000000000001',null)$$,
  'administrator creates recurring-test financial scope'
);
select lives_ok(
  $$select public.create_recurring_charge_plan('35410000-0000-4000-8000-000000000001','35440000-0000-4000-8000-000000000001',(select id from public.financial_scopes where code='hab354-building'),'Plan HAB 354','fixed_per_unit',40.00,'USD','2026-09-01'::date,1::smallint,10::smallint,null::date)$$,
  'administrator creates an active recurring plan using the concept'
);
select throws_ok(
  $$update public.charge_concepts set is_active=false where id='35440000-0000-4000-8000-000000000001'$$,
  'P0001',
  'active recurring plan requires concept',
  'concept cannot be deactivated while an active recurring plan depends on it'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000035402', true);
select lives_ok(
  $$update public.charge_concepts set description='Intento de junta' where id='35440000-0000-4000-8000-000000000001'$$,
  'unauthorized board update is safely filtered by RLS'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000035401', true);
select is((select description from public.charge_concepts where id='35440000-0000-4000-8000-000000000001'), 'Nueva guía prospectiva', 'board member cannot mutate financial configuration');

select * from finish();
rollback;
