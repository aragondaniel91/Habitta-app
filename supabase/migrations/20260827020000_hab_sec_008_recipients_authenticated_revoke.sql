-- HAB-SEC-008: any authenticated administrator could read another condominium's residents.
--
-- `resolve_unit_financial_recipients` returns person ids, auth user ids and email addresses for
-- the people who should receive a unit's financial notices. It is SECURITY DEFINER with
-- `row_security = off`, so RLS does not stand between the caller and the rows, and it performs no
-- permission check of its own -- correctly, because it is meant to be reached only from
-- `expand_notification_event`, which is itself SECURITY DEFINER and therefore runs as the owner.
--
-- HAB-239 wrote:
--
--   revoke all on function ... resolve_unit_financial_recipients(...) from public, anon;
--   grant execute on function ... resolve_unit_financial_recipients(...) to service_role;
--
-- It revoked from `public` and `anon` and granted to `service_role`, but never revoked from
-- `authenticated`, which holds its own direct grant in Supabase. The intent is unmistakable from
-- the grant line; the lockdown just missed one role. This is HAB-SEC-001's mistake mirrored: there
-- the forgotten role was `anon`, here it is `authenticated`.
--
-- Demonstrated locally with two condominiums in separate organizations. The administrator of A,
-- holding entirely legitimate credentials for A, called the function with B's condominium and unit
-- ids and received a resident of B by person id and email address.
--
-- Exploitation needs a valid account plus a unit id belonging to the target. RLS does not hand
-- those out -- in the same fixture A reads zero of B's units, people and condominiums -- so this is
-- a serious cross-tenant disclosure rather than a mass-harvest primitive.
--
-- The internal caller is unaffected: `expand_notification_event` executes as the definer, so it
-- never needed the `authenticated` grant.

revoke execute on function
  public.resolve_unit_financial_recipients(uuid, uuid, timestamptz)
from authenticated, anon, public;

grant execute on function
  public.resolve_unit_financial_recipients(uuid, uuid, timestamptz)
to service_role;
