begin;
select plan(7);

-- Fail closed on 12 formerly anonymous-executable SECURITY DEFINER RPCs.
with protected_rpcs(signature) as (
  values
  ('public.approve_payment(uuid, uuid, jsonb)'::regprocedure),
  ('public.create_payment_draft(uuid, uuid, uuid, uuid, date, numeric, text, text, text, text, text)'::regprocedure),
  ('public.create_receivable_item(uuid, uuid, uuid, text, numeric, text, date, date)'::regprocedure),
  ('public.get_receivables_aging(uuid)'::regprocedure),
  ('public.get_receivables_summary(uuid)'::regprocedure),
  ('public.get_unit_statement(uuid, uuid)'::regprocedure),
  ('public.post_charge_batch(uuid, uuid, text, text, date, date, public.charge_batch_distribution, jsonb, text, numeric)'::regprocedure),
  ('public.preview_payment_allocation(uuid, uuid, jsonb)'::regprocedure),
  ('public.record_payment_proof(uuid, uuid, uuid, text, text, text, bigint, text)'::regprocedure),
  ('public.reverse_payment(uuid, uuid, text)'::regprocedure),
  ('public.submit_payment(uuid, uuid)'::regprocedure),
  ('public.update_payment_draft(uuid, uuid, uuid, date, numeric, text, text, text, text)'::regprocedure)
)
select is(
  (select count(*) from protected_rpcs where has_function_privilege('anon',signature,'EXECUTE')),
  0::bigint,
  'anonymous access is revoked for all 12 sensitive financial RPCs'
);

with protected_rpcs(signature) as (
  values
  ('public.approve_payment(uuid, uuid, jsonb)'::regprocedure),
  ('public.create_payment_draft(uuid, uuid, uuid, uuid, date, numeric, text, text, text, text, text)'::regprocedure),
  ('public.create_receivable_item(uuid, uuid, uuid, text, numeric, text, date, date)'::regprocedure),
  ('public.get_receivables_aging(uuid)'::regprocedure),
  ('public.get_receivables_summary(uuid)'::regprocedure),
  ('public.get_unit_statement(uuid, uuid)'::regprocedure),
  ('public.post_charge_batch(uuid, uuid, text, text, date, date, public.charge_batch_distribution, jsonb, text, numeric)'::regprocedure),
  ('public.preview_payment_allocation(uuid, uuid, jsonb)'::regprocedure),
  ('public.record_payment_proof(uuid, uuid, uuid, text, text, text, bigint, text)'::regprocedure),
  ('public.reverse_payment(uuid, uuid, text)'::regprocedure),
  ('public.submit_payment(uuid, uuid)'::regprocedure),
  ('public.update_payment_draft(uuid, uuid, uuid, date, numeric, text, text, text, text)'::regprocedure)
)
select is(
  (select count(*) from protected_rpcs where not has_function_privilege('authenticated',signature,'EXECUTE')),
  0::bigint,
  'all 12 RPCs remain executable by authenticated users under their internal access checks'
);

with protected_rpcs(signature) as (
  values
  ('public.approve_payment(uuid, uuid, jsonb)'::regprocedure),
  ('public.create_payment_draft(uuid, uuid, uuid, uuid, date, numeric, text, text, text, text, text)'::regprocedure),
  ('public.create_receivable_item(uuid, uuid, uuid, text, numeric, text, date, date)'::regprocedure),
  ('public.get_receivables_aging(uuid)'::regprocedure),
  ('public.get_receivables_summary(uuid)'::regprocedure),
  ('public.get_unit_statement(uuid, uuid)'::regprocedure),
  ('public.post_charge_batch(uuid, uuid, text, text, date, date, public.charge_batch_distribution, jsonb, text, numeric)'::regprocedure),
  ('public.preview_payment_allocation(uuid, uuid, jsonb)'::regprocedure),
  ('public.record_payment_proof(uuid, uuid, uuid, text, text, text, bigint, text)'::regprocedure),
  ('public.reverse_payment(uuid, uuid, text)'::regprocedure),
  ('public.submit_payment(uuid, uuid)'::regprocedure),
  ('public.update_payment_draft(uuid, uuid, uuid, date, numeric, text, text, text, text)'::regprocedure)
)
select is(
  (select count(*) from protected_rpcs where not has_function_privilege('service_role',signature,'EXECUTE')),
  0::bigint,
  'the Worker/service_role keeps its intended service access'
);

-- The future commercial self-service flow must remain publicly accessible.
select ok(
  has_function_privilege('anon','public.get_public_plan_catalog()'::regprocedure,'EXECUTE'),
  'public plan catalog remains available to prospective clients'
);
select ok(
  has_function_privilege('anon','public.get_resident_invitation_preview(text)'::regprocedure,'EXECUTE'),
  'token-scoped resident onboarding preview remains public'
);

set local role anon;
select set_config('request.jwt.claim.role','anon',true);
select throws_ok(
  $$select * from public.get_receivables_summary('00000000-0000-0000-0000-000000000001'::uuid)$$,
  '42501',
  'permission denied for function get_receivables_summary',
  'unauthenticated callers cannot enumerate condominium receivable summaries'
);
select throws_ok(
  $$select public.preview_payment_allocation('00000000-0000-0000-0000-000000000001'::uuid,'00000000-0000-0000-0000-000000000002'::uuid,'[]'::jsonb)$$,
  '42501',
  'permission denied for function preview_payment_allocation',
  'unauthenticated callers cannot invoke payment review previews'
);
reset role;
select * from finish();
rollback;
