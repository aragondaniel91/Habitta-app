#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF is required}"
: "${SUPABASE_DB_PASSWORD:?SUPABASE_DB_PASSWORD is required}"
: "${BACKUP_ENCRYPTION_PASSPHRASE:?BACKUP_ENCRYPTION_PASSPHRASE is required}"
: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is required}"
: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID is required}"
: "${GITHUB_SHA:?GITHUB_SHA is required}"

BACKUP_BUCKET="${BACKUP_BUCKET:-habitta-database-backups-prod}"
HABITTA_DEV_PROJECT_REF="${HABITTA_DEV_PROJECT_REF:-kgsfaahixbcwcmykmhat}"

if [[ "$SUPABASE_PROJECT_REF" == "$HABITTA_DEV_PROJECT_REF" ]]; then
  echo 'Refusing pre-migration production backup: project ref points to Habitta-dev.' >&2
  exit 1
fi

umask 077
rm -rf .backup-pre-release
mkdir -p .backup-pre-release/plain .backup-pre-release/out
trap 'rm -rf .backup-pre-release' EXIT

supabase link --project-ref "$SUPABASE_PROJECT_REF" --password "$SUPABASE_DB_PASSWORD"
test -s supabase/.temp/pooler-url
POOLER_URL="$(sed 's/:\[YOUR-PASSWORD\]@/@/' supabase/.temp/pooler-url)"
APP_TABLE_COUNT="$(PGPASSWORD="$SUPABASE_DB_PASSWORD" psql "$POOLER_URL" -X -qAt -v ON_ERROR_STOP=1 -c "select count(*) from pg_tables where schemaname = 'public';")"
[[ "$APP_TABLE_COUNT" =~ ^[0-9]+$ ]]

if [[ "$APP_TABLE_COUNT" -eq 0 ]]; then
  echo 'Fresh production database detected; no pre-migration application data exists to back up.'
  exit 0
fi

for table in payments payment_allocations payment_receipts receivable_items receivable_ledger_entries; do
  EXISTS="$(PGPASSWORD="$SUPABASE_DB_PASSWORD" psql "$POOLER_URL" -X -qAt -v ON_ERROR_STOP=1 -c "select to_regclass('public.${table}') is not null;")"
  [[ "$EXISTS" == 't' ]] || {
    echo "Refusing production migration: existing schema is missing required backup metric table public.${table}." >&2
    exit 1
  }
done

supabase db dump --linked --role-only -f .backup-pre-release/plain/roles.sql
supabase db dump --linked -f .backup-pre-release/plain/schema.sql
supabase db dump --linked --data-only --use-copy \
  -x 'storage.buckets_vectors' \
  -x 'storage.vector_indexes' \
  -f .backup-pre-release/plain/data.sql
supabase db dump --linked --schema auth --data-only --use-copy \
  -x 'auth.schema_migrations' \
  -f .backup-pre-release/plain/auth-data.sql

PGPASSWORD="$SUPABASE_DB_PASSWORD" psql "$POOLER_URL" -X -qAt -v ON_ERROR_STOP=1 <<'SQL' > .backup-pre-release/plain/source-metrics.tsv
select 'auth_users' || E'\t' || count(*) from auth.users;
select 'payments' || E'\t' || count(*) from public.payments;
select 'payment_allocations' || E'\t' || count(*) from public.payment_allocations;
select 'payment_receipts' || E'\t' || count(*) from public.payment_receipts;
select 'receivable_items' || E'\t' || count(*) from public.receivable_items;
select 'receivable_ledger_entries' || E'\t' || count(*) from public.receivable_ledger_entries;
SQL

test -s .backup-pre-release/plain/schema.sql
test -s .backup-pre-release/plain/data.sql
test -s .backup-pre-release/plain/auth-data.sql
test -s .backup-pre-release/plain/source-metrics.tsv
printf '%s\n' "$GITHUB_SHA" > .backup-pre-release/plain/source-commit.txt
date -u +'%Y-%m-%dT%H:%M:%SZ' > .backup-pre-release/plain/created-at.txt
(
  cd .backup-pre-release/plain
  sha256sum roles.sql schema.sql data.sql auth-data.sql source-metrics.tsv source-commit.txt created-at.txt > manifest.sha256
)
tar -C .backup-pre-release/plain -czf .backup-pre-release/database-backup.tar.gz .

BACKUP_ID="pre-release-$(date -u +'%Y%m%dT%H%M%SZ')-${GITHUB_SHA::12}"
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 250000 \
  -pass env:BACKUP_ENCRYPTION_PASSPHRASE \
  -in .backup-pre-release/database-backup.tar.gz \
  -out ".backup-pre-release/out/${BACKUP_ID}.tar.gz.enc"
sha256sum ".backup-pre-release/out/${BACKUP_ID}.tar.gz.enc" > ".backup-pre-release/out/${BACKUP_ID}.sha256"

# Keep the same daily/YYYY/MM/DD object layout used by Database Restore Drill. The backup ID
# distinguishes release snapshots from scheduled daily backups without creating a second restore path.
OBJECT_PREFIX="daily/$(date -u +'%Y/%m/%d')"
pnpm --filter @habitta/api exec wrangler r2 object put \
  "$BACKUP_BUCKET/$OBJECT_PREFIX/${BACKUP_ID}.tar.gz.enc" \
  --file "$GITHUB_WORKSPACE/.backup-pre-release/out/${BACKUP_ID}.tar.gz.enc" --remote
pnpm --filter @habitta/api exec wrangler r2 object put \
  "$BACKUP_BUCKET/$OBJECT_PREFIX/${BACKUP_ID}.sha256" \
  --file "$GITHUB_WORKSPACE/.backup-pre-release/out/${BACKUP_ID}.sha256" --remote

echo "Pre-migration production backup stored as $OBJECT_PREFIX/${BACKUP_ID}.tar.gz.enc"
