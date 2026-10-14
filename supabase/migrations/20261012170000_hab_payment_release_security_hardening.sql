-- Release CI hardening for P5/P6 permissions on a fresh Supabase database.
-- A role-level GRANT is separate from row-level security: anonymous users must
-- never obtain payment-method mutation privileges (even when RLS is enabled).
revoke insert, update on table public.condominium_payment_methods from anon;

-- P6's notification processor is an internal service worker entry point.
-- The preceding migration revoked PUBLIC and authenticated, but Supabase can
-- retain a direct anon EXECUTE grant. Close it without affecting service_role.
revoke all on function public.process_notification_event(uuid),
  public.enqueue_payment_agreement_notification() from anon;

-- Only guarded SECURITY DEFINER agreement RPCs call this low-level helper.
-- It bypasses RLS and checks no caller identity itself; it cannot be an
-- executable endpoint for either client role.
revoke all on function public.assert_payment_agreement_sources(uuid)
  from anon, authenticated;
