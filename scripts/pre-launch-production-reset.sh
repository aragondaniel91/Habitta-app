#!/usr/bin/env bash
#
# Pre-Launch Production Reset (HAB-418)
#
# Removes the test tenants that currently occupy Habitta production, so the first real customer
# arrives into a clean database. Run by hand, by a person, reading the output. It is deliberately
# not a workflow: nothing in CI should be able to reach this.
#
# The default mode makes no writes at all. Executing requires two separate, explicit things --
# DRY_RUN=false and CONFIRM set to the exact phrase below -- because one of them alone is a typo
# and both together are a decision.
#
# Survival is stated, never inferred. The script does not work out who "looks like" a test user; it
# reads an allowlist of accounts that must survive, and refuses to run if anything about that list
# does not line up with what is actually in the database. "Delete everything except..." is how you
# delete an account nobody meant to delete.
#
# --------------------------------------------------------------------------------------------
# Usage
#
#   Rehearsal against a local database (no production credentials, cannot write):
#     REHEARSAL=true SURVIVOR_ALLOWLIST=./survivors.txt \
#       PGHOST=127.0.0.1 PGPORT=54322 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=postgres \
#       ./scripts/pre-launch-production-reset.sh
#
#   Dry run against production (inventory and plan only, no writes):
#     ./scripts/pre-launch-production-reset.sh
#
#   The real thing:
#     DRY_RUN=false CONFIRM=RESET-HABITTA-PRODUCTION ./scripts/pre-launch-production-reset.sh
#
# --------------------------------------------------------------------------------------------
# Credentials
#
# This repository is public. Nothing secret is written to a file, printed, or passed on a command
# line where it would show up in a process list. Connection details reach psql through the standard
# PG* variables, which is why there is no --dbname anywhere below.
#
#   PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE   the production database
#   HABITTA_API_BASE_URL                          https://habitta-api-prod.<...>.workers.dev
#   HABITTA_OWNER_ACCESS_TOKEN                    a JWT for the organization owner
#   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY       Auth Admin API, for deleting users
#   SURVIVOR_ALLOWLIST                            path to the allowlist file
#
# The script needs no R2 credentials. File cleanup happens inside the API's own deletion flow,
# where the worker holds the bucket binding -- so this script never has the ability to touch the
# bucket, which is the strongest guarantee that it will not touch the wrong part of it.

set -euo pipefail

readonly REQUIRED_CONFIRMATION='RESET-HABITTA-PRODUCTION'

DRY_RUN="${DRY_RUN:-true}"
REHEARSAL="${REHEARSAL:-false}"
CONFIRM="${CONFIRM:-}"
SURVIVOR_ALLOWLIST="${SURVIVOR_ALLOWLIST:-}"
EXPECTED_PROJECT_REF="${EXPECTED_PROJECT_REF:-kgsfaahixbcwcmykmhat}"
EXPECTED_MAIN_SHA="${EXPECTED_MAIN_SHA:-}"
EXPECTED_BACKUP_KEY="${EXPECTED_BACKUP_KEY:-}"
EXPECTED_DRILL_RUN_ID="${EXPECTED_DRILL_RUN_ID:-}"
MAX_BACKUP_AGE_HOURS="${MAX_BACKUP_AGE_HOURS:-24}"

REPORT_DIR="${REPORT_DIR:-./.reset-report}"
STARTED_AT="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
REPORT="$REPORT_DIR/reset-$(date -u +'%Y%m%dT%H%M%SZ').txt"

failures=0

say() { printf '%s\n' "$*"; }
record() { printf '%s\n' "$*" >> "$REPORT"; }
both() { say "$*"; record "$*"; }

heading() {
  say ''
  say "=== $* ==="
  record ''
  record "=== $* ==="
}

# A failed check never stops at the first one. Seeing every problem at once is the difference
# between one careful pass and five rounds of surprise.
check() {
  local label="$1" outcome="$2" detail="${3:-}"
  if [ "$outcome" = 'ok' ]; then
    both "  [ok]    $label${detail:+ -- $detail}"
  else
    both "  [FAIL]  $label${detail:+ -- $detail}"
    failures=$((failures + 1))
  fi
}

q() { psql -X -qAt -v ON_ERROR_STOP=1 -c "$1"; }

