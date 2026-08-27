#!/usr/bin/env bash
#
# Pre-Launch Production Reset (HAB-418)
#
# Removes the test tenants occupying Habitta production, so the first real customer arrives into a
# clean database. Run by hand, by a person, reading the output. Deliberately not a workflow:
# nothing in CI should be able to reach an operation that empties production.
#
# The default mode writes nothing. Executing needs two separate, explicit things -- DRY_RUN=false
# and CONFIRM set to the exact phrase -- because one alone is a typo and both together are a
# decision.
#
# Survival is stated, never inferred. The script does not work out who "looks like" a test account;
# it reads an allowlist of accounts that must survive and refuses to run if that list disagrees
# with the database. "Delete everything except" is how an account nobody meant to delete gets
# deleted.
#
# --------------------------------------------------------------------------------------------
# Usage
#
#   Rehearsal, inventory only, against a local database:
#     REHEARSAL=true SURVIVOR_ALLOWLIST=./survivors.txt ./scripts/pre-launch-production-reset.sh
#
#   Rehearsal that actually performs the sequence against a local database:
#     REHEARSAL=true REHEARSAL_EXECUTE=true SURVIVOR_ALLOWLIST=./survivors.txt \
#       ./scripts/pre-launch-production-reset.sh
#
#   Dry run against production:
#     SURVIVOR_ALLOWLIST=./survivors.txt EXPECTED_MAIN_SHA=... EXPECTED_BACKUP_KEY=... \
#       EXPECTED_DRILL_RUN_ID=... ./scripts/pre-launch-production-reset.sh
#
#   The real thing, using the fingerprint the dry run printed:
#     DRY_RUN=false CONFIRM=RESET-HABITTA-PRODUCTION \
#       EXPECTED_INVENTORY_FINGERPRINT=<from the dry run> ... ./scripts/pre-launch-production-reset.sh
#
# --------------------------------------------------------------------------------------------
# Secrets
#
# This repository is public. No secret is printed, written to a file, or passed on a command line
# where a process list would expose it. Database credentials reach psql through the standard PG*
# variables, which is why no --dbname appears below; HTTP credentials reach curl through a config
# read from stdin, which is why no -H carrying a token appears either.
#
#   PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE   the production database
#   HABITTA_API_BASE_URL                          the production worker
#   HABITTA_OWNER_ACCESS_TOKEN                    a JWT for the organization owner
#   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY       Auth Admin API, for deleting accounts
#   SURVIVOR_ALLOWLIST                            path to the allowlist file
#
# The script needs no R2 credentials. File cleanup happens inside the API's own deletion flow,
# where the worker holds the bucket binding -- so this script has no ability to touch the bucket at
# all, which is a stronger guarantee than any amount of care with a prefix.

set -euo pipefail

readonly REQUIRED_CONFIRMATION='RESET-HABITTA-PRODUCTION'

DRY_RUN="${DRY_RUN:-true}"
REHEARSAL="${REHEARSAL:-false}"
REHEARSAL_EXECUTE="${REHEARSAL_EXECUTE:-false}"
CONFIRM="${CONFIRM:-}"
SURVIVOR_ALLOWLIST="${SURVIVOR_ALLOWLIST:-}"
EXPECTED_MAIN_SHA="${EXPECTED_MAIN_SHA:-}"
EXPECTED_BACKUP_KEY="${EXPECTED_BACKUP_KEY:-}"
EXPECTED_DRILL_RUN_ID="${EXPECTED_DRILL_RUN_ID:-}"
EXPECTED_INVENTORY_FINGERPRINT="${EXPECTED_INVENTORY_FINGERPRINT:-}"
MAX_BACKUP_AGE_HOURS="${MAX_BACKUP_AGE_HOURS:-24}"

REPORT_DIR="${REPORT_DIR:-./.reset-report}"
STARTED_AT="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
REPORT="$REPORT_DIR/reset-$(date -u +'%Y%m%dT%H%M%SZ').txt"

WORK="$(mktemp -d)"
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT

failures=0

say() { printf '%s\n' "$*"; }
record() { printf '%s\n' "$*" >> "$REPORT"; }
both() { say "$*"; record "$*"; }

