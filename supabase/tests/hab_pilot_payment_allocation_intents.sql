begin;
select plan(55);

-- Regression for an explicit anon EXECUTE grant that survived the original
-- PUBLIC-only revoke. This is a function ACL boundary, not a claim about
-- unauthenticated ability to alter ledger state.
select is(
  has_function_privilege('anon',
    'public.save_payment_allocation_intent(uuid,uuid,jsonb)', 'EXECUTE'),
  false,
  'anonymous callers cannot execute the privileged allocation proposal RPC'
);
select is(
  has_function_privilege('authenticated',
    'public.save_payment_allocation_intent(uuid,uuid,jsonb)', 'EXECUTE'),
  true,
  'authenticated payment callers retain the reviewed RPC permission'
);
select is(
  has_function_privilege('service_role',
    'public.save_payment_allocation_intent(uuid,uuid,jsonb)', 'EXECUTE'),
  true,
  'server role retains the reviewed RPC permission'
);
-- Read-only production checks found the same legacy anon grant on the
-- sibling allocation-reader and payment-proof eligibility RPCs.
select is(
  has_function_privilege('anon',
    'public.get_payment_allocation_intent(uuid,uuid)', 'EXECUTE'),
  false,
  'anonymous callers cannot execute payment allocation reader RPC'
);
select is(
  has_function_privilege('authenticated',
    'public.get_payment_allocation_intent(uuid,uuid)', 'EXECUTE'),
  true,
  'authenticated callers retain payment allocation reader RPC'
);
select is(
  has_function_privilege('service_role',
    'public.get_payment_allocation_intent(uuid,uuid)', 'EXECUTE'),
  true,
  'server retains payment allocation reader RPC'
);
select is(
  has_function_privilege('anon',
    'public.can_upload_payment_proof(uuid,uuid)', 'EXECUTE'),
  false,
  'anonymous callers cannot execute payment proof eligibility RPC'
);
select is(
  has_function_privilege('authenticated',
    'public.can_upload_payment_proof(uuid,uuid)', 'EXECUTE'),
  true,
  'authenticated callers retain payment proof eligibility RPC'
);
select is(
  has_function_privilege('service_role',
    'public.can_upload_payment_proof(uuid,uuid)', 'EXECUTE'),
  true,
  'server retains payment proof eligibility RPC'
);

-- HAB-PILOT-002-P2B: Comprehensive database and RLS validation for resident payment allocation intents.
-- Tests save_payment_allocation_intent, get_payment_allocation_intent, payment_allocation_intents_read RLS,
-- tenant isolation, unit scoping, currency guards, duplicate checks, amount overflow, draft gating, and ledger non-mutation.

