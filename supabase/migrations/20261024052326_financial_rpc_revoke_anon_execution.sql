-- HAB-FINANCIAL-RPC-GRANTS-002: least privilege at the EXECUTE boundary.
-- Existing RLS and function-internal authorization checks remain unchanged.
-- Supabase historic default ACLs grant 'anon' EXECUTE directly; revoking from
-- PUBLIC alone does not remove the direct anon grant (HAB-SEC-001 precedent).
-- These are authenticated/resident/admin payment and receivables RPCs.
-- Public plan and tokenized invitation preview functions are intentionally excluded.
-- Idempotent; no data writes, function replacements, or permission escalation.

revoke execute on function
  public.approve_payment(uuid, uuid, jsonb),
  public.create_payment_draft(uuid, uuid, uuid, uuid, date, numeric, text, text, text, text, text),
  public.create_receivable_item(uuid, uuid, uuid, text, numeric, text, date, date),
  public.get_receivables_aging(uuid),
  public.get_receivables_summary(uuid),
  public.get_unit_statement(uuid, uuid),
  public.post_charge_batch(uuid, uuid, text, text, date, date, public.charge_batch_distribution, jsonb, text, numeric),
  public.preview_payment_allocation(uuid, uuid, jsonb),
  public.record_payment_proof(uuid, uuid, uuid, text, text, text, bigint, text),
  public.reverse_payment(uuid, uuid, text),
  public.submit_payment(uuid, uuid),
  public.update_payment_draft(uuid, uuid, uuid, date, numeric, text, text, text, text)
from anon, public;

-- Explicit grants prevent dependence on pre-October-30 default ACL behavior.
grant execute on function
  public.approve_payment(uuid, uuid, jsonb),
  public.create_payment_draft(uuid, uuid, uuid, uuid, date, numeric, text, text, text, text, text),
  public.create_receivable_item(uuid, uuid, uuid, text, numeric, text, date, date),
  public.get_receivables_aging(uuid),
  public.get_receivables_summary(uuid),
  public.get_unit_statement(uuid, uuid),
  public.post_charge_batch(uuid, uuid, text, text, date, date, public.charge_batch_distribution, jsonb, text, numeric),
  public.preview_payment_allocation(uuid, uuid, jsonb),
  public.record_payment_proof(uuid, uuid, uuid, text, text, text, bigint, text),
  public.reverse_payment(uuid, uuid, text),
  public.submit_payment(uuid, uuid),
  public.update_payment_draft(uuid, uuid, uuid, date, numeric, text, text, text, text)
to authenticated, service_role;
