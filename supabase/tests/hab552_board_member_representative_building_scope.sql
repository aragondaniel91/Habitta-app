begin;
select plan(29);

-- HAB-552: relationship records and board membership remain distinct from
-- financial authority in a whole-building charging complex.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, created_at, updated_at
) values
  ('55200000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab552-admin@test.local', 'x', now(), now()),
  ('55200000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab552-board@test.local', 'x', now(), now()),
  ('55200000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab552-representative@test.local', 'x', now(), now()),
  ('55200000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab552-other-admin@test.local', 'x', now(), now());

insert into public.organizations (id, name, created_by) values
  ('55210000-0000-4000-8000-000000000001', 'HAB-552 Primary Organization', '55200000-0000-4000-8000-000000000001'),
  ('55210000-0000-4000-8000-000000000002', 'HAB-552 Other Organization', '55200000-0000-4000-8000-000000000004');

insert into public.condominiums (
  id, organization_id, name, property_topology, charge_scope,
  declared_building_count, created_by
) values
  ('55220000-0000-4000-8000-000000000001', '55210000-0000-4000-8000-000000000001',
   'HAB-552 General Ten Buildings', 'multi_building_complex', 'building', 10,
   '55200000-0000-4000-8000-000000000001'),
  ('55220000-0000-4000-8000-000000000002', '55210000-0000-4000-8000-000000000002',
   'HAB-552 Other Tenant', 'multi_building_complex', 'building', 10,
   '55200000-0000-4000-8000-000000000004');

insert into public.condominium_memberships (condominium_id, user_id, role) values
  ('55220000-0000-4000-8000-000000000001', '55200000-0000-4000-8000-000000000001', 'condominium_admin'),
  ('55220000-0000-4000-8000-000000000001', '55200000-0000-4000-8000-000000000002', 'board_member'),
  ('55220000-0000-4000-8000-000000000002', '55200000-0000-4000-8000-000000000004', 'condominium_admin');

insert into public.buildings (id, condominium_id, name, created_by)
select
  ('55230000-0000-4000-8000-' || lpad(building_number::text, 12, '0'))::uuid,
  '55220000-0000-4000-8000-000000000001',
  'Edificio ' || building_number,
  '55200000-0000-4000-8000-000000000001'
from generate_series(1, 10) as building_number;

insert into public.units (id, condominium_id, building_id, code, type, created_by)
select
  ('55240000-0000-4000-8000-' || lpad(building_number::text, 12, '0'))::uuid,
  '55220000-0000-4000-8000-000000000001',
  ('55230000-0000-4000-8000-' || lpad(building_number::text, 12, '0'))::uuid,
  'Edificio ' || building_number,
  'building',
  '55200000-0000-4000-8000-000000000001'
from generate_series(1, 10) as building_number;

insert into public.buildings (id, condominium_id, name, created_by) values (
  '55230000-0000-4000-8000-000000000011',
  '55220000-0000-4000-8000-000000000002', 'Edificio ajeno',
  '55200000-0000-4000-8000-000000000004'
);
insert into public.units (id, condominium_id, building_id, code, type, created_by) values (
  '55240000-0000-4000-8000-000000000011',
  '55220000-0000-4000-8000-000000000002', '55230000-0000-4000-8000-000000000011',
  'Edificio ajeno', 'building', '55200000-0000-4000-8000-000000000004'
);

insert into public.people (
  id, condominium_id, first_name, last_name, status, auth_user_id, created_by
) values (
  '55250000-0000-4000-8000-000000000001',
  '55220000-0000-4000-8000-000000000001', 'Rene', 'Representative', 'active',
  '55200000-0000-4000-8000-000000000003', '55200000-0000-4000-8000-000000000001'
);

insert into public.condominium_person_relationships (
  id, condominium_id, person_id, relationship_type, title, created_by
) values (
  '55260000-0000-4000-8000-000000000001',
  '55220000-0000-4000-8000-000000000001', '55250000-0000-4000-8000-000000000001',
  'representative', 'Representante', '55200000-0000-4000-8000-000000000001'
);

