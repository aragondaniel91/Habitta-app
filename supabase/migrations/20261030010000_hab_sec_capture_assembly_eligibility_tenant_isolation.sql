-- Tenant isolation: capture_assembly_eligibility is reachable only through the assembly lifecycle.
--
-- The function freezes an assembly's voting roll with RLS off and no authorization of its own; it is
-- designed to run inside transition_assembly('start'), which checks that the caller manages the
-- condominium. Its migration (20260814230000) revoked PUBLIC and granted service_role, but Supabase's
-- default privileges had already granted anon and authenticated explicitly, and revoking PUBLIC does
-- not remove per-role grants. Any signed-in account of any condominium could freeze another
-- condominium's roll before its assembly started (proved by supabase/tests/hab_sec_capture_assembly_eligibility.sql
-- against the previous migration set).
--
-- ACL only. transition_assembly runs as the function owner and is unaffected. Idempotent.
-- Reversal (restores the exact previous ACL):
--   grant execute on function public.capture_assembly_eligibility(uuid, uuid) to anon, authenticated;
revoke execute on function public.capture_assembly_eligibility(uuid, uuid) from public, anon, authenticated;
grant execute on function public.capture_assembly_eligibility(uuid, uuid) to service_role;
