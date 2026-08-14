# Database backup and disaster recovery

## Purpose

Habitta's production database currently runs on Supabase without PITR. This runbook defines the application-owned recovery path used before a pilot condominium can depend on the product.

The goal is not merely to create SQL files. A backup only counts as usable after its encrypted archive has passed checksum validation and has been restored successfully into an isolated database with Auth and representative financial invariants verified.

## Recovery objectives

- **RPO:** 24 hours. The scheduled production backup runs once every day.
- **RTO target:** 4 hours from declaring a database-loss incident to a validated database restore. This is an operational target and must be re-measured after each drill.
- **Owner:** Habitta platform operator with access to the GitHub `production` environment, Supabase production project and private Cloudflare R2 backup bucket.

## What is backed up

The workflow creates four Supabase logical dumps plus aggregate recovery evidence:

1. database roles (`roles.sql`)
2. application/public schema (`schema.sql`)
3. application/public rows (`data.sql`)
4. Supabase Auth rows (`auth-data.sql`), excluding Auth schema migrations
5. aggregate source metrics (`source-metrics.tsv`) containing counts only for Auth users and representative financial tables

Supabase's normal database dump intentionally excludes managed schemas such as `auth`, so the workflow captures Auth data explicitly. The Auth dump contains authentication data needed for recovery and is therefore treated as sensitive backup material even though the aggregate metrics do not contain IDs, emails, names, tokens, amounts or document contents.

An internal SHA-256 manifest covers every plaintext dump, aggregate metrics, source commit and UTC creation timestamp. The files are archived and encrypted with AES-256-CBC/PBKDF2 before upload. A second SHA-256 checksum covers the encrypted object.

The plaintext SQL is never uploaded as a GitHub Actions artifact and is deleted from the runner before the job exits.

## What is not backed up by this workflow

Database dumps do not contain object bytes stored outside PostgreSQL. Habitta object storage must therefore be treated as a separate recovery surface. Payment-proof objects in Cloudflare R2 and any other object bucket are not reconstructed by restoring this database archive. Their retention/replication policy must be verified separately before claiming full-application disaster recovery.

## Required production resources

Private R2 bucket:

`habitta-database-backups-prod`

GitHub `production` environment secrets used by the workflows:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `BACKUP_ENCRYPTION_PASSPHRASE`

The encryption passphrase must be stored outside the repository and outside the R2 bucket as well. Losing it makes the backups intentionally unrecoverable.

## Backup workflow

Workflow: `Production Database Backup`

It runs daily and can also be invoked manually. A successful run:

1. links the pinned Supabase CLI to the production project;
2. dumps roles, application schema and application data;
3. explicitly dumps Auth data while excluding `auth.schema_migrations`;
4. records count-only recovery metrics for `auth.users`, `payments`, `payment_allocations`, `payment_receipts`, `receivable_items` and `receivable_ledger_entries`;
5. creates the internal checksum manifest;
6. archives and encrypts the dump locally;
7. verifies the encrypted file has a SHA-256 checksum;
8. uploads only the encrypted archive and checksum to private R2;
9. removes local plaintext and encrypted working files at job cleanup.

Objects are placed under:

`daily/YYYY/MM/DD/<timestamp>-<source-sha>.tar.gz.enc`

The count-only metrics are evidence for restore equality. They are not business reports and must not be expanded to include user identifiers, emails, monetary amounts, proof metadata or other PII.

## Restore drill

Workflow: `Database Restore Drill`

Input: an exact `daily/.../*.tar.gz.enc` object key produced by the strengthened backup workflow.

The drill does **not** write to production. It:

1. downloads the encrypted archive and its checksum from private R2;
2. verifies the encrypted checksum;
3. decrypts locally;
4. validates the internal manifest and requires `auth-data.sql` plus `source-metrics.tsv`;
5. starts the repository's local Supabase PostgreSQL service;
6. preserves Supabase-managed Auth DDL and `auth.schema_migrations`, but clears disposable local Auth rows;
7. recreates a clean `public` application schema;
8. restores Auth rows into the isolated Supabase target;
9. restores application schema and data;
10. recomputes the same aggregate Auth/financial counts and requires exact equality with the backup source metrics;
11. verifies representative financial referential invariants and requires zero violations;
12. destroys local restored plaintext and the local Supabase target.

### Restore invariants

The drill fails closed if any source/restored aggregate count differs. It also fails if any of the following are detected:

- payment whose submitting user is missing from restored `auth.users`;
- payment allocation whose payment is missing;
- payment allocation whose receivable is missing;
- receipt whose payment is missing;
- ledger entry referencing a missing payment;
- ledger entry referencing a missing allocation;
- approved payment without a receipt;
- payment allocation without its corresponding credit ledger entry.

The workflow logs only metric names and aggregate failure counts. It does not print user IDs, emails, payment IDs, monetary amounts or authentication data.

### Auth restoration safety

The drill never drops the local `auth` schema because its DDL is managed by the Supabase platform. It retains `auth.schema_migrations`, clears data from the remaining Auth tables in the disposable local target, and imports the encrypted backup's Auth rows. This verifies that the backup contains the users required by application foreign keys while preserving the target platform's Auth schema version.

A production recovery must use a Supabase-supported target and migration procedure appropriate to the target project's platform version. Do not blindly replay Auth schema DDL from a source project.

## Incident recovery procedure

For a real production database-loss incident:

1. Stop application writes or put the affected environment into maintenance mode.
2. Identify the most recent known-good encrypted backup based on incident time and RPO.
3. Run `Database Restore Drill` against that exact object first. Do not restore an archive that fails either checksum layer, Auth count comparison or financial invariants.
4. Create or designate the isolated Supabase recovery target.
5. Preserve the recovery target's Supabase-managed platform schemas and restore Auth/application data using the tested compatible procedure.
6. Re-run Auth count comparisons, database tests and the critical financial invariants before directing any application traffic to it.
7. Verify authentication/RLS, tenant isolation, payments, treasury balances, notification outbox, invitations and governance reads.
8. Verify external object storage independently; database recovery does not restore R2 object bytes.
9. Record incident timestamps, selected backup key, achieved RPO/RTO and validation evidence.
10. Only then approve traffic cutover.

## Retention

Target retention is 30 daily backups. The private R2 bucket uses the configured lifecycle policy for objects under `daily/`. Lifecycle configuration is part of the backup platform evidence and must remain enabled.

## Drill evidence required after HAB-153

The strengthened implementation is not considered operationally proven merely because the workflow YAML merges. After deployment of this change, capture:

- one successful production backup created by the strengthened workflow;
- the resulting encrypted R2 object key;
- successful encrypted and internal checksums;
- one successful `Database Restore Drill` using that new-format backup;
- exact Auth and financial aggregate count matches;
- zero violations across all documented restore invariants;
- measured drill duration compared with the 4-hour RTO target.

If the first strengthened drill reveals a Supabase Auth data-order or platform-version incompatibility, keep HAB-153 open and correct the restore procedure rather than weakening or skipping the Auth verification.
