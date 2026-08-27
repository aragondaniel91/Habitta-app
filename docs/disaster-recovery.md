# Disaster recovery: what we restore, and what the platform recreates

The database restore drill exists to answer one question with evidence: if we lost the production
database, could we put Habitta back? This document states what "back" means, because a restore that
silently covers less than we think is worse than no restore at all — it produces confidence without
recoverability.

Two categories, and one deliberate exception.

## OWNED / RECOVERED

Schemas and data Habitta is the source of truth for. Losing these means losing the product, so the
drill must prove every one of them comes back.

- `public` — every application table, all 113 of them
- Private schemas we create, currently `habitta_internal`
- Our RLS policies, functions, triggers, constraints and types
- Multi-tenant relationships, including every `condominium_id` boundary
- Financial state: receivables, payments, allocations, receipts, the ledger, treasury, budgets
- The commercial foundation: `plans`, `capabilities`, `subscriptions`, `subscription_terms`
- Migration history, as the record of how the schema was built

**The allowlist is derived, never written down.** `supabase db dump` with no `--schema` already
emits exactly the schemas Habitta owns, so the `CREATE SCHEMA` statements in `schema.sql` are the
CLI's own answer to "what is ours". The data dump then names those schemas plus `public`.

This is the point of the design: a migration that introduces the next private schema is picked up
automatically, and a Supabase release that introduces the next managed table is irrelevant. The
alternative — excluding internal tables one at a time — is a list that never stops growing, and we
had already started it (`-x storage.buckets_vectors`, `-x storage.vector_indexes`) before noticing
what those two exclusions were symptoms of.

## MANAGED / RECREATED

Infrastructure Supabase owns. The target instance brings its own, at its own version, and trying to
restore ours over it is what broke the drill: production's `storage.buckets` has a
`versioning_status` column that the CLI's bundled Storage does not, so the restore failed on a
column mismatch that had nothing to do with Habitta's data.

`storage` · `supabase_functions` · `vault` · `graphql` · `graphql_public` · `realtime` ·
`_realtime` · `net` · `supabase_migrations`

**Excluding these from the database drill does not exclude them from disaster recovery.** It says
their recovery belongs to the service's own procedure, not to a logical restore of our Postgres
database.

### Storage, specifically

Habitta does not use Supabase Storage as business storage. Files live in Cloudflare R2, bucket
`habitta-payment-proofs-prod`, reached through the worker's `PAYMENT_PROOFS` binding.

What the database backup does cover, because it is ours: the attachment metadata and the R2 keys,
in `announcement_attachments`, `community_document_versions`, `expense_attachments`,
`governance_attachments`, `maintenance_attachments`, `payment_proofs` and
`service_request_attachments`.

What still needs its own procedure, and is **not** proven by this drill:

- the R2 bucket itself, and its lifecycle and access configuration
- the objects in it
- the ability to list and restore those objects

A restore that brings back every key while the bucket is empty gives you a working application
whose every document download 404s. That gap is real; it is simply not a gap a Postgres dump can
close.

### Edge functions and deployable code

`supabase_functions` holds the platform's internal bookkeeping, not our source. Deployable code is
recovered from the repository and the deployment pipeline, which are its source of truth. Rebuilding
those tables from a SQL dump would restore a record of deployments without restoring what was
deployed.

## AUTH DATA — the exception

Supabase owns the `auth` schema. Habitta's users are still part of our recovery objective, and this
is not a soft preference: **136 foreign keys in `public` point at `auth.users`**. A restore without
them is a database whose every `created_by` dangles and whose customers cannot log in.

So the rule is narrower than the category:

- We do **not** restore Auth's DDL. The target's own Auth schema, at the target's own version, wins.
- We **do** restore Auth's data, onto that schema.

`auth-data.sql` is dumped separately and is the only loader for it. `data.sql` carries no `auth`
blocks at all, because it is dumped by the owned-schema allowlist — which is also what fixed the
duplicate-key failure, where loading both files inserted every user twice.

The independent witness is `source-metrics.tsv`, whose `auth_users` count comes from its own query
at backup time and is compared against the restored database. A check that re-read the file we just
loaded would agree with itself no matter what happened.

## What the drill asserts

Failing closed at each step, with nothing suppressed:

1. The target is genuinely clean — every schema the backup carries is dropped first, and emptiness
   is asserted across all of them rather than across `public` alone
2. A backup cannot name a Supabase-managed schema for dropping; being named is a hard failure
3. `data.sql` contains no managed schema, and `schema.sql` recreates none
4. Auth users restore, and their count matches the independent witness
5. Application data restores, and aggregate counts match source
6. Foreign keys into `auth.users` resolve
7. Eight financial invariants hold — allocations to payments, receipts to payments, ledger entries
   to both, approved payments to receipts
8. `habitta_internal` and its purge authorization table exist
9. Every `public` table has row level security enabled
10. Four critical functions exist by name
11. The commercial foundation's four tables exist
12. Applied migrations match what the repository declares
13. **The restored state is non-trivial** — users, condominiums, units and subscriptions all
    non-zero, because every check above would pass over an empty database

The last one is the reason the rest is evidence rather than ceremony.

## Known limitations

- **R2 objects are not covered here.** See above. This needs its own drill.
- **The drill restores onto the CLI's bundled Postgres and Auth**, not onto a byte-identical copy of
  the production platform. It proves our data survives a restore; it does not prove a
  platform-version upgrade path.
- **`supabase stop --no-backup || true`** in the teardown step suppresses errors deliberately. It is
  cleanup after the verdict has already been decided, and it is the only suppressed command in
  either workflow.
- **A new managed schema introduced by Supabase** would be classified as owned by the derivation
  above, because it would appear in `schema.sql`. It would then fail loudly at restore rather than
  silently, and the fix would be to add it to the guarded list in the drill.
