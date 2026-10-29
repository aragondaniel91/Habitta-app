-- Pilot #9 / release AppSec: remove residual explicit anonymous EXECUTE on a
-- privileged payment-allocation proposal RPC. The preceding migration revoked
-- PUBLIC, but older per-role anon grants can survive that REVOKE.
--
-- ACL-only and non-destructive: preserves existing authenticated callers and
-- service_role while restoring the intended deny-by-default boundary.
revoke all on function public.save_payment_allocation_intent(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.save_payment_allocation_intent(uuid, uuid, jsonb)
  to authenticated, service_role;