insert into auth.users(id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('87710000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin_a@intent.test', 'x', now(), now()),
  ('87710000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'resident_1@intent.test', 'x', now(), now()),
  ('87710000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'resident_2@intent.test', 'x', now(), now()),
  ('87710000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin_b@intent.test', 'x', now(), now());

insert into public.organizations(id, name, created_by) values
  ('87700000-0000-0000-0000-000000000001', 'Intent Org A', '87710000-0000-0000-0000-000000000001'),
  ('87700000-0000-0000-0000-000000000002', 'Intent Org B', '87710000-0000-0000-0000-000000000004');

insert into public.condominiums(id, organization_id, name, created_by) values
  ('87700000-0000-0000-0000-000000000001', '87700000-0000-0000-0000-000000000001', 'Condominium Intent A', '87710000-0000-0000-0000-000000000001'),
  ('87700000-0000-0000-0000-000000000002', '87700000-0000-0000-0000-000000000002', 'Condominium Intent B', '87710000-0000-0000-0000-000000000004');

insert into public.condominium_memberships(condominium_id, user_id, role) values
  ('87700000-0000-0000-0000-000000000001', '87710000-0000-0000-0000-000000000001', 'condominium_admin'),
  ('87700000-0000-0000-0000-000000000001', '87710000-0000-0000-0000-000000000002', 'owner'),
  ('87700000-0000-0000-0000-000000000001', '87710000-0000-0000-0000-000000000003', 'owner'),
  ('87700000-0000-0000-0000-000000000002', '87710000-0000-0000-0000-000000000004', 'condominium_admin');

insert into public.units(id, condominium_id, code, type, created_by) values
  ('87720000-0000-0000-0000-000000000001', '87700000-0000-0000-0000-000000000001', 'A-101', 'apartment', '87710000-0000-0000-0000-000000000001'),
  ('87720000-0000-0000-0000-000000000002', '87700000-0000-0000-0000-000000000001', 'A-102', 'apartment', '87710000-0000-0000-0000-000000000001'),
  ('87720000-0000-0000-0000-000000000003', '87700000-0000-0000-0000-000000000002', 'B-101', 'apartment', '87710000-0000-0000-0000-000000000004');

insert into public.people(id, condominium_id, auth_user_id, first_name, last_name, created_by) values
  ('87730000-0000-0000-0000-000000000001', '87700000-0000-0000-0000-000000000001', '87710000-0000-0000-0000-000000000001', 'Admin', 'A', '87710000-0000-0000-0000-000000000001'),
  ('87730000-0000-0000-0000-000000000002', '87700000-0000-0000-0000-000000000001', '87710000-0000-0000-0000-000000000002', 'Resident', 'One', '87710000-0000-0000-0000-000000000001'),
  ('87730000-0000-0000-0000-000000000003', '87700000-0000-0000-0000-000000000001', '87710000-0000-0000-0000-000000000003', 'Resident', 'Two', '87710000-0000-0000-0000-000000000001');

insert into public.unit_owners(unit_id, person_id, created_by) values
  ('87720000-0000-0000-0000-000000000001', '87730000-0000-0000-0000-000000000002', '87710000-0000-0000-0000-000000000001'),
  ('87720000-0000-0000-0000-000000000002', '87730000-0000-0000-0000-000000000003', '87710000-0000-0000-0000-000000000001');

insert into public.condominium_payment_methods(id, condominium_id, method_type, display_name, currency_code, is_active, created_by) values
  ('87740000-0000-0000-0000-000000000001', '87700000-0000-0000-0000-000000000001', 'bank_transfer', 'Banco USD', 'USD', true, '87710000-0000-0000-0000-000000000001'),
  ('87740000-0000-0000-0000-000000000002', '87700000-0000-0000-0000-000000000001', 'pago_movil', 'Pago Móvil VES', 'VES', true, '87710000-0000-0000-0000-000000000001');

insert into public.charge_concepts(id, condominium_id, code, name, category, created_by) values
  ('87750000-0000-0000-0000-000000000001', '87700000-0000-0000-0000-000000000001', 'DUE-USD', 'Cuota USD', 'regular_dues', '87710000-0000-0000-0000-000000000001'),
  ('87750000-0000-0000-0000-000000000002', '87700000-0000-0000-0000-000000000001', 'DUE-VES', 'Cuota VES', 'regular_dues', '87710000-0000-0000-0000-000000000001'),
  ('87750000-0000-0000-0000-000000000003', '87700000-0000-0000-0000-000000000002', 'DUE-B', 'Cuota Condo B', 'regular_dues', '87710000-0000-0000-0000-000000000004');

insert into public.receivable_items(id, condominium_id, unit_id, concept_id, item_type, description, issue_date, due_date, currency_code, original_amount, lifecycle_status, created_by) values
  ('87760000-0000-0000-0000-000000000001', '87700000-0000-0000-0000-000000000001', '87720000-0000-0000-0000-000000000001', '87750000-0000-0000-0000-000000000001', 'charge', 'Cuota Mantenimiento Octubre', current_date, current_date, 'USD', 100.00, 'active', '87710000-0000-0000-0000-000000000001'),
  ('87760000-0000-0000-0000-000000000002', '87700000-0000-0000-0000-000000000001', '87720000-0000-0000-0000-000000000001', '87750000-0000-0000-0000-000000000001', 'charge', 'Fondo de Reserva Octubre', current_date, current_date, 'USD', 50.00, 'active', '87710000-0000-0000-0000-000000000001'),
  ('87760000-0000-0000-0000-000000000003', '87700000-0000-0000-0000-000000000001', '87720000-0000-0000-0000-000000000001', '87750000-0000-0000-0000-000000000002', 'charge', 'Cuota Extraordinaria VES', current_date, current_date, 'VES', 2000.00, 'active', '87710000-0000-0000-0000-000000000001'),
  ('87760000-0000-0000-0000-000000000004', '87700000-0000-0000-0000-000000000001', '87720000-0000-0000-0000-000000000002', '87750000-0000-0000-0000-000000000001', 'charge', 'Cuota Unidad A-102', current_date, current_date, 'USD', 80.00, 'active', '87710000-0000-0000-0000-000000000001'),
  ('87760000-0000-0000-0000-000000000005', '87700000-0000-0000-0000-000000000002', '87720000-0000-0000-0000-000000000003', '87750000-0000-0000-0000-000000000003', 'charge', 'Cuota Condo B', current_date, current_date, 'USD', 120.00, 'active', '87710000-0000-0000-0000-000000000004');

insert into public.receivable_ledger_entries(condominium_id, unit_id, receivable_item_id, entry_type, direction, amount, currency_code, effective_date, description, created_by) values
  ('87700000-0000-0000-0000-000000000001', '87720000-0000-0000-0000-000000000001', '87760000-0000-0000-0000-000000000001', 'charge', 'debit', 100.00, 'USD', current_date, 'Cuota Mantenimiento Octubre', '87710000-0000-0000-0000-000000000001'),
  ('87700000-0000-0000-0000-000000000001', '87720000-0000-0000-0000-000000000001', '87760000-0000-0000-0000-000000000002', 'charge', 'debit', 50.00, 'USD', current_date, 'Fondo de Reserva Octubre', '87710000-0000-0000-0000-000000000001'),
  ('87700000-0000-0000-0000-000000000001', '87720000-0000-0000-0000-000000000001', '87760000-0000-0000-0000-000000000003', 'charge', 'debit', 2000.00, 'VES', current_date, 'Cuota Extraordinaria VES', '87710000-0000-0000-0000-000000000001'),
  ('87700000-0000-0000-0000-000000000001', '87720000-0000-0000-0000-000000000002', '87760000-0000-0000-0000-000000000004', 'charge', 'debit', 80.00, 'USD', current_date, 'Cuota Unidad A-102', '87710000-0000-0000-0000-000000000001'),
  ('87700000-0000-0000-0000-000000000002', '87720000-0000-0000-0000-000000000003', '87760000-0000-0000-0000-000000000005', 'charge', 'debit', 120.00, 'USD', current_date, 'Cuota Condo B', '87710000-0000-0000-0000-000000000004');

insert into public.payments(id, condominium_id, unit_id, submitted_by_user_id, payment_method_id, status, payment_date, original_amount, original_currency_code, payer_name, idempotency_key) values
  ('87770000-0000-0000-0000-000000000001', '87700000-0000-0000-0000-000000000001', '87720000-0000-0000-0000-000000000001', '87710000-0000-0000-0000-000000000002', '87740000-0000-0000-0000-000000000001', 'draft', current_date, 120.00, 'USD', 'Residente 1', 'intent-key-draft-1'),
  ('87770000-0000-0000-0000-000000000002', '87700000-0000-0000-0000-000000000001', '87720000-0000-0000-0000-000000000002', '87710000-0000-0000-0000-000000000003', '87740000-0000-0000-0000-000000000001', 'draft', current_date, 80.00, 'USD', 'Residente 2', 'intent-key-draft-2'),
  ('87770000-0000-0000-0000-000000000003', '87700000-0000-0000-0000-000000000001', '87720000-0000-0000-0000-000000000001', '87710000-0000-0000-0000-000000000002', '87740000-0000-0000-0000-000000000001', 'submitted', current_date, 60.00, 'USD', 'Residente 1 Submitted', 'intent-key-submitted'),
  ('87770000-0000-0000-0000-000000000004', '87700000-0000-0000-0000-000000000001', '87720000-0000-0000-0000-000000000001', '87710000-0000-0000-0000-000000000002', '87740000-0000-0000-0000-000000000001', 'submitted', current_date, 50.00, 'USD', 'Legacy Payment without intent', 'intent-key-legacy');

-- Switch to authenticated role as Resident 1 (Owner of Unit A-101)
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '87710000-0000-0000-0000-000000000002', true);

-- Test 1: Resident 1 saves valid multi-charge same-currency proposal on own draft
select lives_ok(
  $$select public.save_payment_allocation_intent(
    '87700000-0000-0000-0000-000000000001',
    '87770000-0000-0000-0000-000000000001',
    '[{"receivable_item_id":"87760000-0000-0000-0000-000000000001","payment_amount":"70.00","receivable_amount":"70.00","payment_currency_code":"USD","receivable_currency_code":"USD"},{"receivable_item_id":"87760000-0000-0000-0000-000000000002","payment_amount":"50.00","receivable_amount":"50.00","payment_currency_code":"USD","receivable_currency_code":"USD"}]'::jsonb
  )$$,
  'resident saves valid multi-charge same-currency proposal on own draft payment'
);

-- Test 2: Intent is persisted with 2 proposals
select is(
  (select jsonb_array_length(proposals) from public.payment_allocation_intents where payment_id = '87770000-0000-0000-0000-000000000001'),
  2,
  'saved intent contains exactly two proposal items'
);

-- Test 3: Updating proposal on same draft replaces proposals idempotently
select lives_ok(
  $$select public.save_payment_allocation_intent(
    '87700000-0000-0000-0000-000000000001',
    '87770000-0000-0000-0000-000000000001',
    '[{"receivable_item_id":"87760000-0000-0000-0000-000000000001","payment_amount":"100.00","receivable_amount":"100.00","payment_currency_code":"USD","receivable_currency_code":"USD"}]'::jsonb
  )$$,
  'resident can update and replace saved proposals on own draft payment'
);

-- Test 4: Exactly one row maintained per payment
select is(
  (select count(*) from public.payment_allocation_intents where payment_id = '87770000-0000-0000-0000-000000000001'),
  1::bigint,
  'intent row is updated on conflict rather than duplicated'
);

-- Test 5 & 6: Financial ledger non-mutation
select is(
  (select count(*) from public.payment_allocations),
  0::bigint,
  'saving an allocation intent writes zero payment allocations'
);

select is(
  (select count(*) from public.receivable_ledger_entries where payment_id = '87770000-0000-0000-0000-000000000001'),
  0::bigint,
  'saving an allocation intent writes zero receivable ledger entries'
);

-- Test 7: Unauthorized resident cannot mutate draft proposal owned by another resident
select set_config('request.jwt.claim.sub', '87710000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.save_payment_allocation_intent(
    '87700000-0000-0000-0000-000000000001',
    '87770000-0000-0000-0000-000000000001',
    '[{"receivable_item_id":"87760000-0000-0000-0000-000000000001","payment_amount":"50.00","receivable_amount":"50.00","payment_currency_code":"USD","receivable_currency_code":"USD"}]'::jsonb
  )$$,
  '42501',
  'payment update denied',
  'resident cannot save proposal on a draft owned by another user'
);

-- Test 8: Status restriction: Cannot save intent for submitted payment
select set_config('request.jwt.claim.sub', '87710000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.save_payment_allocation_intent(
    '87700000-0000-0000-0000-000000000001',
    '87770000-0000-0000-0000-000000000003',
    '[{"receivable_item_id":"87760000-0000-0000-0000-000000000001","payment_amount":"50.00","receivable_amount":"50.00","payment_currency_code":"USD","receivable_currency_code":"USD"}]'::jsonb
  )$$,
  '42501',
  'payment update denied',
  'cannot save allocation intent on a submitted payment'
);

