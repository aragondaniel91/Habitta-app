begin;

create extension if not exists pgtap with schema extensions;
select plan(35);

select has_table('public', 'ownership_transfers', 'ownership transfer history exists');
select has_table('public', 'condominium_currency_policies', 'currency policy exists');
select has_table('public', 'condominium_exchange_rates', 'approved exchange rates exist');
select has_table('public', 'solvency_certificates', 'solvency certificate metadata exists');
select has_column('public', 'payment_allocations', 'exchange_rate_id', 'allocations reference the approved rate snapshot');

insert into auth.users(id, email)
values
  ('18600000-0000-4000-8000-000000000001', 'hab186-admin@example.com'),
  ('18600000-0000-4000-8000-000000000002', 'hab186-old-owner@example.com'),
  ('18600000-0000-4000-8000-000000000003', 'hab186-new-owner@example.com');

insert into public.organizations(id, name, created_by)
values (
  '18610000-0000-4000-8000-000000000001',
  'HAB-186 Organization',
  '18600000-0000-4000-8000-000000000001'
);

insert into public.condominiums(id, organization_id, name, created_by)
values (
  '18620000-0000-4000-8000-000000000001',
  '18610000-0000-4000-8000-000000000001',
  'HAB-186 Condominium',
  '18600000-0000-4000-8000-000000000001'
);

insert into public.organization_memberships(organization_id, user_id, role)
values (
  '18610000-0000-4000-8000-000000000001',
  '18600000-0000-4000-8000-000000000001',
  'organization_owner'
);

insert into public.condominium_memberships(condominium_id, user_id, role)
values (
  '18620000-0000-4000-8000-000000000001',
  '18600000-0000-4000-8000-000000000001',
  'condominium_admin'
);

insert into public.units(id, condominium_id, code, type, created_by)
values (
  '18630000-0000-4000-8000-000000000001',
  '18620000-0000-4000-8000-000000000001',
  'A-186',
  'apartment',
  '18600000-0000-4000-8000-000000000001'
);

insert into public.people(
  id, condominium_id, auth_user_id, first_name, last_name,
  document_type, document_number, email, status, created_by
)
values
  (
    '18640000-0000-4000-8000-000000000001',
    '18620000-0000-4000-8000-000000000001',
    '18600000-0000-4000-8000-000000000002',
    'Propietario', 'Anterior', 'V', 'V-186-OLD',
    'hab186-old-owner@example.com', 'active',
    '18600000-0000-4000-8000-000000000001'
  ),
  (
    '18640000-0000-4000-8000-000000000002',
    '18620000-0000-4000-8000-000000000001',
    '18600000-0000-4000-8000-000000000003',
    'Propietario', 'Nuevo', 'V', 'V-186-NEW',
    'hab186-new-owner@example.com', 'active',
    '18600000-0000-4000-8000-000000000001'
  );

insert into public.unit_owners(
  unit_id, person_id, ownership_percentage, is_primary_contact, starts_at, created_by
)
values (
  '18630000-0000-4000-8000-000000000001',
  '18640000-0000-4000-8000-000000000001',
  100, true, current_date - 30,
  '18600000-0000-4000-8000-000000000001'
);

insert into public.receivable_items(
  id, condominium_id, unit_id, item_type, description,
  issue_date, due_date, currency_code, original_amount, created_by
)
values
  (
    '18650000-0000-4000-8000-000000000001',
    '18620000-0000-4000-8000-000000000001',
    '18630000-0000-4000-8000-000000000001',
    'charge', 'Deuda histórica USD', current_date - 20, current_date - 10,
    'USD', 100.00, '18600000-0000-4000-8000-000000000001'
  ),
  (
    '18650000-0000-4000-8000-000000000002',
    '18620000-0000-4000-8000-000000000001',
    '18630000-0000-4000-8000-000000000001',
    'charge', 'Deuda histórica VES', current_date - 20, current_date - 10,
    'VES', 3650.00, '18600000-0000-4000-8000-000000000001'
  );

