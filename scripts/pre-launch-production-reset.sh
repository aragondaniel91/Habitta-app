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
# Two properties carry the whole design.
#
#   Survival is stated, never inferred. The script does not work out who "looks like" a test
#   account; it reads an allowlist of accounts that must survive and refuses to run if that list
#   disagrees with the database. "Delete everything except" is how an account nobody meant to
#   delete gets deleted.
#
#   The reviewed set is the only set that can be destroyed. Every population is frozen to a file
#   during the inventory, and every later phase deletes by those exact ids. Nothing is re-queried
#   between the plan and the act, and a fingerprint over all six frozen sets must still match when
#   executing -- so a row created after the dry run causes an abort rather than a deletion nobody
#   reviewed.
#
# --------------------------------------------------------------------------------------------
# Usage
#
#   Rehearsal, inventory only, against a local database:
#     REHEARSAL=true SURVIVOR_ALLOWLIST=./survivors.txt ./scripts/pre-launch-production-reset.sh
#
#   Rehearsal that performs the whole sequence against a local database:
#     REHEARSAL=true REHEARSAL_EXECUTE=true SURVIVOR_ALLOWLIST=./survivors.txt \
#       ./scripts/pre-launch-production-reset.sh
#
#   Dry run against production:
#     SURVIVOR_ALLOWLIST=./survivors.txt EXPECTED_MAIN_SHA=... EXPECTED_BACKUP_KEY=... \
#       EXPECTED_DRILL_RUN_ID=... ./scripts/pre-launch-production-reset.sh
#
#   The real thing, using the fingerprint the dry run printed:
#     DRY_RUN=false CONFIRM=RESET-HABITTA-PRODUCTION \
#       EXPECTED_INVENTORY_FINGERPRINT=<64 hex chars from the dry run> ... \
#       ./scripts/pre-launch-production-reset.sh
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
#   EXPECTED_PROJECT_REF                          kgsfaahixbcwcmykmhat for production
#   HABITTA_API_BASE_URL                          the production worker
#   OWNER_CREDENTIALS_FILE                        organization id -> owner JWT, mode 0600
#   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY       Auth Admin API, for deleting accounts
#   SURVIVOR_ALLOWLIST                            path to the allowlist file, never committed
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
EXPECTED_PROJECT_REF="${EXPECTED_PROJECT_REF:-}"
OWNER_CREDENTIALS_FILE="${OWNER_CREDENTIALS_FILE:-}"
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
ok_if() { [ "$1" -eq 0 ] && echo ok || echo fail; }

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

