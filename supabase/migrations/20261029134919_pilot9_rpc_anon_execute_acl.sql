-- Pilot #5/#9 / release AppSec: clear residual explicit anonymous EXECUTE
-- on three privileged payment-proof and allocation-proposal RPCs. Earlier
-- migrations revoked PUBLIC but left previously granted per-role anon ACLs.
-- The current production role inventory confirmed anon EXECUTE on all three.
--
-- Non-destructive and idempotent ACL-only change. Preserve authenticated and
-- service_role access; retain function bodies, data, tenant checks and ledger.
revoke all on function
  public.save_payment_allocation_intent(uuid, uuid, jsonb),
  public.get_payment_allocation_intent(uuid, uuid),
  public.can_upload_payment_proof(uuid, uuid)
  from public, anon, authenticated, service_role;

grant execute on function
  public.save_payment_allocation_intent(uuid, uuid, jsonb),
  public.get_payment_allocation_intent(uuid, uuid),
  public.can_upload_payment_proof(uuid, uuid)
  to authenticated, service_role;