abort() {
  say ''
  say "ABORT: $*"
  record ''
  record "ABORT: $*"
  say "Report: $REPORT"
  exit 1
}

mkdir -p "$REPORT_DIR"
record "Habitta Pre-Launch Production Reset"
record "started_at            $STARTED_AT"
record "dry_run               $DRY_RUN"
record "rehearsal             $REHEARSAL"

# --------------------------------------------------------------------------------- phase 0

heading "Phase 0 - preflight"

if [ "$REHEARSAL" = 'true' ] && [ "$DRY_RUN" != 'true' ]; then
  abort 'REHEARSAL=true cannot execute. Rehearsal exists to practise, never to destroy.'
fi

if [ -z "$SURVIVOR_ALLOWLIST" ] || [ ! -f "$SURVIVOR_ALLOWLIST" ]; then
  abort 'SURVIVOR_ALLOWLIST must point at a file listing the accounts that survive.'
fi

# One UUID per line; blank lines and # comments allowed so the list can explain itself.
mapfile -t survivors < <(grep -oE '^[0-9a-fA-F-]{36}' "$SURVIVOR_ALLOWLIST" || true)
survivor_count="${#survivors[@]}"

if [ "$survivor_count" -eq 0 ]; then
  abort 'The allowlist is empty. An empty allowlist means "delete every account", which is never what anybody meant.'
fi

survivor_sql="$(printf "'%s'," "${survivors[@]}")"
survivor_sql="${survivor_sql%,}"

both "  allowlist file        $SURVIVOR_ALLOWLIST"
both "  accounts to survive   $survivor_count"

if ! q 'select 1' >/dev/null 2>&1; then
  abort 'Cannot reach the database. Set PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE.'
fi
check 'database reachable' ok

if [ "$REHEARSAL" = 'true' ]; then
  both '  rehearsal mode - production identity, backup and drill checks are skipped'
else
  actual_ref="$(q "select current_setting('cluster_name', true)" || true)"
  if [ -n "$EXPECTED_PROJECT_REF" ] && [ -n "${SUPABASE_URL:-}" ]; then
    case "$SUPABASE_URL" in
      *"$EXPECTED_PROJECT_REF"*) check 'connected to the expected Supabase project' ok "$EXPECTED_PROJECT_REF" ;;
      *) check 'connected to the expected Supabase project' fail 'SUPABASE_URL does not carry the expected project ref' ;;
    esac
  else
    check 'connected to the expected Supabase project' fail 'set SUPABASE_URL and EXPECTED_PROJECT_REF'
  fi

  head_sha="$(git rev-parse HEAD)"
  if [ -n "$EXPECTED_MAIN_SHA" ]; then
    if [ "$head_sha" = "$EXPECTED_MAIN_SHA" ]; then
      check 'working tree is the reviewed commit' ok "${head_sha:0:12}"
    else
      check 'working tree is the reviewed commit' fail "expected ${EXPECTED_MAIN_SHA:0:12}, got ${head_sha:0:12}"
    fi
  else
    check 'working tree is the reviewed commit' fail 'set EXPECTED_MAIN_SHA'
  fi

  # The backup has to describe the state about to be destroyed, not last week's.
  if [ -n "$EXPECTED_BACKUP_KEY" ]; then
    backup_day="$(printf '%s' "$EXPECTED_BACKUP_KEY" | grep -oE '[0-9]{8}T[0-9]{6}Z' | head -n1 || true)"
    if [ -z "$backup_day" ]; then
      check 'backup key is well formed' fail "$EXPECTED_BACKUP_KEY"
    else
      backup_epoch="$(date -u -d "${backup_day:0:8} ${backup_day:9:2}:${backup_day:11:2}:${backup_day:13:2}" +%s 2>/dev/null || echo 0)"
      now_epoch="$(date -u +%s)"
      age_hours=$(( (now_epoch - backup_epoch) / 3600 ))
      if [ "$backup_epoch" -gt 0 ] && [ "$age_hours" -le "$MAX_BACKUP_AGE_HOURS" ]; then
        check 'backup is recent' ok "${age_hours}h old"
      else
        check 'backup is recent' fail "${age_hours}h old, limit ${MAX_BACKUP_AGE_HOURS}h -- take a fresh backup and re-run the drill"
      fi
    fi
  else
    check 'backup identified' fail 'set EXPECTED_BACKUP_KEY'
  fi

  # A backup nobody has restored is a belief, not a backup.
  if [ -n "$EXPECTED_DRILL_RUN_ID" ] && command -v gh >/dev/null 2>&1; then
    drill_conclusion="$(gh run view "$EXPECTED_DRILL_RUN_ID" --json conclusion -q .conclusion 2>/dev/null || echo 'unknown')"
    if [ "$drill_conclusion" = 'success' ]; then
      check 'restore drill for that backup is green' ok "run $EXPECTED_DRILL_RUN_ID"
    else
      check 'restore drill for that backup is green' fail "run $EXPECTED_DRILL_RUN_ID is $drill_conclusion"
    fi
  else
    check 'restore drill identified' fail 'set EXPECTED_DRILL_RUN_ID and install gh'
  fi

  for required in HABITTA_API_BASE_URL HABITTA_OWNER_ACCESS_TOKEN SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY; do
    if [ -n "${!required:-}" ]; then
      check "$required is set" ok
    else
      check "$required is set" fail 'required to delete tenants and users'
    fi
  done