# The subject of a JWT, read without verifying it. This is not authentication -- it answers "which
# account does this token claim to be" so ownership can be checked against the database before any
# network call. Production additionally validates the token remotely, where the signature counts.
jwt_subject() {
  local payload
  payload="$(printf '%s' "$1" | cut -d. -f2 | tr '_-' '/+')"
  case $(( ${#payload} % 4 )) in
    2) payload="$payload==" ;;
    3) payload="$payload=" ;;
  esac
  printf '%s' "$payload" | base64 -d 2>/dev/null \
    | grep -oE '"sub":"[^"]*"' | head -n1 | sed 's/.*:"//; s/"$//' || true
}

# A SQL uuid[] built from the first column of a frozen set. Deleting by these arrays -- rather than
# by re-running the query that produced them -- is what makes the reviewed set the only set that
# can be destroyed.
id_array() {
  local ids
  ids="$(cut -f1 "$1" | grep -E '^[0-9a-fA-F-]{36}$' | sed "s/^/'/; s/\$/'/" | paste -sd, - || true)"
  if [ -z "$ids" ]; then printf "array[]::uuid[]"; else printf "array[%s]::uuid[]" "$ids"; fi
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
  for required in HABITTA_API_BASE_URL OWNER_CREDENTIALS_FILE SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY EXPECTED_PROJECT_REF; do
    if [ -n "${!required:-}" ]; then check "$required is set" ok; else check "$required is set" fail 'required'; fi
  done

  # Both halves of the connection must belong to the expected project, and they are checked
  # separately because they can disagree. A database restored from a production backup carries
  # production's data while living somewhere else entirely; pointed at production's Auth API, every
  # other check in this script would pass while the deletions landed on the wrong database.
  if [ -n "$EXPECTED_PROJECT_REF" ]; then
    case "${SUPABASE_URL:-}" in
      *"$EXPECTED_PROJECT_REF"*) check 'SUPABASE_URL belongs to the expected project' ok "$EXPECTED_PROJECT_REF" ;;
      *) check 'SUPABASE_URL belongs to the expected project' fail "does not name $EXPECTED_PROJECT_REF" ;;
    esac

    # Supabase writes the project ref into the host on a direct connection and into the role name
    # through Supavisor, so either one proves it. `current_user` comes from the server rather than
    # from the environment, which is what makes this about the connection actually in use.
    effective_user="$(q 'select current_user')"
    pg_identity='no'
    case "${PGHOST:-}" in *"$EXPECTED_PROJECT_REF"*) pg_identity='host' ;; esac
    case "$effective_user" in *"$EXPECTED_PROJECT_REF"*) pg_identity='pooler role' ;; esac
    if [ "$pg_identity" != 'no' ]; then
      check 'the database connection belongs to the expected project' ok "proved by $pg_identity"
    else
      check 'the database connection belongs to the expected project' fail \
        "neither PGHOST nor the connected role names $EXPECTED_PROJECT_REF"
    fi
  fi

  # The second, complementary defence. The checks above prove each half is *declared* to belong to
  # the expected project; this one proves the two halves are actually the same system, by asking
  # the Auth Admin API about an account the database also knows and requiring both to agree on its
  # address. Declaration and behaviour can disagree, so both are checked.
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
check 'every allowlisted account exists' "$(ok_if "$missing_survivors")" \
  "$missing_survivors listed account(s) are not in auth.users"

admin_total="$(q 'select count(*) from public.platform_admins')"
admins_outside="$(q "select count(*) from public.platform_admins p
                     where p.user_id <> all(array[$survivor_sql]::uuid[])")"
check 'every platform admin is on the allowlist' "$(ok_if "$admins_outside")" \
  "$admins_outside platform admin(s) would be deleted"

# With no platform admins registered, the check above is satisfied by an empty table rather than by
# anything being protected. Say so: a check that cannot fail is not reassurance.
if [ "$admin_total" -eq 0 ]; then
  note 'platform_admins is empty, so the check above passed vacuously.'
  note 'The allowlisted account is protected by being on the list, not by being an admin.'
  note 'Registering the platform admin is a separate action after this reset.'
fi

if [ "$failures" -gt 0 ]; then
  abort "$failures preflight check(s) failed. Nothing was written."
fi

# --------------------------------------------------------------------------------- phase 1

heading "Phase 1 - inventory, frozen"

# Every population is captured here, before any write, and every later phase deletes by these exact
# ids. Re-querying between the plan and the act is how a row created in between gets destroyed
# without ever appearing in the plan somebody approved.
q "select c.id || E'\t' || c.organization_id || E'\t' || c.name from public.condominiums c order by c.id" \
  > "$WORK/condominiums.tsv"
q "select o.id || E'\t' || o.name from public.organizations o order by o.id" \
  > "$WORK/organizations.tsv"
q "select i.id || E'\t' || coalesce(i.email,'') from public.customer_invitations i order by i.id" \
  > "$WORK/invitations.tsv"
q "select p.id || E'\t' || coalesce(p.full_name,'') from public.profiles p
   where p.id <> all(array[$survivor_sql]::uuid[]) order by p.id" \
  > "$WORK/profiles.tsv"
q "select u.id || E'\t' || coalesce(u.email,'') from auth.users u
   where u.id <> all(array[$survivor_sql]::uuid[]) order by u.id" \
  > "$WORK/deletable-users.tsv"
q "select u.id || E'\t' || coalesce(u.email,'') from auth.users u
   where u.id = any(array[$survivor_sql]::uuid[]) order by u.id" \
  > "$WORK/surviving-users.tsv"

