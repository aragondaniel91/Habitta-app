# HAB-528 — Privileged RPC security triage and release gate

**Status:** OPEN — audit methodology only; no production grants or migrations changed.

## Verified read-only production baseline (2026-10-26)

- 127 ordinary/partitioned public tables, all RLS enabled; 2 public views, both `security_invoker=true`.
- 442 functions in public, of which 388 are `SECURITY DEFINER`; 202 SECURITY DEFINER functions are executable by `anon`.
- Supabase security advisors: 202 anonymous definer warnings, 306 authenticated definer warnings, 27 mutable search_path warnings, 13 RLS-without-policy informational notices, 1 leaked-password-protection warning.
- Spot-checked deny `anon`: `set_condominium_charge_scope`, `approve_payment`, `get_receivables_summary`, `insert_receivable_item_and_entry`, `claim_notification_events`.
- Spot-checked intended anonymous API entry points: `get_public_plan_catalog` and `get_resident_invitation_preview`. Their business authorization/token checks still require separate review.
- These are *counts*, not vulnerability claims. A definer function can be deliberately public, and an RLS-enabled table can still have an unsafe policy.

## Read-only review query (run only through an authorized database audit channel)

```sql
select
  p.oid::regprocedure::text as signature,
  p.prosecdef as security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  pg_get_userbyid(p.proowner) as owner,
  p.proconfig as function_settings,
  p.provolatile as volatility,
  p.proacl as direct_acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and has_function_privilege('anon', p.oid, 'EXECUTE')
order by 1;
```

The result is sensitive inventory. Retain it in restricted engineering records, not application logs or public issue comments. Do not copy function source or credentials into reports unnecessarily.

## Classification matrix (per full function signature, including overloads)

| Class | Policy | Mandatory evidence |
| --- | --- | --- |
| A — Deliberately public | Keep `anon` only after review | Explicit documented unauthenticated use case, no dangerous side effects, safe token/ownership validation, tenant negative tests |
| B — Authenticated public RPC | Revoke `anon` only through migration and compatibility-tested rollout | Client/Worker call-site inventory, authenticated/tenant permission tests, preview validation |
| C — Internal privileged RPC | Deny both `anon` and `authenticated` | Server-only invocation path, minimum `service_role` grant, negative pgTAP role tests |
| D — Unknown / overloaded / privileged mutation | Release blocker until classified | Owner, search_path, SQL body analysis, dependencies, grants, external API usage and independent reviewer |

Review `SECURITY DEFINER` functions for explicit `search_path`, safe qualified object references, role / `auth.uid()` checks, RLS bypass implications, executable grant options, tenant isolation and data minimization. Cross-reference `pg_policies`, view options, object and sequence grants. Never infer safety from naming alone.

## CI policy, rollout and release decision

1. Reconcile this inventory with committed migrations and production catalog state, including custom roles and `PUBLIC` grants; identify drift without writing to production.
2. For every restrictive grant change, author a migration with explicit least-privilege grants and test against production-compatible fixtures. Maintain the permanent Supabase rule for all new public tables: explicit grants, RLS, policies and tenant boundaries.
3. pgTAP must demonstrate allowed role works **and** `anon`, wrong condominium, and unauthorized authenticated caller fail. Include overloaded signatures rather than only a function name.
4. Independent review must approve migration and dependency impact, and authenticated E2E must pass before enabling any affected UI or feature flags.
5. **Only then** prepare backups, migration preflight, rollback, production change window and post-deploy smoke tests; `main` merge and green CI alone are not production signoff.

**Related checks already in repo:** `hab_sec_001_anon_execute.sql`, `hab528_charge_scope_grants.sql`, `hab528_public_rls_invoker_guards.sql`. This runbook does not replace their tests or grant release approval.