fi

# --------------------------------------------------------------- allowlist against reality

missing_survivors="$(q "select count(*) from (select unnest(array[$survivor_sql]::uuid[]) as id) wanted
                        left join auth.users u on u.id = wanted.id where u.id is null")"
if [ "$missing_survivors" -eq 0 ]; then
  check 'every allowlisted account exists' ok
else
  check 'every allowlisted account exists' fail "$missing_survivors listed account(s) are not in auth.users"
fi

admins_outside="$(q "select count(*) from public.platform_admins p
                     where p.user_id <> all(array[$survivor_sql]::uuid[])")"
if [ "$admins_outside" -eq 0 ]; then
  check 'every platform admin is on the allowlist' ok
else
  check 'every platform admin is on the allowlist' fail "$admins_outside platform admin(s) would be deleted"
fi

# The same property from the other direction. Two checks that can only disagree if the query is
# wrong, which is the point of asking twice about something this expensive to get wrong.
admin_candidates="$(q "select count(*) from auth.users u
                       where u.id <> all(array[$survivor_sql]::uuid[])
                         and exists (select 1 from public.platform_admins p where p.user_id = u.id)")"
if [ "$admin_candidates" -eq 0 ]; then
  check 'no platform admin appears among deletion candidates' ok
else
  check 'no platform admin appears among deletion candidates' fail "$admin_candidates"
fi

if [ "$failures" -gt 0 ]; then
  abort "$failures preflight check(s) failed. Nothing was written."
fi

# --------------------------------------------------------------------------------- phase 1

heading "Phase 1 - inventory"

condominiums="$(q 'select count(*) from public.condominiums')"
organizations="$(q 'select count(*) from public.organizations')"
profiles="$(q 'select count(*) from public.profiles')"
invitations="$(q 'select count(*) from public.customer_invitations')"
auth_users="$(q 'select count(*) from auth.users')"
subscriptions="$(q 'select count(*) from public.subscriptions')"
terms="$(q 'select count(*) from public.subscription_terms')"
events="$(q 'select count(*) from public.subscription_events')"
units="$(q 'select count(*) from public.units')"
owners="$(q 'select count(*) from public.unit_owners')"
occupancies="$(q 'select count(*) from public.unit_occupancies')"
receivables="$(q 'select count(*) from public.receivable_items')"
payments="$(q 'select count(*) from public.payments')"
attachments="$(q "select (select count(*) from public.payment_proofs)
                       + (select count(*) from public.community_document_versions)
                       + (select count(*) from public.expense_attachments)
                       + (select count(*) from public.announcement_attachments)
                       + (select count(*) from public.governance_attachments)
                       + (select count(*) from public.maintenance_attachments)
                       + (select count(*) from public.service_request_attachments)")"

both ''
both "  condominiums          $condominiums"
both "  organizations         $organizations"
both "  profiles              $profiles"
both "  customer invitations  $invitations"
both "  auth users            $auth_users"
both "  subscriptions         $subscriptions"
both "  subscription terms    $terms"
both "  subscription events   $events"
both "  units                 $units"
both "  unit owners           $owners"
both "  unit occupancies      $occupancies"
both "  receivable items      $receivables"
both "  payments              $payments"
both "  attachment rows       $attachments"