-- Test 9: Cross-condominium isolation
select throws_ok(
  $$select public.save_payment_allocation_intent(
    '87700000-0000-0000-0000-000000000001',
    '87770000-0000-0000-0000-000000000001',
    '[{"receivable_item_id":"87760000-0000-0000-0000-000000000005","payment_amount":"50.00","receivable_amount":"50.00","payment_currency_code":"USD","receivable_currency_code":"USD"}]'::jsonb
  )$$,
  'P0001',
  'invalid payment allocations',
  'cannot propose a receivable belonging to another condominium'
);

-- Test 10: Cross-unit isolation
select throws_ok(
  $$select public.save_payment_allocation_intent(
    '87700000-0000-0000-0000-000000000001',
    '87770000-0000-0000-0000-000000000001',
    '[{"receivable_item_id":"87760000-0000-0000-0000-000000000004","payment_amount":"50.00","receivable_amount":"50.00","payment_currency_code":"USD","receivable_currency_code":"USD"}]'::jsonb
  )$$,
  'P0001',
  'invalid payment allocations',
  'cannot propose a receivable belonging to another unit'
);

-- Test 11: Invalid currency: VES receivable on USD payment
select throws_ok(
  $$select public.save_payment_allocation_intent(
    '87700000-0000-0000-0000-000000000001',
    '87770000-0000-0000-0000-000000000001',
    '[{"receivable_item_id":"87760000-0000-0000-0000-000000000003","payment_amount":"50.00","receivable_amount":"50.00","payment_currency_code":"USD","receivable_currency_code":"USD"}]'::jsonb
  )$$,
  'P0001',
  'invalid payment allocations',
  'currency mismatch between receivable and payment is rejected'
);