heading() {
  say ''; say "=== $* ==="
  record ''; record "=== $* ==="
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

note() { both "  [note]  $*"; }

q() { psql -X -qAt -v ON_ERROR_STOP=1 -c "$1"; }

abort() {
  say ''; say "ABORT: $*"
  record ''; record "ABORT: $*"
  say "Report: $REPORT"
  exit 1
}

# curl with credentials supplied through a config on stdin. Nothing sensitive reaches argv, so a
# process list on a shared machine shows only the word curl.
api_call() {
  local method="$1" url="$2" auth_header="$3" extra_header="${4:-}" body_file="${5:-}"
  {
    printf 'request = "%s"\n' "$method"
    printf 'url = "%s"\n' "$url"
    printf 'header = "%s"\n' "$auth_header"
    [ -n "$extra_header" ] && printf 'header = "%s"\n' "$extra_header"
    [ -n "$body_file" ] && printf 'data = "@%s"\n' "$body_file"
    printf 'silent\nshow-error\nwrite-out = "\\n%%{http_code}"\n'
  } | curl -K -
}

mkdir -p "$REPORT_DIR"
record "Habitta Pre-Launch Production Reset"
record "started_at            $STARTED_AT"
record "dry_run               $DRY_RUN"
record "rehearsal             $REHEARSAL"

# --------------------------------------------------------------------------------- phase 0

heading "Phase 0 - preflight"

if [ "$REHEARSAL" = 'true' ] && [ "$DRY_RUN" != 'true' ]; then
  abort 'REHEARSAL=true cannot run against production. Use REHEARSAL_EXECUTE=true to rehearse the full sequence locally.'
fi

if [ "$REHEARSAL_EXECUTE" = 'true' ] && [ "$REHEARSAL" != 'true' ]; then
  abort 'REHEARSAL_EXECUTE=true requires REHEARSAL=true.'
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
  note 'rehearsal mode - production identity, backup and drill checks are skipped'
else
  for required in HABITTA_API_BASE_URL HABITTA_OWNER_ACCESS_TOKEN SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY; do
    if [ -n "${!required:-}" ]; then check "$required is set" ok; else check "$required is set" fail 'required'; fi
  done

  # The database and the API must be the same project, and a substring of a URL does not prove it.
  # Ask the Auth Admin API about an account the database also knows, and require both to agree on
  # its address. Two systems that agree on a specific account are the same system.
  if [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
    probe_id="${survivors[0]}"
    db_email="$(q "select coalesce(email,'') from auth.users where id = '$probe_id'")"
    api_response="$(api_call GET "$SUPABASE_URL/auth/v1/admin/users/$probe_id" \
      "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
      "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" || true)"
    api_status="$(printf '%s' "$api_response" | tail -n1)"
    api_email="$(printf '%s' "$api_response" | sed '$d' \
      | grep -oE '"email":"[^"]*"' | head -n1 | sed 's/.*:"//; s/"$//' || true)"
    if [ "$api_status" = '200' ] && [ -n "$db_email" ] && [ "$db_email" = "$api_email" ]; then
      check 'database and Supabase API are the same project' ok 'both resolve the same account'
    else
      check 'database and Supabase API are the same project' fail \
        "Auth API returned HTTP $api_status and the addresses do not agree"
    fi
  fi

  head_sha="$(git rev-parse HEAD)"
  if [ -n "$EXPECTED_MAIN_SHA" ] && [ "$head_sha" = "$EXPECTED_MAIN_SHA" ]; then
    check 'working tree is the reviewed commit' ok "${head_sha:0:12}"
  else
    check 'working tree is the reviewed commit' fail "expected ${EXPECTED_MAIN_SHA:-unset}, got ${head_sha:0:12}"
  fi

  # The backup must describe the state about to be destroyed, not last week's.
  if [ -n "$EXPECTED_BACKUP_KEY" ]; then
    stamp="$(printf '%s' "$EXPECTED_BACKUP_KEY" | grep -oE '[0-9]{8}T[0-9]{6}Z' | head -n1 || true)"
    if [ -z "$stamp" ]; then
      check 'backup key is well formed' fail "$EXPECTED_BACKUP_KEY"
    else
      backup_epoch="$(date -u -d "${stamp:0:8} ${stamp:9:2}:${stamp:11:2}:${stamp:13:2}" +%s 2>/dev/null || echo 0)"
      age_hours=$(( ($(date -u +%s) - backup_epoch) / 3600 ))
      if [ "$backup_epoch" -gt 0 ] && [ "$age_hours" -le "$MAX_BACKUP_AGE_HOURS" ]; then
        check 'backup is recent' ok "${age_hours}h old"
      else
        check 'backup is recent' fail "${age_hours}h old, limit ${MAX_BACKUP_AGE_HOURS}h -- take a fresh backup and re-run the drill"
      fi
    fi
  else
    check 'backup identified' fail 'set EXPECTED_BACKUP_KEY'
  fi

  # A green drill proves some backup restores. This proves it was *this* one: the run's own log
  # names the object it downloaded, so the two are tied together rather than asserted together.
  if [ -n "$EXPECTED_DRILL_RUN_ID" ] && [ -n "$EXPECTED_BACKUP_KEY" ] && command -v gh >/dev/null 2>&1; then
    drill_conclusion="$(gh run view "$EXPECTED_DRILL_RUN_ID" --json conclusion -q .conclusion 2>/dev/null || echo unknown)"
    if [ "$drill_conclusion" = 'success' ]; then
      check 'restore drill is green' ok "run $EXPECTED_DRILL_RUN_ID"
      if gh run view "$EXPECTED_DRILL_RUN_ID" --log 2>/dev/null | grep -qF "$EXPECTED_BACKUP_KEY"; then
        check 'that drill restored this exact backup' ok
      else
        check 'that drill restored this exact backup' fail \
          "run $EXPECTED_DRILL_RUN_ID does not mention $EXPECTED_BACKUP_KEY"
      fi
    else
      check 'restore drill is green' fail "run $EXPECTED_DRILL_RUN_ID is $drill_conclusion"
    fi
  else
    check 'restore drill identified' fail 'set EXPECTED_DRILL_RUN_ID and install gh'
  fi
fi

# --------------------------------------------------------------- allowlist against reality

missing_survivors="$(q "select count(*) from (select unnest(array[$survivor_sql]::uuid[]) as id) wanted
                        left join auth.users u on u.id = wanted.id where u.id is null")"
if [ "$missing_survivors" -eq 0 ]; then
  check 'every allowlisted account exists' ok
else
  check 'every allowlisted account exists' fail "$missing_survivors listed account(s) are not in auth.users"
fi

admin_total="$(q 'select count(*) from public.platform_admins')"
admins_outside="$(q "select count(*) from public.platform_admins p
                     where p.user_id <> all(array[$survivor_sql]::uuid[])")"
if [ "$admins_outside" -eq 0 ]; then
  check 'every platform admin is on the allowlist' ok
else
  check 'every platform admin is on the allowlist' fail "$admins_outside platform admin(s) would be deleted"
fi

# With no platform admins registered, the two checks above are satisfied by an empty table rather
# than by anything being protected. Say so, because a check that cannot fail is not reassurance.
if [ "$admin_total" -eq 0 ]; then
  note 'platform_admins is empty, so the two checks above passed vacuously.'
  note 'The allowlisted account is protected by being on the list, not by being an admin.'
  note 'Registering the platform admin is a separate action after this reset.'
fi

if [ "$failures" -gt 0 ]; then
  abort "$failures preflight check(s) failed. Nothing was written."
fi

# --------------------------------------------------------------------------------- phase 1

heading "Phase 1 - inventory"

# The sets are frozen here, before any confirmation and before anything is deleted. Every later
# phase reads these files. Re-querying between the plan and the act is how a tenant created in
# between gets destroyed without ever appearing in the plan somebody approved.
q "select c.id || E'\t' || c.name from public.condominiums c order by c.id" > "$WORK/condominiums.tsv"
q "select u.id || E'\t' || coalesce(u.email,'') from auth.users u
   where u.id <> all(array[$survivor_sql]::uuid[]) order by u.id" > "$WORK/deletable-users.tsv"
q "select u.id || E'\t' || coalesce(u.email,'') from auth.users u
   where u.id = any(array[$survivor_sql]::uuid[]) order by u.id" > "$WORK/surviving-users.tsv"

condominium_count="$(grep -c . "$WORK/condominiums.tsv" || true)"
deletable_users="$(grep -c . "$WORK/deletable-users.tsv" || true)"
surviving_users="$(grep -c . "$WORK/surviving-users.tsv" || true)"

# A fingerprint over the frozen sets. The dry run prints it; executing requires it to still match,
# so a reset can only ever act on the inventory that was reviewed.
fingerprint="$(cat "$WORK/condominiums.tsv" "$WORK/deletable-users.tsv" | sha256sum | cut -c1-16)"

both ''
both "  condominiums          $condominium_count"
both "  organizations         $(q 'select count(*) from public.organizations')"
both "  profiles              $(q 'select count(*) from public.profiles')"
both "  customer invitations  $(q 'select count(*) from public.customer_invitations')"
both "  auth users            $(q 'select count(*) from auth.users')"
both "    to delete           $deletable_users"
both "    to survive          $surviving_users"
both "  subscriptions         $(q 'select count(*) from public.subscriptions')"
both "  subscription terms    $(q 'select count(*) from public.subscription_terms')"
both "  subscription events   $(q 'select count(*) from public.subscription_events')"
both "  units                 $(q 'select count(*) from public.units')"
both "  unit owners           $(q 'select count(*) from public.unit_owners')"
both "  unit occupancies      $(q 'select count(*) from public.unit_occupancies')"
both "  receivable items      $(q 'select count(*) from public.receivable_items')"
both "  payments              $(q 'select count(*) from public.payments')"

heading "Phase 1 - the frozen plan"

both ''
both '  Condominiums, through the API deletion flow:'
while IFS=$'\t' read -r cid cname; do
  [ -n "$cid" ] && both "    $cid  $cname"
done < "$WORK/condominiums.tsv"

both ''
both '  Organizations, once their condominiums are gone:'
q "select '    ' || id || '  ' || name from public.organizations order by name" \
  | while IFS= read -r line; do both "$line"; done

both ''
both '  Auth accounts to delete:'
while IFS=$'\t' read -r uid uemail; do
  [ -n "$uid" ] && both "    $uid  ${uemail:-(no email)}"
done < "$WORK/deletable-users.tsv"

both ''
both '  Auth accounts that survive:'
while IFS=$'\t' read -r uid uemail; do
  [ -n "$uid" ] && both "    $uid  ${uemail:-(no email)}"
done < "$WORK/surviving-users.tsv"

storage_keys="$(q "select (select count(*) from public.payment_proofs where object_key is not null)
                        + (select count(*) from public.community_document_versions where storage_key is not null)
                        + (select count(*) from public.expense_attachments where storage_key is not null)
                        + (select count(*) from public.announcement_attachments where storage_key is not null)
                        + (select count(*) from public.governance_attachments where storage_key is not null)
                        + (select count(*) from public.maintenance_attachments where storage_key is not null)
                        + (select count(*) from public.service_request_attachments where storage_key is not null)")"
both ''
both "  R2 objects referenced by those tenants: $storage_keys"
both '  Each deletion returns its own key manifest and the worker deletes exactly those keys.'

both ''
both "  inventory fingerprint  $fingerprint"

# --------------------------------------------------------------------------------- gate

if [ "$DRY_RUN" != 'false' ] && [ "$REHEARSAL_EXECUTE" != 'true' ]; then
  heading "Dry run complete - nothing was written"
  both ''
  both '  To execute, all three, separate on purpose:'
  both '    DRY_RUN=false'
  both "    CONFIRM=$REQUIRED_CONFIRMATION"
  both "    EXPECTED_INVENTORY_FINGERPRINT=$fingerprint"
  say ''
  say "Report: $REPORT"
  exit 0
fi

if [ "$REHEARSAL_EXECUTE" != 'true' ]; then
  if [ "$CONFIRM" != "$REQUIRED_CONFIRMATION" ]; then
    abort "CONFIRM does not match. Expected exactly '$REQUIRED_CONFIRMATION'. Nothing was written."
  fi
  if [ -z "$EXPECTED_INVENTORY_FINGERPRINT" ]; then
    abort "EXPECTED_INVENTORY_FINGERPRINT is required. Run the dry run first; it is $fingerprint right now."
  fi
  if [ "$EXPECTED_INVENTORY_FINGERPRINT" != "$fingerprint" ]; then
    abort "Production changed since the dry run. Reviewed $EXPECTED_INVENTORY_FINGERPRINT, found $fingerprint. Nothing was written."
  fi
  check 'inventory unchanged since the reviewed dry run' ok "$fingerprint"
fi

# --------------------------------------------------------------------------------- phase 2

heading "Phase 2 - deleting tenants through the official flow"

both ''
both '  Each condominium goes through POST /v1/condominiums/:id/danger-zone/delete, the path the'
both '  product itself uses. The append-only triggers stay enabled, a deletion job is recorded, and'
both '  the worker removes exactly the R2 keys the purge reports. No table is emptied by hand.'

deleted_tenants=0
deleted_objects=0

while IFS=$'\t' read -r condo_id condo_name; do
  [ -n "$condo_id" ] || continue
  both ''
  both "  deleting $condo_name ($condo_id)"

  if [ "$REHEARSAL_EXECUTE" = 'true' ]; then
    # Same RPC, same authorization, different transport. The rehearsal cannot reach the worker, so
    # it calls request_condominium_deletion as the organization owner the RPC requires -- it does
    # not weaken or skip that check. R2 is untouched because there is no R2 here.
    owner_id="$(q "select om.user_id from public.condominiums c
                   join public.organization_memberships om on om.organization_id = c.organization_id
                   where c.id = '$condo_id' and om.role = 'organization_owner' limit 1")"
    if [ -z "$owner_id" ]; then
      abort "No organization owner for $condo_id. In production the API would refuse this too."
    fi
    objects="$(psql -X -qAt -v ON_ERROR_STOP=1 <<SQL
select set_config('request.jwt.claims',
  json_build_object('sub','$owner_id','role','authenticated')::text, false);
set role authenticated;
select storage_object_count from public.request_condominium_deletion(
  '$condo_id', 'ELIMINAR ' || (select name from public.condominiums where id = '$condo_id'));
SQL
)"
    objects="$(printf '%s' "$objects" | tail -n1)"
    both "    deleted (rehearsal), manifest reported ${objects:-0} object(s)"
  else
    # The body is built by the database, so a condominium named with a quote or a backslash is
    # escaped by something that knows JSON rather than by string concatenation here.
    q "select json_build_object('confirmation', 'ELIMINAR ' || c.name)::text
       from public.condominiums c where c.id = '$condo_id'" > "$WORK/body.json"
    chmod 600 "$WORK/body.json"

    response="$(api_call POST "$HABITTA_API_BASE_URL/v1/condominiums/$condo_id/danger-zone/delete" \
      "Authorization: Bearer $HABITTA_OWNER_ACCESS_TOKEN" \
      'Content-Type: application/json' "$WORK/body.json" || true)"
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
  fi

  deleted_tenants=$((deleted_tenants + 1))
  deleted_objects=$((deleted_objects + ${objects:-0}))
done < "$WORK/condominiums.tsv"

remaining="$(q 'select count(*) from public.condominiums')"
if [ "$remaining" -ne 0 ]; then
  abort "$remaining condominium(s) remain. Not proceeding to organizations."
fi

# --------------------------------------------------------------------------------- phase 3

heading "Phase 3 - what the tenant purge does not reach"

# Ordinary deletes in dependency order. No TRUNCATE, no DROP, no improvised CASCADE, no
# session_replication_role, no disabled triggers, no disabled RLS. If a foreign key objects, that
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
both ''
both '  Acting on the list frozen in phase 1, not on a fresh query.'

deleted_users=0
while IFS=$'\t' read -r user_id user_email; do
  [ -n "$user_id" ] || continue
  if [ "$REHEARSAL_EXECUTE" = 'true' ]; then
    both "    would delete $user_id ${user_email:-} (rehearsal makes no Auth call)"
    continue
  fi
  response="$(api_call DELETE "$SUPABASE_URL/auth/v1/admin/users/$user_id" \
    "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" || true)"
  code="$(printf '%s' "$response" | tail -n1)"
  if [ "$code" != '200' ] && [ "$code" != '204' ]; then
    both "    $user_id -> HTTP $code"
    abort 'An Auth account could not be deleted. Stopping.'
  fi
  both "    deleted $user_id ${user_email:-}"
  deleted_users=$((deleted_users + 1))
done < "$WORK/deletable-users.tsv"

# --------------------------------------------------------------------------------- phase 5

heading "Phase 5 - verification"

failures=0

verify_zero() {
  local label="$1" value
  value="$(q "$2")"
  if [ "$value" -eq 0 ]; then check "$label is empty" ok; else check "$label is empty" fail "$value row(s) remain"; fi
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
verify_zero 'expenses'              'select count(*) from public.expenses'
verify_zero 'attachment metadata'   "select (select count(*) from public.payment_proofs)
                                          + (select count(*) from public.community_document_versions)
                                          + (select count(*) from public.expense_attachments)
                                          + (select count(*) from public.announcement_attachments)
                                          + (select count(*) from public.governance_attachments)
                                          + (select count(*) from public.maintenance_attachments)
                                          + (select count(*) from public.service_request_attachments)"

# A sweep over every condominium-scoped table, so one nobody thought to name cannot hide rows.
verify_zero 'every condominium-scoped table' "
  select coalesce(sum(rows), 0)::bigint from (
    select (xpath('/row/c/text()',
      query_to_xml(format('select count(*) as c from public.%I', c.relname), false, true, '')))[1]::text::bigint as rows
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public' and c.relkind = 'r'
      and a.attname = 'condominium_id' and not a.attisdropped
      and c.relname <> 'condominium_deletion_jobs'
  ) counted"

both ''
both '  Infrastructure must survive:'
for pair in 'plans:5' 'capabilities:22'; do
  table="${pair%%:*}"; want="${pair##*:}"; got="$(q "select count(*) from public.$table")"
  if [ "$got" -eq "$want" ]; then check "$table intact" ok "$got"; else check "$table intact" fail "expected $want, got $got"; fi
done

auth_left="$(q 'select count(*) from auth.users')"
if [ "$REHEARSAL_EXECUTE" = 'true' ]; then
  note "auth accounts left $auth_left (rehearsal deletes none)"
elif [ "$auth_left" -eq "$survivor_count" ]; then
  check 'exactly the allowlisted accounts remain' ok "$auth_left"
else
  check 'exactly the allowlisted accounts remain' fail "expected $survivor_count, found $auth_left"
fi

pending="$(q "select count(*) from public.condominium_deletion_jobs where storage_cleanup_status <> 'completed'")"
jobs="$(q 'select count(*) from public.condominium_deletion_jobs')"
no_rls="$(q "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname='public' and c.relkind='r' and not c.relrowsecurity")"
tables="$(q "select count(*) from pg_tables where schemaname='public'")"
migrations="$(q 'select count(*) from supabase_migrations.schema_migrations')"

both "  plan capabilities     $(q 'select count(*) from public.plan_capabilities')"
both "  deletion jobs kept    $jobs"
both "  public tables         $tables"
both "  migrations            $migrations"

if [ "$REHEARSAL_EXECUTE" = 'true' ]; then
  note "file cleanup pending on $pending job(s) - expected, the rehearsal has no worker to finish them"
else
  check 'every deletion job completed its file cleanup' "$( [ "$pending" -eq 0 ] && echo ok || echo fail )" "$pending pending"
fi
check 'row level security still enabled everywhere' "$( [ "$no_rls" -eq 0 ] && echo ok || echo fail )" "$no_rls without RLS"
check 'deletion audit preserved' "$( [ "$jobs" -ge "$deleted_tenants" ] && echo ok || echo fail )" \
  "$jobs job(s) for $deleted_tenants tenant(s)"

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
both "  inventory fingerprint $fingerprint"
both "  finished_at           $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
record "commit                $(git rev-parse HEAD)"
record "backup                ${EXPECTED_BACKUP_KEY:-unset}"
record "restore_drill_run     ${EXPECTED_DRILL_RUN_ID:-unset}"

say ''
say "Report: $REPORT"

if [ "$failures" -gt 0 ]; then
  abort "$failures verification check(s) failed. Investigate before creating the demo tenant."
fi

both ''
both '  All verifications passed.'
if [ "$REHEARSAL_EXECUTE" != 'true' ]; then
  both '  Next: register the platform admin, then create the demo tenant (HAB-416).'
fi