insert into public.receivable_ledger_entries(
  condominium_id, unit_id, receivable_item_id, entry_type, direction,
  amount, currency_code, effective_date, description, created_by
)
values
  (
    '18620000-0000-4000-8000-000000000001',
    '18630000-0000-4000-8000-000000000001',
    '18650000-0000-4000-8000-000000000001',
    'charge', 'debit', 100.00, 'USD', current_date - 20,
    'Deuda histórica USD', '18600000-0000-4000-8000-000000000001'
  ),
  (
    '18620000-0000-4000-8000-000000000001',
    '18630000-0000-4000-8000-000000000001',
    '18650000-0000-4000-8000-000000000002',
    'charge', 'debit', 3650.00, 'VES', current_date - 20,
    'Deuda histórica VES', '18600000-0000-4000-8000-000000000001'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '18600000-0000-4000-8000-000000000002',
    'role', 'authenticated',
    'email', 'hab186-old-owner@example.com'
  )::text,
  true
);
select ok(
  public.can_read_financial_unit('18630000-0000-4000-8000-000000000001'),
  'current owner can read the unit account before transfer'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '18600000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'email', 'hab186-admin@example.com'
  )::text,
  true
);
select lives_ok(
  $$select public.transfer_unit_ownership(
    '18620000-0000-4000-8000-000000000001',
    '18630000-0000-4000-8000-000000000001',
    current_date,
    '[{"person_id":"18640000-0000-4000-8000-000000000002","ownership_percentage":100,"is_primary_contact":true}]'::jsonb,
    'r2://hab186/property-transfer.pdf',
    'Venta registrada para prueba HAB-186'
  )$$,
  'authorized administrator can execute a formal ownership transfer'
);

select is(
  (select ends_at from public.unit_owners where person_id = '18640000-0000-4000-8000-000000000001'),
  current_date - 1,
  'previous ownership is closed historically instead of overwritten'
);
select ok(
  exists(
    select 1 from public.unit_owners
    where unit_id = '18630000-0000-4000-8000-000000000001'
      and person_id = '18640000-0000-4000-8000-000000000002'
      and ends_at is null
      and ownership_percentage = 100
  ),
  'new owner relationship becomes active on the same unit'
);
select is(
  (select jsonb_array_length(previous_owners_snapshot) from public.ownership_transfers),
  1,
  'transfer stores the previous-owner snapshot'
);
select is(
  (select jsonb_array_length(new_owners_snapshot) from public.ownership_transfers),
  1,
  'transfer stores the new-owner snapshot'
);
select is(
  (select supporting_document_reference from public.ownership_transfers),
  'r2://hab186/property-transfer.pdf',
  'transfer preserves its supporting-document reference'
);
select is(
  (select count(*)::integer from public.receivable_items where unit_id = '18630000-0000-4000-8000-000000000001'),
  2,
  'ownership transfer leaves all historical receivables attached to the unit'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '18600000-0000-4000-8000-000000000002',
    'role', 'authenticated',
    'email', 'hab186-old-owner@example.com'
  )::text,
  true
);
select ok(
  not public.can_read_financial_unit('18630000-0000-4000-8000-000000000001'),
  'former owner loses financial access after the relationship closes'
);
select throws_ok(
  $$select public.get_unit_account_statement(
    '18620000-0000-4000-8000-000000000001',
    '18630000-0000-4000-8000-000000000001',
    null,
    current_date
  )$$,
  'P0001',
  'permission denied',
  'former owner cannot read the unit statement after transfer'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '18600000-0000-4000-8000-000000000003',
    'role', 'authenticated',
    'email', 'hab186-new-owner@example.com'
  )::text,
  true
);
select ok(
  public.can_read_financial_unit('18630000-0000-4000-8000-000000000001'),
  'new owner gains access to the unit account'
);
select is(
  public.get_unit_account_statement(
    '18620000-0000-4000-8000-000000000001',
    '18630000-0000-4000-8000-000000000001',
    null,
    current_date
  )->'account'->>'unit_code',
  'A-186',
  'statement identifies the unit financial account'
);
select is(
  jsonb_array_length(public.get_unit_account_statement(
    '18620000-0000-4000-8000-000000000001',
    '18630000-0000-4000-8000-000000000001',
    null,
    current_date
  )->'closing_balances'),
  2,
  'statement returns separate closing balances for USD and VES'
);
select ok(
  not (public.get_unit_account_statement(
    '18620000-0000-4000-8000-000000000001',
    '18630000-0000-4000-8000-000000000001',
    null,
    current_date
  ) ? 'total'),
  'statement never exposes an unqualified mixed-currency total'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '18600000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'email', 'hab186-admin@example.com'
  )::text,
  true
);
select lives_ok(
  $$select public.configure_solvency_policy(
    '18620000-0000-4000-8000-000000000001',
    'outstanding', 0::smallint, 0::numeric, 30::smallint
  )$$,
  'administrator can configure a strict authoritative solvency policy'
);
select ok(
  not (public.evaluate_unit_solvency(
    '18620000-0000-4000-8000-000000000001',
    '18630000-0000-4000-8000-000000000001',
    current_date
  )->>'eligible')::boolean,
  'positive ledger balances make the unit ineligible for solvency'
);
select throws_ok(
  $$select public.issue_solvency_certificate(
    '18620000-0000-4000-8000-000000000001',
    '18630000-0000-4000-8000-000000000001',
    current_date
  )$$,
  'P0001',
  'unit is not solvent under current policy',
  'certificate issuance is rejected while authoritative balances violate policy'
);