-- Test 12: Currency code mismatch in proposal body
select throws_ok(
  $$select public.save_payment_allocation_intent(
    '87700000-0000-0000-0000-000000000001',
    '87770000-0000-0000-0000-000000000001',
    '[{"receivable_item_id":"87760000-0000-0000-0000-000000000001","payment_amount":"50.00","receivable_amount":"50.00","payment_currency_code":"EUR","receivable_currency_code":"USD"}]'::jsonb
  )$$,
  'P0001',
  'invalid payment allocations',
  'discrepancy between payment currency and proposal currency is rejected'
);

-- Test 13: Proposal amount <= 0 is rejected
select throws_ok(
  $$select public.save_payment_allocation_intent(
    '87700000-0000-0000-0000-000000000001',
    '87770000-0000-0000-0000-000000000001',
    '[{"receivable_item_id":"87760000-0000-0000-0000-000000000001","payment_amount":"0.00","receivable_amount":"0.00","payment_currency_code":"USD","receivable_currency_code":"USD"}]'::jsonb
  )$$,
  'P0001',
  'invalid payment allocations',
  'zero or negative proposal amount is rejected'
);

-- Test 14: Payment amount != receivable amount in same-currency proposal
select throws_ok(
  $$select public.save_payment_allocation_intent(
    '87700000-0000-0000-0000-000000000001',
    '87770000-0000-0000-0000-000000000001',
    '[{"receivable_item_id":"87760000-0000-0000-0000-000000000001","payment_amount":"50.00","receivable_amount":"45.00","payment_currency_code":"USD","receivable_currency_code":"USD"}]'::jsonb
  )$$,
  'P0001',
  'invalid payment allocations',
  'mismatched payment and receivable amounts in proposal are rejected'
);

