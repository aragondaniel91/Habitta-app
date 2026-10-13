-- Browser payment-method writes are authorized by the existing RLS policy.  PostgREST still
-- requires table privileges before evaluating that policy, so grant only the two mutations the
-- manual-method API performs.  GRANT is additive and idempotent; DELETE remains unavailable.
grant insert, update on table public.condominium_payment_methods to authenticated;