heading "Phase 1 - what would be deleted"

both ''
both '  Condominiums, through the API deletion flow:'
q "select '    ' || c.id || '  ' || c.name || '  (owner ' || coalesce(o.name,'?') || ')'
   from public.condominiums c left join public.organizations o on o.id = c.organization_id
   order by c.name" | while IFS= read -r line; do both "$line"; done

both ''
both '  Organizations, once their condominiums are gone:'
q "select '    ' || id || '  ' || name from public.organizations order by name" \
  | while IFS= read -r line; do both "$line"; done

both ''
both '  Auth accounts that would be deleted (everything not on the allowlist):'
q "select '    ' || u.id || '  ' || coalesce(u.email,'(no email)')
   from auth.users u where u.id <> all(array[$survivor_sql]::uuid[]) order by u.email" \
  | while IFS= read -r line; do both "$line"; done

both ''
both '  Auth accounts that survive:'
q "select '    ' || u.id || '  ' || coalesce(u.email,'(no email)')
     || case when exists (select 1 from public.platform_admins p where p.user_id = u.id)
             then '  [platform admin]' else '' end
   from auth.users u where u.id = any(array[$survivor_sql]::uuid[]) order by u.email" \
  | while IFS= read -r line; do both "$line"; done

storage_keys="$(q "select (select count(*) from public.payment_proofs where object_key is not null)
                        + (select count(*) from public.community_document_versions where storage_key is not null)
                        + (select count(*) from public.expense_attachments where storage_key is not null)
                        + (select count(*) from public.announcement_attachments where storage_key is not null)
                        + (select count(*) from public.governance_attachments where storage_key is not null)
                        + (select count(*) from public.maintenance_attachments where storage_key is not null)
                        + (select count(*) from public.service_request_attachments where storage_key is not null)")"
both ''
both "  R2 objects referenced by those tenants: $storage_keys"
both '  Each condominium deletion returns its own key manifest and the worker deletes exactly those'
both '  keys. The bucket itself is never touched, and nothing here can delete an object that no'
both '  tenant row points at.'

# --------------------------------------------------------------------------------- gate

if [ "$DRY_RUN" != 'false' ]; then
  heading "Dry run complete - nothing was written"
  both ''
  both '  To execute, both of these must be true, and they are separate on purpose:'
  both '    DRY_RUN=false'
  both "    CONFIRM=$REQUIRED_CONFIRMATION"
  say ''
  say "Report: $REPORT"
  exit 0
fi

if [ "$CONFIRM" != "$REQUIRED_CONFIRMATION" ]; then
  abort "CONFIRM does not match. Expected exactly '$REQUIRED_CONFIRMATION'. Nothing was written."
fi

# --------------------------------------------------------------------------------- phase 2

heading "Phase 2 - deleting tenants through the official flow"

both ''
both '  Each condominium goes through POST /v1/condominiums/:id/danger-zone/delete, the same path'
both '  the product uses. That keeps the append-only triggers enabled, records a deletion job, and'
both '  lets the worker remove exactly the R2 keys the purge reports. No table is emptied by hand.'

deleted_tenants=0
deleted_objects=0

while IFS=$'\t' read -r condo_id condo_name; do
  [ -n "$condo_id" ] || continue
  both ''
  both "  deleting $condo_name ($condo_id)"
  response="$(curl -sS -X POST \
    "$HABITTA_API_BASE_URL/v1/condominiums/$condo_id/danger-zone/delete" \
    -H "Authorization: Bearer $HABITTA_OWNER_ACCESS_TOKEN" \
    -H 'Content-Type: application/json' \
    -d "$(printf '{"confirmation":"ELIMINAR %s"}' "$condo_name")" \
    -w '\n%{http_code}')"
  status="$(printf '%s' "$response" | tail -n1)"
  body="$(printf '%s' "$response" | sed '$d')"

  if [ "$status" != '200' ]; then
    both "    HTTP $status"
    both "    $body"
    abort 'A tenant deletion did not succeed. Stopping with the remaining tenants untouched.'
  fi

  objects="$(printf '%s' "$body" | grep -oE '"deletedStorageObjects":[0-9]+' | grep -oE '[0-9]+' || echo 0)"
  cleanup="$(printf '%s' "$body" | grep -oE '"storageCleanup":"[a-z]+"' || echo '')"
  both "    deleted, $objects R2 object(s), $cleanup"
  case "$cleanup" in
    *completed*) ;;
    *) abort 'File cleanup did not complete for this tenant. Resolve it before continuing.' ;;
  esac

  deleted_tenants=$((deleted_tenants + 1))
  deleted_objects=$((deleted_objects + objects))
