begin;
select plan(34);

-- HAB-551: a building-scoped complex must keep a partial payment isolated to
-- its own building account while retaining the canonical payment audit trail.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, created_at, updated_at
) values
  ('55100000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab551-admin@test.local', 'x', now(), now()),
  ('55100000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab551-accountant@test.local', 'x', now(), now()),
  ('55100000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab551-reviewer@test.local', 'x', now(), now()),
  ('55100000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab551-outsider@test.local', 'x', now(), now()),
  ('55100000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab551-board@test.local', 'x', now(), now());

insert into public.organizations (id, name, created_by)
values (
  '55110000-0000-4000-8000-000000000001',
  'HAB-551 Organization',
  '55100000-0000-4000-8000-000000000001'
);

insert into public.condominiums (
  id, organization_id, name, property_topology, charge_scope,
  declared_building_count, created_by
) values (
  '55120000-0000-4000-8000-000000000001',
  '55110000-0000-4000-8000-000000000001',
  'HAB-551 Ten Building Complex',
  'multi_building_complex',
  'building',
  10,
  '55100000-0000-4000-8000-000000000001'
);

insert into public.condominium_memberships (condominium_id, user_id, role)
values
  ('55120000-0000-4000-8000-000000000001', '55100000-0000-4000-8000-000000000001', 'condominium_admin'),
  ('55120000-0000-4000-8000-000000000001', '55100000-0000-4000-8000-000000000002', 'accountant'),
  ('55120000-0000-4000-8000-000000000001', '55100000-0000-4000-8000-000000000003', 'payment_reviewer'),
  ('55120000-0000-4000-8000-000000000001', '55100000-0000-4000-8000-000000000005', 'board_member');

insert into public.buildings (id, condominium_id, name, created_by)
select
  ('55130000-0000-4000-8000-' || lpad(building_number::text, 12, '0'))::uuid,
  '55120000-0000-4000-8000-000000000001',
  'Edificio ' || building_number,
  '55100000-0000-4000-8000-000000000001'
from generate_series(1, 10) as building_number;

insert into public.units (
  id, condominium_id, building_id, code, type, ownership_percentage, created_by
)
select
  ('55140000-0000-4000-8000-' || lpad(building_number::text, 12, '0'))::uuid,
  '55120000-0000-4000-8000-000000000001',
  ('55130000-0000-4000-8000-' || lpad(building_number::text, 12, '0'))::uuid,
  'Edificio ' || building_number,
  'building',
  10,
  '55100000-0000-4000-8000-000000000001'
from generate_series(1, 10) as building_number;

insert into public.charge_concepts (
  id, condominium_id, code, name, category, default_currency_code, created_by
) values (
  '55150000-0000-4000-8000-000000000001',
  '55120000-0000-4000-8000-000000000001',
  'HAB551',
  'HAB-551 ordinary charge',
  'regular_dues',
  'USD',
  '55100000-0000-4000-8000-000000000001'
);

insert into public.condominium_payment_methods (
  id, condominium_id, method_type, display_name, currency_code,
  requires_reference, requires_proof, is_active, created_by
) values (
  '55160000-0000-4000-8000-000000000001',
  '55120000-0000-4000-8000-000000000001',
  'cash',
  'HAB-551 Cash USD',
  'USD',
  false,
  false,
  true,
  '55100000-0000-4000-8000-000000000001'
);

select is(
  (select property_topology::text || ':' || charge_scope::text || ':' || declared_building_count::text
   from public.condominiums where id = '55120000-0000-4000-8000-000000000001'),
  'multi_building_complex:building:10',
  'fixture is a ten-building, building-scoped complex'
);
select is(
  (select count(*) from public.units where condominium_id = '55120000-0000-4000-8000-000000000001' and type = 'building'),
  10::bigint,
  'fixture contains ten building billing units'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '55100000-0000-4000-8000-000000000001', true);

select public.create_receivable_item(
  '55120000-0000-4000-8000-000000000001',
  ('55140000-0000-4000-8000-' || lpad(building_number::text, 12, '0'))::uuid,
  '55150000-0000-4000-8000-000000000001',
  'HAB-551 ordinary charge for Edificio ' || building_number,
  12.34,
  'USD',
  current_date - 1,
  null
)
from generate_series(1, 10) as building_number;

create temporary table hab551_context (
  payment_id uuid not null,
  edificio_1_receivable_id uuid not null
) on commit drop;

insert into hab551_context (payment_id, edificio_1_receivable_id)
values (
  '00000000-0000-0000-0000-000000000000',
  (
    select id from public.receivable_items
    where condominium_id = '55120000-0000-4000-8000-000000000001'
      and unit_id = '55140000-0000-4000-8000-000000000001'
  )
);

