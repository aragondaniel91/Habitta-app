begin;
select plan(5);

select ok(
  not has_function_privilege('anon', 'public.is_payment_staff_owner(uuid,uuid)', 'EXECUTE'),
  'anonymous clients cannot directly invoke the RLS-bypassing internal staff predicate'
);

select ok(
  not has_function_privilege('authenticated', 'public.is_payment_staff_owner(uuid,uuid)', 'EXECUTE'),
  'authenticated clients cannot directly invoke the RLS-bypassing internal staff predicate'
);

select ok(
  has_function_privilege('service_role', 'public.is_payment_staff_owner(uuid,uuid)', 'EXECUTE'),
  'the server-side service role retains access for trusted internal use'
);

select ok(
  not has_function_privilege('authenticated', 'public.can_manage_payment_draft(uuid,uuid)', 'EXECUTE'),
  'authenticated clients cannot query arbitrary owner draft authorization'
);

select ok(
  has_function_privilege('authenticated', 'public.can_manage_payment_draft_by_id(uuid,uuid)', 'EXECUTE'),
  'authenticated callers use the payment-ID-scoped draft guard instead of the owner-ID helper'
);

select * from finish();
rollback;