done < <(q "select c.id || E'\t' || c.name from public.condominiums c order by c.name")

remaining_condominiums="$(q 'select count(*) from public.condominiums')"
if [ "$remaining_condominiums" -ne 0 ]; then
  abort "$remaining_condominiums condominium(s) remain. Not proceeding to organizations."
fi

# --------------------------------------------------------------------------------- phase 3

heading "Phase 3 - what the tenant purge does not reach"

# Ordinary deletes in dependency order. No TRUNCATE, no DROP, no improvised CASCADE, no
# session_replication_role, no disabled triggers, no disabled RLS: if a foreign key objects, that
# is information, and the right response is to stop and read it.
both ''
both "  customer invitations  $(q 'with gone as (delete from public.customer_invitations returning 1) select count(*) from gone')"
both "  organizations         $(q 'with gone as (delete from public.organizations returning 1) select count(*) from gone')"
both "  profiles              $(q "with gone as (delete from public.profiles where id <> all(array[$survivor_sql]::uuid[]) returning 1) select count(*) from gone")"

# --------------------------------------------------------------------------------- phase 4

heading "Phase 4 - Auth accounts"

both ''
both '  Through the Admin API, never SQL. The auth schema carries identities, sessions and refresh'
both '  tokens that Auth retires alongside the user; a direct DELETE leaves its bookkeeping'
both '  inconsistent in ways that surface later as login failures.'

deleted_users=0
while IFS= read -r user_id; do
  [ -n "$user_id" ] || continue
  code="$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE \
    "$SUPABASE_URL/auth/v1/admin/users/$user_id" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")"
  if [ "$code" != '200' ] && [ "$code" != '204' ]; then
    both "    $user_id -> HTTP $code"
    abort 'An Auth account could not be deleted. Stopping.'
  fi
  both "    deleted $user_id"
  deleted_users=$((deleted_users + 1))
done < <(q "select u.id from auth.users u where u.id <> all(array[$survivor_sql]::uuid[]) order by u.id")

# --------------------------------------------------------------------------------- phase 5

heading "Phase 5 - verification"

failures=0

verify_zero() {
  local label="$1" value
  value="$(q "$2")"
  if [ "$value" -eq 0 ]; then check "$label is empty" ok; else check "$label is empty" fail "$value row(s) remain"; fi
}

verify_exact() {
  local label="$1" expected="$3" value
  value="$(q "$2")"
  if [ "$value" -eq "$expected" ]; then check "$label" ok "$value"; else check "$label" fail "expected $expected, got $value"; fi
}

both ''
both '  Tenant data must be gone:'
verify_zero 'condominiums'          'select count(*) from public.condominiums'
verify_zero 'organizations'         'select count(*) from public.organizations'
verify_zero 'customer invitations'  'select count(*) from public.customer_invitations'
verify_zero 'units'                 'select count(*) from public.units'
verify_zero 'unit owners'           'select count(*) from public.unit_owners'
verify_zero 'unit occupancies'      'select count(*) from public.unit_occupancies'
verify_zero 'people'                'select count(*) from public.people'
verify_zero 'subscriptions'         'select count(*) from public.subscriptions'
verify_zero 'subscription terms'    'select count(*) from public.subscription_terms'
verify_zero 'subscription events'   'select count(*) from public.subscription_events'
verify_zero 'receivable items'      'select count(*) from public.receivable_items'
verify_zero 'receivable ledger'     'select count(*) from public.receivable_ledger_entries'
verify_zero 'payments'              'select count(*) from public.payments'
verify_zero 'payment allocations'   'select count(*) from public.payment_allocations'
verify_zero 'payment receipts'      'select count(*) from public.payment_receipts'
verify_zero 'treasury accounts'     'select count(*) from public.treasury_accounts'
verify_zero 'treasury movements'    'select count(*) from public.treasury_movements'
verify_zero 'expenses'              'select count(*) from public.expenses'
verify_zero 'budget periods'        'select count(*) from public.budget_periods'
verify_zero 'attachment metadata'   "select (select count(*) from public.payment_proofs)
                                          + (select count(*) from public.community_document_versions)
                                          + (select count(*) from public.expense_attachments)
                                          + (select count(*) from public.announcement_attachments)
                                          + (select count(*) from public.governance_attachments)
                                          + (select count(*) from public.maintenance_attachments)
                                          + (select count(*) from public.service_request_attachments)"