-- Test 15: Proposal exceeds receivable outstanding amount (Rec 1 outstanding is 100.00)
select throws_ok(
  $$select public.save_payment_allocation_intent(
    '87700000-0000-0000-0000-000000000001',
    '87770000-0000-0000-0000-000000000001',
    '[{"receivable_item_id":"87760000-0000-0000-0000-000000000001","payment_amount":"101.00","receivable_amount":"101.00","payment_currency_code":"USD","receivable_currency_code":"USD"}]'::jsonb
  )$$,
  'P0001',
  'invalid payment allocations',
  'proposal exceeding receivable outstanding debt is rejected'
);

-- Test 16: Sum of proposals exceeds payment original_amount (Draft 1 original_amount is 120.00)
select throws_ok(
  $$select public.save_payment_allocation_intent(
    '87700000-0000-0000-0000-000000000001',
    '87770000-0000-0000-0000-000000000001',
    '[{"receivable_item_id":"87760000-0000-0000-0000-000000000001","payment_amount":"90.00","receivable_amount":"90.00","payment_currency_code":"USD","receivable_currency_code":"USD"},{"receivable_item_id":"87760000-0000-0000-0000-000000000002","payment_amount":"40.00","receivable_amount":"40.00","payment_currency_code":"USD","receivable_currency_code":"USD"}]'::jsonb
  )$$,
  'P0001',
  'invalid payment allocations',
  'sum of proposed allocations exceeding payment amount is rejected'
);

