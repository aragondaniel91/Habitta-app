-- HAB-PILOT-002-P2B CI security hardening.
-- The staff-identity predicate is an internal helper called by a SECURITY DEFINER
-- authorization wrapper. It must not itself be a callable RLS-bypassing RPC.
-- Retain the approved payment-draft collaboration policy and wrapper unchanged.
revoke all on function public.is_payment_staff_owner(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.is_payment_staff_owner(uuid, uuid)
  to service_role;