# The tombstones that already exist. Anything beyond this baseline afterwards was produced by this
# run, which is the only way to prove the audit records these deletions rather than older ones.
q "select id from public.condominium_deletion_jobs order by id" > "$WORK/jobs-baseline.tsv"

count_of() { grep -c . "$1" || true; }
condominium_count="$(count_of "$WORK/condominiums.tsv")"
organization_count="$(count_of "$WORK/organizations.tsv")"
invitation_count="$(count_of "$WORK/invitations.tsv")"
profile_count="$(count_of "$WORK/profiles.tsv")"
deletable_users="$(count_of "$WORK/deletable-users.tsv")"
surviving_users="$(count_of "$WORK/surviving-users.tsv")"
jobs_baseline="$(count_of "$WORK/jobs-baseline.tsv")"

# One fingerprint over all six frozen sets, full SHA-256. If any of them differs when executing,
# the plan under review is not the plan being executed, and the run stops before writing anything.
fingerprint="$(cat "$WORK/condominiums.tsv" "$WORK/organizations.tsv" "$WORK/invitations.tsv" \
  "$WORK/profiles.tsv" "$WORK/deletable-users.tsv" "$WORK/surviving-users.tsv" \
  | sha256sum | cut -d' ' -f1)"

# --------------------------------------------------------- structural baseline, captured now