-- Test 17: Empty proposals array
select throws_ok(
  $$select public.save_payment_allocation_intent(
    '87700000-0000-0000-0000-000000000001',
    '87770000-0000-0000-0000-000000000001',
    '[]'::jsonb
  )$$,
  'P0001',
  'invalid payment allocations',
  'empty proposals array is rejected'
);

-- Test 18: Duplicate receivable items in proposals array
select throws_ok(
  $$select public.save_payment_allocation_intent(
    '87700000-0000-0000-0000-000000000001',
    '87770000-0000-0000-0000-000000000001',
    '[{"receivable_item_id":"87760000-0000-0000-0000-000000000001","payment_amount":"50.00","receivable_amount":"50.00","payment_currency_code":"USD","receivable_currency_code":"USD"},{"receivable_item_id":"87760000-0000-0000-0000-000000000001","payment_amount":"50.00","receivable_amount":"50.00","payment_currency_code":"USD","receivable_currency_code":"USD"}]'::jsonb
  )$$,
  'P0001',
  'invalid payment allocations',
  'duplicate receivable items within proposal array are rejected'
);

-- Test 19: Non-existent payment ID
select throws_ok(
  $$select public.save_payment_allocation_intent(
    '87700000-0000-0000-0000-000000000001',
    '87770000-0000-0000-0000-000000000099',
    '[{"receivable_item_id":"87760000-0000-0000-0000-000000000001","payment_amount":"50.00","receivable_amount":"50.00","payment_currency_code":"USD","receivable_currency_code":"USD"}]'::jsonb
  )$$,
  'P0001',
  'payment not found',
  'saving proposal against non-existent payment is rejected'
);

-- Test 20 & 21: Resident 1 reads intent on own draft
select lives_ok(
  $$select public.get_payment_allocation_intent(
    '87700000-0000-0000-0000-000000000001',
    '87770000-0000-0000-0000-000000000001'
  )$$,
  'resident reads allocation intent on own draft payment'
);

select is(
  (select (public.get_payment_allocation_intent('87700000-0000-0000-0000-000000000001', '87770000-0000-0000-0000-000000000001')).payment_id),
  '87770000-0000-0000-0000-000000000001'::uuid,
  'read intent matches the requested payment identity'
);

-- Test 22: Resident 2 cannot read Resident 1 draft intent
select set_config('request.jwt.claim.sub', '87710000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.get_payment_allocation_intent(
    '87700000-0000-0000-0000-000000000001',
    '87770000-0000-0000-0000-000000000001'
  )$$,
  '42501',
  'payment allocation intent read denied',
  'unrelated resident cannot read draft proposal owned by another resident'
);

-- Test 23 & 24: Legacy payment without intent returns NULL cleanly
select set_config('request.jwt.claim.sub', '87710000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$select public.get_payment_allocation_intent(
    '87700000-0000-0000-0000-000000000001',
    '87770000-0000-0000-0000-000000000004'
  )$$,
  'reading legacy payment without an allocation intent succeeds without error'
);

select is(
  (select public.get_payment_allocation_intent('87700000-0000-0000-0000-000000000001', '87770000-0000-0000-0000-000000000004')),
  null,
  'legacy payment without allocation intent returns SQL null'
);

-- Now transition Draft 1 to submitted status to verify review-state read behavior
reset role;
update public.payments set status = 'submitted', submitted_at = now() where id = '87770000-0000-0000-0000-000000000001';
set local role authenticated;

-- Test 25: Condominium admin (Reviewer) can read submitted payment intent
select set_config('request.jwt.claim.sub', '87710000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.get_payment_allocation_intent(
    '87700000-0000-0000-0000-000000000001',
    '87770000-0000-0000-0000-000000000001'
  )$$,
  'condominium payment reviewer can read allocation intent for submitted payment'
);

