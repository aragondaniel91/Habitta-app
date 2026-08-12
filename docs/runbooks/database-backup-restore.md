# Database backup and disaster recovery

## Purpose

Habitta's production database currently runs on Supabase without PITR. This runbook defines the application-owned recovery path used before a pilot condominium can depend on the product.

The goal is not merely to create SQL files. A backup only counts as usable after its encrypted archive has passed checksum validation and has been restored successfully into an isolated database.

## Recovery objectives

- **RPO:** 24 hours. The scheduled production backup runs once every day.
- **RTO target:** 4 hours from declaring a database-loss incident to a validated database restore. This is an operational target and must be re-measured after each drill.
- **Owner:** Habitta platform operator with access to the GitHub `production` environment, Supabase production project and private Cloudflare R2 backup bucket.

## What is backed up

The workflow creates three Supabase logical dumps:

1. database roles (`roles.sql`)
2. database schema (`schema.sql`)
3. database rows (`data.sql`)

An internal SHA-256 manifest covers every plaintext dump plus the source commit and UTC creation timestamp. The files are archived and encrypted with AES-256-CBC/PBKDF2 before upload. A second SHA-256 checksum covers the encrypted object.

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
2. dumps roles, schema and data;
3. creates the internal checksum manifest;
4. archives and encrypts the dump locally;
5. verifies the encrypted file has a SHA-256 checksum;
6. uploads only the encrypted archive and checksum to private R2;
7. removes local plaintext and encrypted working files at job cleanup.

Objects are placed under:

`daily/YYYY/MM/DD/<timestamp>-<source-sha>.tar.gz.enc`

## Restore drill

Workflow: `Database Restore Drill`

Input: an exact `daily/.../*.tar.gz.enc` object key produced by the backup workflow.

The drill does **not** write to production. It:

1. downloads the encrypted archive and its checksum from private R2;
2. verifies the encrypted checksum;
3. decrypts locally;
4. validates the internal manifest;
5. starts the repository's local Supabase PostgreSQL service;
6. creates a separate `habitta_restore_drill` database;
7. restores schema and data into that isolated database;
8. verifies that public tables exist and that PostgreSQL can query the restored database;
9. destroys the local restore database and plaintext files.

A successful drill is required evidence before HAB-135 can be closed.

## Incident recovery procedure

For a real production database-loss incident:

1. Stop application writes or put the affected environment into maintenance mode.
2. Identify the most recent known-good encrypted backup based on incident time and RPO.
3. Run `Database Restore Drill` against that exact object first. Do not restore an archive that fails either checksum layer.
4. Create or designate the isolated Supabase recovery target.
5. Follow Supabase's supported restore order: roles, schema, then data.
6. Run database tests and critical financial invariants against the recovery target before directing any application traffic to it.
7. Verify authentication/RLS, tenant isolation, payments, treasury balances, notification outbox, invitations and governance reads.
8. Verify external object storage independently; database recovery does not restore R2 object bytes.
9. Record incident timestamps, selected backup key, achieved RPO/RTO and validation evidence.
10. Only then approve traffic cutover.

## Retention

Target retention is 30 daily backups. Configure the private R2 bucket with a lifecycle rule that deletes objects under `daily/` after 30 days. Lifecycle configuration must be verified in Cloudflare before HAB-135 is considered complete.

## Closure evidence

HAB-135 remains open until all of the following are recorded:

- one successful production backup workflow run;
- the resulting encrypted R2 object key;
- successful encrypted and internal checksums;
- one successful `Database Restore Drill` using that object;
- verified 30-day R2 lifecycle rule;
- measured drill duration compared with the 4-hour RTO target.