reset role;
insert into public.receivable_ledger_entries(
  condominium_id, unit_id, receivable_item_id, entry_type, direction,
  amount, currency_code, effective_date, description, created_by
)
values
  (
    '18620000-0000-4000-8000-000000000001',
    '18630000-0000-4000-8000-000000000001',
    '18650000-0000-4000-8000-000000000001',
    'adjustment_credit', 'credit', 100.00, 'USD', current_date,
    'Prueba saldo USD', '18600000-0000-4000-8000-000000000001'
  ),
  (
    '18620000-0000-4000-8000-000000000001',
    '18630000-0000-4000-8000-000000000001',
    '18650000-0000-4000-8000-000000000002',
    'adjustment_credit', 'credit', 3650.00, 'VES', current_date,
    'Prueba saldo VES', '18600000-0000-4000-8000-000000000001'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '18600000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'email', 'hab186-admin@example.com'
  )::text,
  true
);
select ok(
  (public.evaluate_unit_solvency(
    '18620000-0000-4000-8000-000000000001',
    '18630000-0000-4000-8000-000000000001',
    current_date
  )->>'eligible')::boolean,
  'zero balances make the unit eligible under the configured policy'
);
select lives_ok(
  $$select public.issue_solvency_certificate(
    '18620000-0000-4000-8000-000000000001',
    '18630000-0000-4000-8000-000000000001',
    current_date
  )$$,
  'eligible unit can receive solvency certificate metadata'
);
select ok(
  (select verification_id is not null from public.solvency_certificates limit 1),
  'issued solvency certificate has an immutable verification ID'
);

reset role;
select throws_ok(
  $$update public.solvency_certificates set valid_until = valid_until + 1$$,
  'P0001',
  'solvency certificates are immutable',
  'issued certificate metadata cannot be rewritten'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '18600000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'email', 'hab186-admin@example.com'
  )::text,
  true
);
select lives_ok(
  $$select public.configure_condominium_currency_policy(
    '18620000-0000-4000-8000-000000000001',
    'VES', array['VES','USD'], 'approved_rates_only', 'BCV', 7::smallint
  )$$,
  'administrator can enable provider-neutral approved-rate conversion policy'
);