-- Test 26: Resident 1 can still read allocation intent for their submitted payment
select set_config('request.jwt.claim.sub', '87710000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$select public.get_payment_allocation_intent(
    '87700000-0000-0000-0000-000000000001',
    '87770000-0000-0000-0000-000000000001'
  )$$,
  'resident can read allocation intent for submitted payment via unit submission privilege'
);

-- Test 27: Unrelated Resident 2 cannot read submitted payment intent
select set_config('request.jwt.claim.sub', '87710000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.get_payment_allocation_intent(
    '87700000-0000-0000-0000-000000000001',
    '87770000-0000-0000-0000-000000000001'
  )$$,
  '42501',
  'payment allocation intent read denied',
  'unrelated resident cannot read submitted payment allocation intent of another unit'
);

-- Test 28: Admin of Condo B cannot read Condo A payment intent
select set_config('request.jwt.claim.sub', '87710000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$select public.get_payment_allocation_intent(
    '87700000-0000-0000-0000-000000000001',
    '87770000-0000-0000-0000-000000000001'
  )$$,
  '42501',
  'payment allocation intent read denied',
  'admin of another condominium cannot read payment allocation intent'
);

-- Test 29, 30, 31: Table DAC privilege enforcement: authenticated user cannot direct write
select set_config('request.jwt.claim.sub', '87710000-0000-0000-0000-000000000002', true);

select throws_ok(
  $$insert into public.payment_allocation_intents(condominium_id, payment_id, proposals, created_by)
    values('87700000-0000-0000-0000-000000000001', '87770000-0000-0000-0000-000000000002', '[]'::jsonb, '87710000-0000-0000-0000-000000000002')$$,
  '42501',
  null,
  'direct table insert into payment_allocation_intents is blocked for authenticated users'
);

select throws_ok(
  $$update public.payment_allocation_intents set proposals = '[]'::jsonb where payment_id = '87770000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'direct table update on payment_allocation_intents is blocked for authenticated users'
);

select throws_ok(
  $$delete from public.payment_allocation_intents where payment_id = '87770000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'direct table delete on payment_allocation_intents is blocked for authenticated users'
);

-- Test 32 & 33: Direct SELECT under RLS policy payment_allocation_intents_read
select is(
  (select count(*) from public.payment_allocation_intents),
  1::bigint,
  'authenticated Resident 1 reads exactly own payment allocation intent through RLS'
);

select set_config('request.jwt.claim.sub', '87710000-0000-0000-0000-000000000003', true);
select is(
  (select count(*) from public.payment_allocation_intents),
  0::bigint,
  'authenticated Resident 2 sees zero rows for other units payment allocation intents through RLS'
);

-- Payment-proof regression: real metadata writer and owner-scoped RLS.
select set_config('request.jwt.claim.sub', '87710000-0000-0000-0000-000000000003', true);

select lives_ok(
  $$select public.record_payment_proof(
    '87700000-0000-0000-0000-000000000001',
    '87770000-0000-0000-0000-000000000002',
    '87780000-0000-0000-0000-000000000001',
    'payments/87780000-0000-0000-0000-000000000001',
    'receipt-test.png', 'image/png', 68,
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  )$$,
  'resident can record a proof on an owned draft'
);

select is(
  (select uploaded_by from public.payment_proofs where id='87780000-0000-0000-0000-000000000001'),
  '87710000-0000-0000-0000-000000000003'::uuid,
  'proof metadata records the authenticated uploader'
);

select set_config('request.jwt.claim.sub', '87710000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.record_payment_proof(
    '87700000-0000-0000-0000-000000000001',
    '87770000-0000-0000-0000-000000000002',
    '87780000-0000-0000-0000-000000000002',
    'payments/87780000-0000-0000-0000-000000000002',
    'outside.png', 'image/png', 68,
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  )$$,
  'P0001', 'proof upload denied',
  'another resident cannot upload a proof on an unrelated draft'
);

select is(
  (select count(*) from public.payment_proofs where payment_id='87770000-0000-0000-0000-000000000002'),
  0::bigint,
  'another resident cannot see confidential proof metadata'
);