insert into public.charge_concepts (
  id, condominium_id, code, name, category, default_currency_code, created_by
) values (
  '55270000-0000-4000-8000-000000000001',
  '55220000-0000-4000-8000-000000000001', 'HAB552', 'HAB-552 ordinary charge',
  'regular_dues', 'USD', '55200000-0000-4000-8000-000000000001'
), (
  '55270000-0000-4000-8000-000000000002',
  '55220000-0000-4000-8000-000000000002', 'HAB552-OTHER', 'HAB-552 other charge',
  'regular_dues', 'USD', '55200000-0000-4000-8000-000000000004'
);

insert into public.condominium_payment_methods (
  id, condominium_id, method_type, display_name, currency_code,
  requires_reference, requires_proof, is_active, created_by
) values (
  '55280000-0000-4000-8000-000000000001',
  '55220000-0000-4000-8000-000000000001', 'cash', 'HAB-552 Cash USD', 'USD',
  false, false, true, '55200000-0000-4000-8000-000000000001'
);

select is(
  (select property_topology::text || ':' || charge_scope::text || ':' || declared_building_count::text
   from public.condominiums where id = '55220000-0000-4000-8000-000000000001'),
  'multi_building_complex:building:10',
  'fixture is a general building-scoped complex with ten physical buildings'
);
select is(
  (select count(*) from public.units
   where condominium_id = '55220000-0000-4000-8000-000000000001' and type = 'building'),
  10::bigint,
  'fixture has one building billing unit for each physical building'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '55200000-0000-4000-8000-000000000001', true);
select public.create_receivable_item(
  '55220000-0000-4000-8000-000000000001',
  ('55240000-0000-4000-8000-' || lpad(building_number::text, 12, '0'))::uuid,
  '55270000-0000-4000-8000-000000000001',
  'HAB-552 charge for Edificio ' || building_number, 10.00, 'USD', current_date, null
)
from generate_series(1, 10) as building_number;
select public.create_payment_draft(
  '55220000-0000-4000-8000-000000000001',
  '55240000-0000-4000-8000-000000000001',
  '55280000-0000-4000-8000-000000000001', null, current_date, 5.00, 'USD',
  'HAB-552 canonical payer', 'HAB552-CANONICAL', null, 'hab552-canonical-payment'
);
select set_config('request.jwt.claim.sub', '55200000-0000-4000-8000-000000000004', true);
select public.create_receivable_item(
  '55220000-0000-4000-8000-000000000002',
  '55240000-0000-4000-8000-000000000011',
  '55270000-0000-4000-8000-000000000002', 'HAB-552 other tenant charge', 20.00, 'USD', current_date, null
);
select set_config('request.jwt.claim.sub', '55200000-0000-4000-8000-000000000001', true);

select is(
  (select count(*) from public.receivable_items
   where condominium_id = '55220000-0000-4000-8000-000000000001'),
  10::bigint,
  'financial fixture contains a charge for every building unit'
);
select is(
  (select count(*) from public.payments where idempotency_key = 'hab552-canonical-payment'),
  1::bigint,
  'financial fixture contains one canonical payment draft'
);

select set_config('request.jwt.claim.sub', '55200000-0000-4000-8000-000000000002', true);
select ok(public.can_read_board_aggregates('55220000-0000-4000-8000-000000000001'),
  'board member retains the canonical aggregate-read capability');
select ok(not public.can_manage_receivables('55220000-0000-4000-8000-000000000001'),
  'board member cannot manage receivables');
select ok(not public.can_register_payment_for('55220000-0000-4000-8000-000000000001'),
  'board member cannot register payments');
select ok(not public.can_review_payments('55220000-0000-4000-8000-000000000001'),
  'board member cannot review payments');
select ok(not public.can_submit_payment('55240000-0000-4000-8000-000000000001'),
  'board membership alone cannot submit a building payment');