select is(
  (select count(*) from public.receivable_items where condominium_id = '55120000-0000-4000-8000-000000000001'),
  10::bigint,
  'one USD 12.34 receivable exists for each building'
);
select is(
  (select sum(amount) from public.receivable_ledger_entries
   where condominium_id = '55120000-0000-4000-8000-000000000001' and direction = 'debit'),
  123.40::numeric,
  'opening ledger debits reconcile to all ten building receivables'
);

select set_config('request.jwt.claim.sub', '55100000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select public.create_payment_draft(
    '55120000-0000-4000-8000-000000000001',
    '55140000-0000-4000-8000-000000000001',
    '55160000-0000-4000-8000-000000000001',
    null,
    current_date,
    5.00,
    'USD',
    'Edificio 1 payer',
    'HAB551-PARTIAL',
    null,
    'hab551-edificio-1-partial'
  )$$,
  'accountant registers the canonical five USD payment draft for Edificio 1'
);

update hab551_context
set payment_id = (
  select id from public.payments where idempotency_key = 'hab551-edificio-1-partial'
);

select is(
  (select count(*) from public.payments where idempotency_key = 'hab551-edificio-1-partial'),
  1::bigint,
  'initial canonical payment RPC creates one payment'
);
select lives_ok(
  $$select public.submit_payment(
    '55120000-0000-4000-8000-000000000001',
    (select payment_id from hab551_context)
  )$$,
  'accountant submits the Edificio 1 payment for independent review'
);

select throws_ok(
  $$select public.approve_payment(
    '55120000-0000-4000-8000-000000000001',
    (select payment_id from hab551_context),
    jsonb_build_array(jsonb_build_object(
      'receivable_item_id', (select edificio_1_receivable_id from hab551_context),
      'payment_amount', '5.00',
      'receivable_amount', '5.00',
      'payment_currency_code', 'USD',
      'receivable_currency_code', 'USD'
    ))
  )$$,
  '42501',
  'independent payment approval required',
  'accountant cannot approve the payment they submitted while a distinct reviewer exists'
);

select set_config('request.jwt.claim.sub', '55100000-0000-4000-8000-000000000003', true);
select ok(
  public.can_approve_payment(
    '55120000-0000-4000-8000-000000000001',
    (select payment_id from hab551_context)
  ),
  'distinct payment reviewer can approve the accountant submission'
);
select lives_ok(
  $$select public.approve_payment(
    '55120000-0000-4000-8000-000000000001',
    (select payment_id from hab551_context),
    jsonb_build_array(jsonb_build_object(
      'receivable_item_id', (select edificio_1_receivable_id from hab551_context),
      'payment_amount', '5.00',
      'receivable_amount', '5.00',
      'payment_currency_code', 'USD',
      'receivable_currency_code', 'USD'
    ))
  )$$,
  'independent reviewer approves the partial Edificio 1 allocation'
);

select is(
  (select status::text from public.payments where id = (select payment_id from hab551_context)),
  'approved',
  'partial payment is approved'
);
select is(
  (select outstanding_amount from public.receivable_balances
   where id = (select edificio_1_receivable_id from hab551_context)),
  '7.34',
  'Edificio 1 outstanding balance is 7.34 USD'
);
select is(
  (select status from public.receivable_balances where id = (select edificio_1_receivable_id from hab551_context)),
  'partially_settled',
  'Edificio 1 receivable is partially settled'
);
select is(
  (select count(*) from public.receivable_balances
   where condominium_id = '55120000-0000-4000-8000-000000000001'
     and unit_id <> '55140000-0000-4000-8000-000000000001'
     and outstanding_amount = '12.34'),
  9::bigint,
  'the other nine building receivables remain 12.34 USD'
);
select is(
  (select sum(case direction when 'debit' then amount else -amount end)
   from public.receivable_ledger_entries
   where receivable_item_id = (select edificio_1_receivable_id from hab551_context)),
  7.34::numeric,
  'Edificio 1 ledger has the authoritative 7.34 USD outstanding balance'
);
select is(
  (select count(*) from public.receivable_ledger_entries
   where payment_id = (select payment_id from hab551_context)
     and receivable_item_id = (select edificio_1_receivable_id from hab551_context)
     and entry_type = 'payment_credit'
     and amount = 5.00),
  1::bigint,
  'approved payment writes one five USD Edificio 1 ledger credit'
);
select is(
  (select count(*) from public.payment_receipts where payment_id = (select payment_id from hab551_context)),
  1::bigint,
  'approved payment has one receipt'
);
select is(
  (select snapshot->'approval'->>'unapplied_credit'
   from public.payment_receipts where payment_id = (select payment_id from hab551_context)),
  '0.00',
  'receipt records no unapplied credit for the fully allocated partial payment'
);
select is(
  (select snapshot->'approval'->'allocations'->0->>'receivable_item_id'
   from public.payment_receipts where payment_id = (select payment_id from hab551_context)),
  (select edificio_1_receivable_id::text from hab551_context),
  'receipt allocation snapshot identifies the Edificio 1 receivable'
);
select is(
  (select snapshot->'approval'->'allocations'->0->>'payment_amount'
   from public.payment_receipts where payment_id = (select payment_id from hab551_context)),
  '5.00',
  'receipt allocation snapshot records the five USD payment amount'
);
select is(
  (select snapshot->'unit'->>'code'
   from public.payment_receipts where payment_id = (select payment_id from hab551_context)),
  'Edificio 1',
  'receipt snapshot identifies the Edificio 1 billing unit'
);
select is(
  (select count(*) from public.get_unit_statement(
    '55120000-0000-4000-8000-000000000001',
    '55140000-0000-4000-8000-000000000001'
  ) where entry_type = 'payment_credit' and credit = '5.00'),
  1::bigint,
  'Edificio 1 statement exposes the approved five USD credit once'
);
select is(
  (select running_balance from public.get_unit_statement(
    '55120000-0000-4000-8000-000000000001',
    '55140000-0000-4000-8000-000000000001'
  ) where entry_type = 'payment_credit' and credit = '5.00'),
  '7.34',
  'Edificio 1 statement running balance is 7.34 USD after the payment'
);