capture_structure() {
  psql -X -qAt -v ON_ERROR_STOP=1 <<'SQL'
select 'migrations'        || E'\t' || count(*) from supabase_migrations.schema_migrations;
select 'migration_ceiling' || E'\t' || coalesce(max(version),'none') from supabase_migrations.schema_migrations;
select 'plans'             || E'\t' || count(*) from public.plans;
select 'plan_digest'       || E'\t' || coalesce(md5(string_agg(code || ':' || catalog_monthly_usd || ':' || default_unit_limit, ',' order by code)), 'none') from public.plans;
select 'capabilities'      || E'\t' || count(*) from public.capabilities;
select 'capability_digest' || E'\t' || coalesce(md5(string_agg(code, ',' order by code)), 'none') from public.capabilities;
select 'plan_capabilities' || E'\t' || count(*) from public.plan_capabilities;
select 'public_tables'     || E'\t' || count(*) from pg_tables where schemaname = 'public';
select 'tables_without_rls'|| E'\t' || count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
select 'critical_functions'|| E'\t' || count(distinct p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('request_condominium_deletion','resolve_entitlements',
    'my_entitlements','is_unit_condominium_purge_authorized','finish_condominium_deletion_storage_cleanup');
select 'triggers'          || E'\t' || count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not t.tgisinternal;
select 'rls_policies'      || E'\t' || count(*) from pg_policies where schemaname = 'public';
SQL
}
capture_structure > "$WORK/structure-before.tsv"

both ''
both "  condominiums          $condominium_count"
both "  organizations         $organization_count"
both "  customer invitations  $invitation_count"
both "  profiles to delete    $profile_count"
both "  auth users            $(q 'select count(*) from auth.users')"
both "    to delete           $deletable_users"
both "    to survive          $surviving_users"
both "  subscriptions         $(q 'select count(*) from public.subscriptions')"
both "  subscription terms    $(q 'select count(*) from public.subscription_terms')"
both "  units                 $(q 'select count(*) from public.units')"
both "  unit owners           $(q 'select count(*) from public.unit_owners')"
both "  receivable items      $(q 'select count(*) from public.receivable_items')"
both "  payments              $(q 'select count(*) from public.payments')"
both "  deletion jobs already $jobs_baseline"

# ------------------------------------------- owner credentials, one per frozen organization

# Production holds condominiums owned by different people, so a single token cannot delete them
# all. Each organization needs its own owner credential, and every one of them is proved usable
# here -- before anything is written -- because discovering a missing token halfway through leaves
# production half reset.
declare -A owner_token=()

if [ "$REHEARSAL" != 'true' ] || [ -n "$OWNER_CREDENTIALS_FILE" ]; then
  if [ -z "$OWNER_CREDENTIALS_FILE" ] || [ ! -f "$OWNER_CREDENTIALS_FILE" ]; then
    abort 'OWNER_CREDENTIALS_FILE must point at a file mapping organization ids to owner tokens.'
  fi

  # The file holds bearer tokens, so no account other than the operator may read it. The property
  # is checked, not the notation: on Windows `chmod 600` cannot clear the group and other bits at
  # all -- it reports 644 no matter what -- so demanding that exact mode would make this script
  # unrunnable on the machine it is meant to be run from, while proving nothing about who can
  # actually read the file. Each platform is asked in its own terms.
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*)
      command -v icacls >/dev/null 2>&1 || abort 'icacls is required to verify the credentials file is private.'
      windows_path="$(cygpath -w "$OWNER_CREDENTIALS_FILE")"
      # Every principal on the ACL, minus the three that are always allowed to be there: the
      # operator, the local SYSTEM account, and the Administrators group.
      outsiders="$(icacls "$windows_path" 2>/dev/null \
        | grep -oE '[^ ]+:\([A-Za-z,()]*\)' \
        | sed 's/:(.*//' \
        | grep -vE "\\\\${USERNAME}\$|^NT AUTHORITY\\\\SYSTEM\$|^BUILTIN\\\\" || true)"
      if [ -n "$outsiders" ]; then
        say ''
        say 'The credentials file can be read by accounts other than yours:'
        printf '  %s\n' $outsiders
        say ''
        say 'Restrict it, then run again:'
        say "  icacls \"$windows_path\" /inheritance:r /grant:r \"%USERNAME%:(R)\""
        abort 'OWNER_CREDENTIALS_FILE is readable by other accounts.'
      fi
      check 'credentials file is private' ok 'no principals beyond you, SYSTEM and Administrators'
      ;;
    *)
      perms="$(stat -c '%a' "$OWNER_CREDENTIALS_FILE" 2>/dev/null || stat -f '%Lp' "$OWNER_CREDENTIALS_FILE" 2>/dev/null || echo '')"
      [ -n "$perms" ] || abort 'Cannot read the mode of OWNER_CREDENTIALS_FILE.'
      # Group and other must have nothing. Stricter than "equals 0600", which would reject 0400.
      if [ $(( 8#$perms & 8#077 )) -ne 0 ]; then
        abort "OWNER_CREDENTIALS_FILE is readable by group or others (mode $perms). Use chmod 600."
      fi
      check 'credentials file is private' ok "mode $perms"
      ;;
  esac

  while IFS=$'\t' read -r cred_org cred_token; do
    case "$cred_org" in ''|'#'*) continue ;; esac
    [ -n "$cred_token" ] || abort "Credential line for $cred_org has no token."
    if [ -n "${owner_token[$cred_org]:-}" ]; then
      abort "Two credentials for organization $cred_org. Which one is meant is not a guess to make."
    fi
    owner_token["$cred_org"]="$cred_token"
  done < "$OWNER_CREDENTIALS_FILE"

  both ''
  both '  Owner credentials, one per organization owning a condominium:'

  # Only organizations that actually own a frozen condominium need a credential.
  while IFS=$'\t' read -r _cid coid _cname; do
    [ -n "$coid" ] || continue
    printf '%s\n' "$coid"
  done < "$WORK/condominiums.tsv" | sort -u > "$WORK/organizations-needing-credentials.tsv"

  # Loaded into an array rather than read from a redirect: commands inside the loop can consume
  # stdin, which silently truncates the iteration and would leave organizations unchecked.
  mapfile -t needing_credentials < "$WORK/organizations-needing-credentials.tsv"
  for need_org in "${needing_credentials[@]}"; do
    [ -n "$need_org" ] || continue
    token="${owner_token[$need_org]:-}"
    if [ -z "$token" ]; then
      check "owner credential available for $need_org" fail 'no credential in the file'
      continue
    fi

    subject="$(jwt_subject "$token")"
    if [ -z "$subject" ]; then
      check "owner credential available for $need_org" fail 'the token carries no subject'
      continue
    fi

    # The decisive check, and the one that catches a token pasted against the wrong organization:
    # the account the token claims to be must actually own this organization. Ownership is read
    # from the database, not from the token.
    owns="$(q "select count(*) from public.organization_memberships
               where organization_id = '$need_org' and user_id = '$subject'
                 and role = 'organization_owner'")"
    if [ "$owns" -ne 1 ]; then
      check "owner credential available for $need_org" fail \
        'the account behind this token is not an organization_owner of it'
      continue
    fi

    if [ "$REHEARSAL" = 'true' ]; then
      check "owner credential available for $need_org" ok 'ownership confirmed, not validated remotely'
    else
      # In production the signature matters, so the token is validated where it can be: an expired
      # or forged token fails here rather than midway through the deletions.
      probe="$(api_call GET "$SUPABASE_URL/auth/v1/user" \
        "Authorization: Bearer $token" "apikey: $SUPABASE_SERVICE_ROLE_KEY" || true)"
      probe_status="$(printf '%s' "$probe" | tail -n1)"
      probe_sub="$(printf '%s' "$probe" | sed '$d' | grep -oE '"id":"[^"]*"' | head -n1 | sed 's/.*:"//; s/"$//' || true)"
      if [ "$probe_status" = '200' ] && [ "$probe_sub" = "$subject" ]; then
        check "owner credential available for $need_org" ok 'valid and owns this organization'
      else
        check "owner credential available for $need_org" fail "the API rejected it (HTTP $probe_status)"
      fi
    fi
  done

  # A credential for an organization nothing in the plan needs is a sign the file describes a
  # different run. Say so rather than ignoring it.
  for cred_org in "${!owner_token[@]}"; do
    if ! grep -qx "$cred_org" "$WORK/organizations-needing-credentials.tsv"; then
      check "credential for $cred_org matches the plan" fail 'no frozen condominium belongs to it'
    fi
  done

  if [ "$failures" -gt 0 ]; then
    abort "$failures credential check(s) failed. Nothing was written."
  fi
fi

heading "Phase 1 - the frozen plan"

both ''
both '  Condominiums, through the API deletion flow:'
while IFS=$'\t' read -r cid coid cname; do
  [ -n "$cid" ] && both "    $cid  $cname"
done < "$WORK/condominiums.tsv"

both ''
both '  Organizations:'
while IFS=$'\t' read -r oid oname; do
  [ -n "$oid" ] && both "    $oid  $oname"
done < "$WORK/organizations.tsv"

both ''
both '  Customer invitations:'
while IFS=$'\t' read -r iid iemail; do
  [ -n "$iid" ] && both "    $iid  ${iemail:-(no email)}"
done < "$WORK/invitations.tsv"

both ''
both '  Profiles:'
while IFS=$'\t' read -r pid pname; do
  [ -n "$pid" ] && both "    $pid  ${pname:-(no name)}"
done < "$WORK/profiles.tsv"

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
fi

# The drift gate applies in every mode that is about to write. Skipping it during rehearsal would
# leave the one guard nobody had ever seen fire, which is the same as not having it.
if [ -n "$EXPECTED_INVENTORY_FINGERPRINT" ]; then
  if [ "$EXPECTED_INVENTORY_FINGERPRINT" != "$fingerprint" ]; then
    abort "The inventory changed since the dry run. Reviewed $EXPECTED_INVENTORY_FINGERPRINT, found $fingerprint. Nothing was written."
  fi
  check 'inventory unchanged since the reviewed dry run' ok "${fingerprint:0:16}..."
fi

# --------------------------------------------------------------------------------- phase 2

heading "Phase 2 - deleting tenants through the official flow"

both ''
both '  Each condominium goes through POST /v1/condominiums/:id/danger-zone/delete, the path the'
both '  product itself uses. The append-only triggers stay enabled, a deletion job is recorded, and'
both '  the worker removes exactly the R2 keys the purge reports. No table is emptied by hand.'

deleted_tenants=0
deleted_objects=0

# Loaded into arrays rather than read through a redirect: a command inside these loops can consume
# stdin and silently truncate the iteration. A loop that quietly does nothing is the worst failure
# available to a script whose whole job is to act on exactly the reviewed set.
mapfile -t frozen_condominiums < "$WORK/condominiums.tsv"
for frozen_row in "${frozen_condominiums[@]}"; do
  IFS=$'	' read -r condo_id condo_org condo_name <<< "$frozen_row"
  [ -n "$condo_id" ] || continue
  both ''
  both "  deleting $condo_name ($condo_id)"

  if [ "$REHEARSAL_EXECUTE" = 'true' ]; then
    # Same RPC, same authorization, different transport. The rehearsal cannot reach the worker, so
    # it calls request_condominium_deletion as the organization owner the RPC requires. It does not
    # weaken or skip that check, and R2 is untouched because there is no R2 here.
    owner_id="$(q "select om.user_id from public.condominiums c
                   join public.organization_memberships om on om.organization_id = c.organization_id
                   where c.id = '$condo_id' and om.role = 'organization_owner' limit 1")"
    if [ -z "$owner_id" ]; then
      abort "No organization owner for $condo_id. In production the API would refuse this too."
    fi
    objects="$(psql -X -qAt -v ON_ERROR_STOP=1 <<SQL | tail -n1
select set_config('request.jwt.claims',
  json_build_object('sub','$owner_id','role','authenticated')::text, false);
set role authenticated;
select storage_object_count from public.request_condominium_deletion(
  '$condo_id', 'ELIMINAR ' || (select name from public.condominiums where id = '$condo_id'));
SQL
)"
    both "    deleted (rehearsal), manifest reported ${objects:-0} object(s)"
  else
    # The body is built by the database, so a condominium named with a quote or a backslash is
    # escaped by something that knows JSON rather than by string concatenation here.
    q "select json_build_object('confirmation', 'ELIMINAR ' || c.name)::text
       from public.condominiums c where c.id = '$condo_id'" > "$WORK/body.json"
    chmod 600 "$WORK/body.json"

    # The credential for this condominium's own organization, taken from the frozen row. Falling
    # back to another organization's token would be asking the API to enforce what this script was
    # supposed to have established.
    condo_token="${owner_token[$condo_org]:-}"
    if [ -z "$condo_token" ]; then
      abort "No owner credential for organization $condo_org. Stopping with the remaining tenants untouched."
    fi

    response="$(api_call POST "$HABITTA_API_BASE_URL/v1/condominiums/$condo_id/danger-zone/delete" \
      "Authorization: Bearer $condo_token" \
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
done

remaining="$(q 'select count(*) from public.condominiums')"
if [ "$remaining" -ne 0 ]; then
  abort "$remaining condominium(s) remain. Not proceeding to organizations."
fi

# --------------------------------------------------------------------------------- phase 3

heading "Phase 3 - what the tenant purge does not reach"

# Deleted strictly by the ids frozen in phase 1. No unfiltered DELETE, and nothing recalculated at
# the moment of destruction. Ordinary statements in dependency order: no TRUNCATE, no DROP, no
# improvised CASCADE, no session_replication_role, no disabled triggers, no disabled RLS. If a
# foreign key objects, that is information, and the right response is to stop and read it.
invitations_sql="$(id_array "$WORK/invitations.tsv")"
organizations_sql="$(id_array "$WORK/organizations.tsv")"
profiles_sql="$(id_array "$WORK/profiles.tsv")"

both ''
both "  customer invitations  $(q "with gone as (delete from public.customer_invitations where id = any($invitations_sql) returning 1) select count(*) from gone") of $invitation_count frozen"
both "  organizations         $(q "with gone as (delete from public.organizations where id = any($organizations_sql) returning 1) select count(*) from gone") of $organization_count frozen"
both "  profiles              $(q "with gone as (delete from public.profiles where id = any($profiles_sql) returning 1) select count(*) from gone") of $profile_count frozen"

# --------------------------------------------------------------------------------- phase 4

heading "Phase 4 - Auth accounts"

both ''
both '  Through the Admin API, never SQL. The auth schema carries identities, sessions and refresh'
both '  tokens that Auth retires alongside the user; a direct DELETE leaves its bookkeeping'
both '  inconsistent in ways that surface later as login failures.'
both ''
both '  Acting on the list frozen in phase 1, not on a fresh query.'

deleted_users=0
mapfile -t frozen_users < "$WORK/deletable-users.tsv"
for frozen_row in "${frozen_users[@]}"; do
  IFS=$'	' read -r user_id user_email <<< "$frozen_row"
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
done

# --------------------------------------------------------------------------------- phase 5

heading "Phase 5 - verification"

failures=0

verify_zero() {
  local label="$1" value
  value="$(q "$2")"
  check "$label is empty" "$(ok_if "$value")" "$value row(s) remain"
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
verify_zero 'frozen profiles'       "select count(*) from public.profiles where id = any($profiles_sql)"

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

# ------------------------------------------------ the tombstones this run produced

both ''
both '  Deletion audit, for these tenants and this run:'

baseline_sql="$(id_array "$WORK/jobs-baseline.tsv")"
new_jobs="$(q "select count(*) from public.condominium_deletion_jobs where id <> all($baseline_sql)")"
check 'one new tombstone per deleted tenant' \
  "$( [ "$new_jobs" -eq "$deleted_tenants" ] && echo ok || echo fail )" \
  "$new_jobs new, $deleted_tenants deleted"

for frozen_row in "${frozen_condominiums[@]}"; do
  IFS=$'	' read -r condo_id condo_org condo_name <<< "$frozen_row"
  [ -n "$condo_id" ] || continue
  # Matched on the frozen condominium id, restricted to jobs this run created, and required to
  # still name the organization -- which is the property the migration in this branch protects.
  matching="$(q "select count(*) from public.condominium_deletion_jobs j
                 where j.condominium_id = '$condo_id'
                   and j.organization_id = '$condo_org'
                   and j.id <> all($baseline_sql)")"
  check "tombstone for $condo_name" "$( [ "$matching" -eq 1 ] && echo ok || echo fail )" \
    "$matching matching job(s)"
done

incomplete="$(q "select count(*) from public.condominium_deletion_jobs
                 where id <> all($baseline_sql) and storage_cleanup_status <> 'completed'")"
if [ "$REHEARSAL_EXECUTE" = 'true' ]; then
  note "file cleanup incomplete on $incomplete new job(s) - expected, the rehearsal has no worker"
else
  check "every new tombstone reports completed file cleanup" "$(ok_if "$incomplete")" "$incomplete pending"
fi

# ------------------------------------------------ structure, before against after

both ''
both '  Structure must be unchanged, compared against the baseline taken before any write:'

capture_structure > "$WORK/structure-after.tsv"
while IFS=$'\t' read -r key before; do
  after="$(awk -F'\t' -v k="$key" '$1 == k { print $2 }' "$WORK/structure-after.tsv")"
  if [ "$before" = "$after" ]; then
    check "$key unchanged" ok "$after"
  else
    check "$key unchanged" fail "before $before, after $after"
  fi
done < "$WORK/structure-before.tsv"

# The absolute numbers as well, so a baseline that was already wrong cannot pass by being stable.
for pair in 'plans:5' 'capabilities:22'; do
  table="${pair%%:*}"; want="${pair##*:}"; got="$(q "select count(*) from public.$table")"
  check "$table matches the expected catalogue" \
    "$( [ "$got" -eq "$want" ] && echo ok || echo fail )" "expected $want, got $got"
done

auth_left="$(q 'select count(*) from auth.users')"
if [ "$REHEARSAL_EXECUTE" = 'true' ]; then
  note "auth accounts left $auth_left (rehearsal deletes none)"
else
  check 'exactly the allowlisted accounts remain' \
    "$( [ "$auth_left" -eq "$survivor_count" ] && echo ok || echo fail )" \
    "expected $survivor_count, found $auth_left"
fi

# --------------------------------------------------------------------------------- report

heading "Result"

both ''
both "  tenants deleted       $deleted_tenants"
both "  R2 objects deleted    $deleted_objects"
both "  auth accounts deleted $deleted_users"
both "  auth accounts kept    $survivor_count"
both "  new deletion jobs     $new_jobs"
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