select is(
  (select count(*) from public.get_receivables_summary('55220000-0000-4000-8000-000000000001')),
  1::bigint,
  'board member can read the canonical condominium aggregate only'
);
select is(
  (select count(*) from public.get_receivables_aging('55220000-0000-4000-8000-000000000001')),
  1::bigint,
  'board member can read the canonical aging aggregate only'
);
select is(
  (select count(*) from public.receivable_items
   where condominium_id = '55220000-0000-4000-8000-000000000001'),
  0::bigint,
  'board member cannot enumerate individual building charges through RLS'
);
select is(
  (select count(*) from public.payments where idempotency_key = 'hab552-canonical-payment'),
  0::bigint,
  'board member cannot read the canonical payment through RLS'
);
select throws_ok(
  $$select public.create_payment_draft(
    '55220000-0000-4000-8000-000000000001',
    '55240000-0000-4000-8000-000000000001',
    '55280000-0000-4000-8000-000000000001', null, current_date, 5.00, 'USD',
    'Board member', null, null, 'hab552-board-payment'
  )$$,
  '42501', 'payment submission denied',
  'board member cannot write a financial payment'
);
select throws_ok(
  $$select public.create_receivable_item(
    '55220000-0000-4000-8000-000000000001',
    '55240000-0000-4000-8000-000000000001',
    '55270000-0000-4000-8000-000000000001', 'Board charge', 1.00, 'USD', current_date, null
  )$$,
  null, 'permission denied',
  'board member cannot write a financial charge'
);
select ok(not public.can_read_board_aggregates('55220000-0000-4000-8000-000000000002'),
  'board membership does not cross tenant boundaries');
select is(
  (select count(*) from public.get_receivables_summary('55220000-0000-4000-8000-000000000002')),
  0::bigint,
  'board member cannot read another tenant aggregate'
);

select set_config('request.jwt.claim.sub', '55200000-0000-4000-8000-000000000003', true);
select is(
  (select count(*) from public.condominium_person_relationships
   where id = '55260000-0000-4000-8000-000000000001'),
  1::bigint,
  'representative can read their own canonical relationship record'
);
select ok(not public.can_read_financial_unit('55240000-0000-4000-8000-000000000001'),
  'representative relationship does not grant financial-unit reads');
select ok(not public.can_manage_receivables('55220000-0000-4000-8000-000000000001'),
  'representative relationship does not grant receivables management');
select ok(not public.can_register_payment_for('55220000-0000-4000-8000-000000000001'),
  'representative relationship does not grant payment registration');
select ok(not public.can_review_payments('55220000-0000-4000-8000-000000000001'),
  'representative relationship does not grant payment review');
select ok(not public.can_submit_payment('55240000-0000-4000-8000-000000000001'),
  'representative relationship does not grant payment submission');
select ok(not public.can_read_board_aggregates('55220000-0000-4000-8000-000000000002'),
  'representative relationship does not cross tenant aggregate boundaries');
select ok(not public.can_register_payment_for('55220000-0000-4000-8000-000000000002'),
  'representative relationship does not cross tenant payment-registration boundaries');
select is(
  (select count(*) from public.receivable_items
   where condominium_id = '55220000-0000-4000-8000-000000000001'),
  0::bigint,
  'representative cannot read building charges through RLS'
);
select is(
  (select count(*) from public.payments where idempotency_key = 'hab552-canonical-payment'),
  0::bigint,
  'representative cannot read the canonical payment through RLS'
);
select throws_ok(
  $$select public.create_payment_draft(
    '55220000-0000-4000-8000-000000000001',
    '55240000-0000-4000-8000-000000000001',
    '55280000-0000-4000-8000-000000000001', null, current_date, 5.00, 'USD',
    'Representative', null, null, 'hab552-representative-payment'
  )$$,
  '42501', 'payment submission denied',
  'representative cannot write a financial payment'
);
select throws_ok(
  $$select public.create_receivable_item(
    '55220000-0000-4000-8000-000000000001',
    '55240000-0000-4000-8000-000000000001',
    '55270000-0000-4000-8000-000000000001', 'Representative charge', 1.00, 'USD', current_date, null
  )$$,
  null, 'permission denied',
  'representative cannot write a financial charge'
);

reset role;
select * from finish();
rollback;