reset role;
insert into public.condominium_payment_methods(
  id, condominium_id, method_type, display_name, currency_code, created_by
)
values (
  '18660000-0000-4000-8000-000000000001',
  '18620000-0000-4000-8000-000000000001',
  'bank_transfer', 'Cuenta USD HAB-186', 'USD',
  '18600000-0000-4000-8000-000000000001'
);
insert into public.payments(
  id, condominium_id, unit_id, submitted_by_user_id, payment_method_id,
  status, payment_date, original_amount, original_currency_code,
  payer_name, idempotency_key
)
values (
  '18670000-0000-4000-8000-000000000001',
  '18620000-0000-4000-8000-000000000001',
  '18630000-0000-4000-8000-000000000001',
  '18600000-0000-4000-8000-000000000001',
  '18660000-0000-4000-8000-000000000001',
  'submitted', current_date, 1.00, 'USD',
  'Pago HAB-186', 'hab186-fx-payment'
);

select throws_ok(
  $$insert into public.payment_allocations(
    condominium_id, payment_id, receivable_item_id,
    payment_currency_code, receivable_currency_code,
    payment_amount, receivable_amount, receivable_per_payment_rate,
    fx_rate_source, fx_rate_at, created_by
  ) values (
    '18620000-0000-4000-8000-000000000001',
    '18670000-0000-4000-8000-000000000001',
    '18650000-0000-4000-8000-000000000002',
    'USD', 'VES', 1.00, 36.50, 36.5000000000,
    'BCV', now() - interval '2 minutes',
    '18600000-0000-4000-8000-000000000001'
  )$$,
  'P0001',
  'cross-currency allocation must use an approved exchange-rate snapshot',
  'free-form client exchange rate is rejected'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '18600000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'email', 'hab186-admin@example.com'
  )::text,
  true
);
select lives_ok(
  $$select public.record_approved_exchange_rate(
    '18620000-0000-4000-8000-000000000001',
    'USD', 'VES', 36.5000000000, current_date,
    now() - interval '2 minutes',
    'BCV', 'Manual/admin-approved BCV snapshot'
  )$$,
  'administrator can record an approved provider-neutral exchange rate'
);

reset role;
select lives_ok(
  $$insert into public.payment_allocations(
    condominium_id, payment_id, receivable_item_id,
    payment_currency_code, receivable_currency_code,
    payment_amount, receivable_amount, receivable_per_payment_rate,
    fx_rate_source, fx_rate_at, created_by
  ) values (
    '18620000-0000-4000-8000-000000000001',
    '18670000-0000-4000-8000-000000000001',
    '18650000-0000-4000-8000-000000000002',
    'USD', 'VES', 1.00, 36.50, 36.5000000000,
    'BCV', now() - interval '2 minutes',
    '18600000-0000-4000-8000-000000000001'
  )$$,
  'cross-currency allocation accepts the exact approved-rate snapshot'
);
select ok(
  (select exchange_rate_id is not null from public.payment_allocations where payment_id = '18670000-0000-4000-8000-000000000001'),
  'allocation stores the approved exchange-rate identifier'
);
select is(
  (select receivable_per_payment_rate from public.payment_allocations where payment_id = '18670000-0000-4000-8000-000000000001'),
  36.5000000000::numeric,
  'allocation freezes the conversion rate used at approval time'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '18600000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'email', 'hab186-admin@example.com'
  )::text,
  true
);
select lives_ok(
  $$select public.record_approved_exchange_rate(
    '18620000-0000-4000-8000-000000000001',
    'USD', 'VES', 37.0000000000, current_date,
    now() - interval '1 minute',
    'BCV', 'Replacement approved rate'
  )$$,
  'a newer approved snapshot can supersede the prior source/date rate'
);
select is(
  (select status from public.condominium_exchange_rates where rate = 36.5000000000),
  'superseded',
  'prior exchange-rate record is retained and marked superseded'
);
select is(
  (select receivable_per_payment_rate from public.payment_allocations where payment_id = '18670000-0000-4000-8000-000000000001'),
  36.5000000000::numeric,
  'historical allocation is never repriced with the newer rate'
);

select finish();
rollback;
