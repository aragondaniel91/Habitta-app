-- HAB-SEC-009: an administrator of one condominium could write budget lines into another's budget.
--
-- `insert_budget_lines_from_json` validates a batch of budget lines and inserts them. It is a
-- helper: the only callers are `create_budget_period` and `create_budget_revision`, both
-- SECURITY DEFINER and both gated on `can_manage_budgets`. The helper itself performs no
-- permission check, which is right for something reached only from an already-authorized caller --
-- but it was granted to `authenticated`, so it could also be reached directly.
--
-- Demonstrated with two condominiums in separate organizations. The administrator of A called the
-- helper with B's budget version and period and injected a line of 999,999 USD into B's budget.
-- B's budget went from one line totalling 1,000.00 to two totalling 1,000,999.00.
--
-- Two schema constraints turned the first attempts away -- a NOT NULL, then a unique index -- which
-- is worth stating plainly: the data was defended by accident, and picking a different expense
-- category walked straight past both. Constraints protect shape, not authority.
--
-- Exploitation needs a valid account plus the target's budget version and period ids. RLS does not
-- hand those out, which is what keeps this out of P0.
--
-- The callers are unaffected: they execute as the definer and never needed the client grant.

revoke execute on function
  public.insert_budget_lines_from_json(uuid, uuid, uuid, jsonb)
from authenticated, anon, public;