# A sweep over every tenant-scoped table, so a table nobody thought to name here cannot hide rows.
verify_zero 'every condominium-scoped table' "
  select coalesce(sum(rows), 0)::bigint from (
    select (xpath('/row/c/text()',
      query_to_xml(format('select count(*) as c from public.%I', c.relname), false, true, '')))[1]::text::bigint as rows
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public' and c.relkind = 'r'
      and a.attname = 'condominium_id' and not a.attisdropped
      and c.relname not in ('condominium_deletion_jobs')
  ) counted"

both ''
both '  Infrastructure must survive:'
verify_exact 'plans'                'select count(*) from public.plans' 5
verify_exact 'capabilities'         'select count(*) from public.capabilities' 22
verify_exact 'auth accounts'        'select count(*) from auth.users' "$survivor_count"
check 'platform admins intact' \
  "$( [ "$(q "select count(*) from public.platform_admins p left join auth.users u on u.id = p.user_id where u.id is null")" -eq 0 ] && echo ok || echo fail )" \
  'every platform admin still has an account'

plan_caps="$(q 'select count(*) from public.plan_capabilities')"
deletion_jobs="$(q 'select count(*) from public.condominium_deletion_jobs')"
pending_cleanups="$(q "select count(*) from public.condominium_deletion_jobs where storage_cleanup_status <> 'completed'")"
tables_without_rls="$(q "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                         where n.nspname='public' and c.relkind='r' and not c.relrowsecurity")"
public_tables="$(q "select count(*) from pg_tables where schemaname='public'")"
migrations="$(q 'select count(*) from supabase_migrations.schema_migrations')"

both "  plan capabilities     $plan_caps"
both "  deletion jobs kept    $deletion_jobs"
both "  public tables         $public_tables"
both "  migrations            $migrations"

check 'every deletion job completed its file cleanup' \
  "$( [ "$pending_cleanups" -eq 0 ] && echo ok || echo fail )" "$pending_cleanups pending"
check 'row level security still enabled everywhere' \
  "$( [ "$tables_without_rls" -eq 0 ] && echo ok || echo fail )" "$tables_without_rls table(s) without RLS"
check 'deletion audit preserved' \
  "$( [ "$deletion_jobs" -ge "$deleted_tenants" ] && echo ok || echo fail )" \
  "$deletion_jobs job(s) for $deleted_tenants tenant(s)"

for fn in request_condominium_deletion resolve_entitlements my_entitlements is_unit_condominium_purge_authorized; do
  present="$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                where n.nspname='public' and p.proname='$fn'")"
  check "function $fn present" "$( [ "$present" -ge 1 ] && echo ok || echo fail )"
done

# --------------------------------------------------------------------------------- report

heading "Result"

both ''
both "  tenants deleted       $deleted_tenants"
both "  R2 objects deleted    $deleted_objects"
both "  auth accounts deleted $deleted_users"
both "  auth accounts kept    $survivor_count"
both "  finished_at           $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
record "commit                $(git rev-parse HEAD)"
record "backup                ${EXPECTED_BACKUP_KEY:-unset}"
record "restore_drill_run     ${EXPECTED_DRILL_RUN_ID:-unset}"

say ''
say "Report: $REPORT"

if [ "$failures" -gt 0 ]; then
  abort "$failures verification check(s) failed after the reset. Investigate before creating the demo tenant."
fi

both ''
both '  All verifications passed. Production is ready for the demo tenant (HAB-416).'