select set_config('request.jwt.claim.sub', '55100000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select public.create_payment_draft(
    '55120000-0000-4000-8000-000000000001',
    '55140000-0000-4000-8000-000000000001',
    '55160000-0000-4000-8000-000000000001',
    null,
    current_date,
    5.00,
    'USD',
    'Edificio 1 payer',
    'HAB551-PARTIAL',
    null,
    'hab551-edificio-1-partial'
  )$$,
  'repeating the canonical draft RPC accepts the original idempotency payload'
);
select is(
  (select count(*) from public.payments where idempotency_key = 'hab551-edificio-1-partial'),
  1::bigint,
  'idempotency key does not duplicate the payment'
);
select set_config('request.jwt.claim.sub', '55100000-0000-4000-8000-000000000003', true);
select lives_ok(
  $$select public.approve_payment(
    '55120000-0000-4000-8000-000000000001',
    (select payment_id from hab551_context),
    '[]'::jsonb
  )$$,
  'repeating approval is idempotent'
);
select is(
  (select count(*) from public.payment_allocations where payment_id = (select payment_id from hab551_context)),
  1::bigint,
  'idempotent approval does not duplicate the allocation'
);
select is(
  (select count(*) from public.receivable_ledger_entries
   where payment_id = (select payment_id from hab551_context) and entry_type = 'payment_credit'),
  1::bigint,
  'idempotent approval does not duplicate the ledger credit'
);

select set_config('request.jwt.claim.sub', '55100000-0000-4000-8000-000000000004', true);
select is(
  (select count(*) from public.receivable_items where condominium_id = '55120000-0000-4000-8000-000000000001'),
  0::bigint,
  'outsider cannot read the complex receivables through RLS'
);
select is(
  (select count(*) from public.payments where id = (select payment_id from hab551_context)),
  0::bigint,
  'outsider cannot read the approved payment through RLS'
);
select throws_ok(
  $$select public.create_payment_draft(
    '55120000-0000-4000-8000-000000000001',
    '55140000-0000-4000-8000-000000000001',
    '55160000-0000-4000-8000-000000000001',
    null,
    current_date,
    5.00,
    'USD',
    'Outsider',
    null,
    null,
    'hab551-outsider'
  )$$,
  '42501',
  'payment submission denied',
  'outsider cannot register a financial payment'
);
select throws_ok(
  $$select public.approve_payment(
    '55120000-0000-4000-8000-000000000001',
    (select payment_id from hab551_context),
    '[]'::jsonb
  )$$,
  '42501',
  'approval denied',
  'outsider cannot approve a financial payment'
);

select set_config('request.jwt.claim.sub', '55100000-0000-4000-8000-000000000005', true);
select throws_ok(
  $$select public.create_payment_draft(
    '55120000-0000-4000-8000-000000000001',
    '55140000-0000-4000-8000-000000000001',
    '55160000-0000-4000-8000-000000000001',
    null,
    current_date,
    5.00,
    'USD',
    'Board member',
    null,
    null,
    'hab551-board-member'
  )$$,
  '42501',
  'payment submission denied',
  'board member without financial permissions cannot register a payment'
);
select throws_ok(
  $$select public.approve_payment(
    '55120000-0000-4000-8000-000000000001',
    (select payment_id from hab551_context),
    '[]'::jsonb
  )$$,
  '42501',
  'approval denied',
  'board member without financial permissions cannot approve a payment'
);

select * from finish();
rollback;