-- Submitted/under-review proof stays immutable until a correction is requested.
select set_config('request.jwt.claim.sub', '87710000-0000-0000-0000-000000000002', true);
select is(public.can_upload_payment_proof(
  '87700000-0000-0000-0000-000000000001','87770000-0000-0000-0000-000000000001'
),false,'resident cannot replace proof on own submitted payment');

select throws_ok(
  $proof$select public.record_payment_proof(
    '87700000-0000-0000-0000-000000000001',
    '87770000-0000-0000-0000-000000000001',
    '87780000-0000-0000-0000-000000000003',
    'payments/87780000-0000-0000-0000-000000000003',
    'initial.png','image/png',68,'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
  )$proof$,
  'P0001', 'proof upload denied',
  'submitting new proof on pending payment is denied'
);

reset role;
update public.payments set status='under_review'
  where id='87770000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '87710000-0000-0000-0000-000000000002', true);
select is(public.can_upload_payment_proof(
  '87700000-0000-0000-0000-000000000001','87770000-0000-0000-0000-000000000001'
),false,'resident cannot replace proof while payment is under review');

select throws_ok(
  $proof$select public.record_payment_proof(
    '87700000-0000-0000-0000-000000000001',
    '87770000-0000-0000-0000-000000000001',
    '87780000-0000-0000-0000-000000000004',
    'payments/87780000-0000-0000-0000-000000000004',
    'corrected.png','image/png',68,'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
  )$proof$,
  'P0001', 'proof upload denied',
  'replacing the proof while under review is denied'
);

select is(
  (select count(*) from public.payment_proofs
    where payment_id='87770000-0000-0000-0000-000000000001'
    and superseded_at is not null),0::bigint,
  'no proof was superseded during immutable submitted/under-review phases'
);

-- Direct RPC callers bypass the HTTP Zod schema. The database must reject absent
-- and sub-cent fields before an intent can be persisted for reviewer consumption.
reset role;
update public.payments set status='draft'
  where id='87770000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '87710000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.save_payment_allocation_intent(
    '87700000-0000-0000-0000-000000000001',
    '87770000-0000-0000-0000-000000000001',
    '[{"receivable_item_id":"87760000-0000-0000-0000-000000000001","payment_amount":"1.001","receivable_amount":"1.001","payment_currency_code":"USD","receivable_currency_code":"USD"}]'::jsonb
  )$$,
  'P0001', 'invalid payment allocations',
  'direct RPC rejects proposal values below a currency minor unit'
);

select throws_ok(
  $$select public.save_payment_allocation_intent(
    '87700000-0000-0000-0000-000000000001',
    '87770000-0000-0000-0000-000000000001',
    '[{"receivable_item_id":"87760000-0000-0000-0000-000000000001","receivable_amount":"1.00","payment_currency_code":"USD","receivable_currency_code":"USD"}]'::jsonb
  )$$,
  'P0001', 'invalid payment allocations',
  'direct RPC rejects a proposal with a missing payment amount'
);

-- A correction reopens exactly the editable boundary: its proposal can be
-- replaced, while the submitted/under-review checks above remain immutable.
reset role;
update public.payments set status='correction_requested'
  where id='87770000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '87710000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$select public.save_payment_allocation_intent(
    '87700000-0000-0000-0000-000000000001',
    '87770000-0000-0000-0000-000000000001',
    '[{"receivable_item_id":"87760000-0000-0000-0000-000000000001","payment_amount":"70.00","receivable_amount":"70.00","payment_currency_code":"USD","receivable_currency_code":"USD"},{"receivable_item_id":"87760000-0000-0000-0000-000000000002","payment_amount":"50.00","receivable_amount":"50.00","payment_currency_code":"USD","receivable_currency_code":"USD"}]'::jsonb
  )$$,
  'correction-requested payment reopens and preserves a replaceable multi-charge proposal'
);

select set_config('request.jwt.claim.sub', '87710000-0000-0000-0000-000000000003', true);
select is(public.can_upload_payment_proof(
  '87700000-0000-0000-0000-000000000001','87770000-0000-0000-0000-000000000001'
),false,'another resident cannot replace a pending proof of a different unit');

select * from finish();
rollback;
