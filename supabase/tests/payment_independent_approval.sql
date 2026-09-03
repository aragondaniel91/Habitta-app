begin;
select plan(6);

-- HAB-455 regression: an accountant can both register and review payments, but
-- must not approve their own submission when a different payment_reviewer is
-- configured for the condominium.
insert into auth.users(
  id, instance_id, aud, role, email, encrypted_password, created_at, updated_at
) values
  (
    '85500000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'submitter@hab455.test', 'x', now(), now()
  ),
  (
    '85500000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'reviewer@hab455.test', 'x', now(), now()
  );

insert into public.organizations(id, name, created_by)
values (
  '85510000-0000-0000-0000-000000000001',
  'HAB-455 Organization',
  '85500000-0000-0000-0000-000000000001'
);

insert into public.condominiums(id, organization_id, name, created_by)
values (
  '85520000-0000-0000-0000-000000000001',
  '85510000-0000-0000-0000-000000000001',
  'HAB-455 Condominium',
  '85500000-0000-0000-0000-000000000001'
);

insert into public.condominium_memberships(condominium_id, user_id, role) values
  (
    '85520000-0000-0000-0000-000000000001',
    '85500000-0000-0000-0000-000000000001',
    'accountant'
  ),
  (
    '85520000-0000-0000-0000-000000000001',
    '85500000-0000-0000-0000-000000000002',
    'payment_reviewer'
  );

insert into public.units(id, condominium_id, code, type, created_by)
values (
  '85530000-0000-0000-0000-000000000001',
  '85520000-0000-0000-0000-000000000001',
  'H455-1',
  'apartment',
  '85500000-0000-0000-0000-000000000001'
);

insert into public.condominium_payment_methods(
  id, condominium_id, method_type, display_name, currency_code,
  requires_reference, requires_proof, is_active, created_by
) values (
  '85540000-0000-0000-0000-000000000001',
  '85520000-0000-0000-0000-000000000001',
  'cash',
  'HAB-455 Cash USD',
  'USD',
  false,
  false,
  true,
  '85500000-0000-0000-0000-000000000001'
);

insert into public.payments(
  id, condominium_id, unit_id, submitted_by_user_id, payment_method_id,
  status, payment_date, original_amount, original_currency_code, payer_name,
  idempotency_key, submitted_at
) values (
  '85550000-0000-0000-0000-000000000001',
  '85520000-0000-0000-0000-000000000001',
  '85530000-0000-0000-0000-000000000001',
  '85500000-0000-0000-0000-000000000001',
  '85540000-0000-0000-0000-000000000001',
  'submitted',
  current_date,
  25.00,
  'USD',
  'HAB-455 Submitter',
  'hab455-self-approval',
  now()
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '85500000-0000-0000-0000-000000000001',
  true
);

select throws_ok(
  $$select public.approve_payment(
    '85520000-0000-0000-0000-000000000001',
    '85550000-0000-0000-0000-000000000001',
    '[]'::jsonb
  )$$,
  '42501',
  'independent payment approval required',
  'submitter cannot approve own payment when a distinct reviewer exists'
);

reset role;

select throws_ok(
  $$update public.payments
      set status = 'approved',
          approved_by = '85500000-0000-0000-0000-000000000001',
          approved_at = now()
    where id = '85550000-0000-0000-0000-000000000001'$$,
  '42501',
  'independent payment approval required',
  'database guard also blocks a direct self-approval write'
);

select is(
  (select status::text from public.payments where id = '85550000-0000-0000-0000-000000000001'),
  'submitted',
  'rejected self-approval leaves the payment submitted'
);

select is(
  (select count(*) from public.receivable_ledger_entries where payment_id = '85550000-0000-0000-0000-000000000001'),
  0::bigint,
  'rejected self-approval leaves no ledger entries'
);

select is(
  (select count(*) from public.payment_receipts where payment_id = '85550000-0000-0000-0000-000000000001'),
  0::bigint,
  'rejected self-approval leaves no receipt'
);

select is(
  (select count(*) from public.payment_events where payment_id = '85550000-0000-0000-0000-000000000001' and event_type = 'approved'),
  0::bigint,
  'rejected self-approval leaves no approval event'
);

select * from finish();
rollback;
