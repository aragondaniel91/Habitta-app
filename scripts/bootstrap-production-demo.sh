#!/usr/bin/env bash
# HAB-416 - one synthetic, nonbillable Production demo tenant.
#
# Safe by default: APPLY=false performs preflight only. The apply path creates Auth through the
# Supabase Admin API, creates tenant/domain data through Habitta's supported API/RPC paths, and uses
# trusted SQL only for the platform-owned account_type classification and read-only verification.
# It never inserts directly into auth.users or tenant business tables.

set -euo pipefail

readonly REQUIRED_CONFIRMATION='BOOTSTRAP-HABITTA-PRODUCTION-DEMO'
readonly PRODUCTION_PROJECT_REF='kgsfaahixbcwcmykmhat'
readonly HAB414_MIGRATION='20260830000200'
readonly HAB416_MIGRATION='20260831000000'
readonly DEMO_EMAIL='hab416.demo.owner@habitta.invalid'
readonly DEMO_ORG_NAME='Conjunto Residencial Avila Esmeralda Demo'
readonly DEMO_CONDO_NAME='Residencias Avila Esmeralda'
readonly BUILDING_A='Torre Avila'
readonly BUILDING_B='Torre Esmeralda'

APPLY="${APPLY:-false}"
CONFIRM="${CONFIRM:-}"
REHEARSAL="${REHEARSAL:-false}"
EXPECTED_PROJECT_REF="${EXPECTED_PROJECT_REF:-}"
EXPECTED_DEPLOYED_SHA="${EXPECTED_DEPLOYED_SHA:-}"
HABITTA_API_BASE_URL="${HABITTA_API_BASE_URL:-}"
SUPABASE_URL="${SUPABASE_URL:-}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
DEMO_CREDENTIALS_FILE="${DEMO_CREDENTIALS_FILE:-}"

WORK="$(mktemp -d)"
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT
umask 077

say() { printf '%s\n' "$*"; }
abort() { say "ABORT: $*" >&2; exit 1; }
require_cmd() { command -v "$1" >/dev/null 2>&1 || abort "required command not found: $1"; }
q() { psql -X -qAt -v ON_ERROR_STOP=1 -c "$1"; }

# curl receives credentials through stdin config, not argv. Response bodies live only in the 0700
# temporary directory and are never printed; this matters because Auth responses contain JWTs.
http_json() {
  local method="$1" url="$2" apikey="$3" bearer="$4" body_file="$5" output_file="$6"
  {
    printf 'request = "%s"\n' "$method"
    printf 'url = "%s"\n' "$url"
    [ -n "$apikey" ] && printf 'header = "apikey: %s"\n' "$apikey"
    [ -n "$bearer" ] && printf 'header = "Authorization: Bearer %s"\n' "$bearer"
    printf 'header = "Content-Type: application/json"\n'
    [ -n "$body_file" ] && printf 'data = "@%s"\n' "$body_file"
    printf 'output = "%s"\n' "$output_file"
    printf 'silent\nshow-error\nwrite-out = "%%{http_code}"\n'
  } | curl -K -
}

expect_http() {
  local label="$1" status="$2" expected="$3"
  [ "$status" = "$expected" ] || abort "$label failed with HTTP $status (response intentionally not printed)"
}

worker_call() {
  local method="$1" path="$2" token="$3" body_file="$4" output_file="$5"
  http_json "$method" "${HABITTA_API_BASE_URL%/}$path" '' "$token" "$body_file" "$output_file"
}

require_cmd psql
require_cmd curl
require_cmd jq
require_cmd openssl
require_cmd stat

[ -n "$HABITTA_API_BASE_URL" ] || abort 'HABITTA_API_BASE_URL is required'
[ -n "$SUPABASE_URL" ] || abort 'SUPABASE_URL is required'
[ -n "$EXPECTED_PROJECT_REF" ] || abort 'EXPECTED_PROJECT_REF is required'

if [ "$REHEARSAL" != 'true' ] && [ "$EXPECTED_PROJECT_REF" != "$PRODUCTION_PROJECT_REF" ]; then
  abort "production bootstrap requires EXPECTED_PROJECT_REF=$PRODUCTION_PROJECT_REF"
fi
if [ "$APPLY" = 'true' ]; then
  [ "$CONFIRM" = "$REQUIRED_CONFIRMATION" ] || abort "APPLY=true requires CONFIRM=$REQUIRED_CONFIRMATION"
  [ -n "$SUPABASE_ANON_KEY" ] || abort 'SUPABASE_ANON_KEY is required to apply'
  [ -n "$SUPABASE_SERVICE_ROLE_KEY" ] || abort 'SUPABASE_SERVICE_ROLE_KEY is required to apply'
  [ -n "$DEMO_CREDENTIALS_FILE" ] || abort 'DEMO_CREDENTIALS_FILE is required to apply'
fi

say '=== HAB-416 demo bootstrap preflight ==='

# Both migrations must exist before any fixture write. HAB-416 is checked too so the demo cannot be
# created in the gap between classification support and the nonbillable DB invariant.
[ "$(q "select count(*) from supabase_migrations.schema_migrations where version = '$HAB414_MIGRATION';")" = '1' ] \
  || abort 'HAB-414 migration is not applied'
[ "$(q "select count(*) from supabase_migrations.schema_migrations where version = '$HAB416_MIGRATION';")" = '1' ] \
  || abort 'HAB-416 nonbillable migration is not applied'

# Confirm that the Supabase URL names the project the operator intended. Local/dev rehearsal may use
# another ref, but it still has to match EXPECTED_PROJECT_REF explicitly.
case "$SUPABASE_URL" in
  *"//$EXPECTED_PROJECT_REF.supabase.co"*) ;;
  http://127.0.0.1:*|http://localhost:*)
    [ "$REHEARSAL" = 'true' ] || abort 'local Supabase is allowed only with REHEARSAL=true'
    ;;
  *) abort 'SUPABASE_URL does not match EXPECTED_PROJECT_REF' ;;
esac

if [ -n "$EXPECTED_DEPLOYED_SHA" ]; then
  health="$WORK/health.json"
  status="$(http_json GET "${HABITTA_API_BASE_URL%/}/health" '' '' '' "$health")"
  expect_http 'Worker health check' "$status" '200'
  [ "$(jq -r '.commit // empty' "$health")" = "$EXPECTED_DEPLOYED_SHA" ] \
    || abort 'Worker commit does not match EXPECTED_DEPLOYED_SHA'
fi

platform_admin_before="$(q 'select user_id from public.platform_admins order by created_at limit 1;')"
platform_admin_count="$(q 'select count(*) from public.platform_admins;')"
[ "$platform_admin_count" = '1' ] || abort 'expected exactly one platform_admin before bootstrap'
[ -n "$platform_admin_before" ] || abort 'platform_admin survivor is missing'

if [ "$REHEARSAL" != 'true' ]; then
  [ "$(q "select count(*) from public.organizations where account_type = 'customer';")" = '0' ] \
    || abort 'Production must still have zero customer organizations before HAB-416 bootstrap'
fi

existing_demo_count="$(q "select count(*) from public.organizations where account_type = 'demo';")"
[ "$existing_demo_count" -le 1 ] || abort 'more than one demo organization exists'

# A non-customer subscription is a hard contradiction. This is also protected by the migration,
# but checking it here turns a future schema regression into an early, readable abort.
[ "$(q "select count(*) from public.subscriptions s join public.condominiums c on c.id=s.condominium_id join public.organizations o on o.id=c.organization_id where o.account_type <> 'customer';")" = '0' ] \
  || abort 'a demo/internal organization already has commercial subscription state'

existing_auth_count="$(q "select count(*) from auth.users where email = '$DEMO_EMAIL';")"
[ "$existing_auth_count" -le 1 ] || abort 'more than one synthetic demo Auth user exists'

if [ "$existing_demo_count" = '1' ]; then
  expected_demo_count="$(q "select count(*) from public.organizations o join auth.users u on u.id=o.created_by where o.account_type='demo' and o.name='$DEMO_ORG_NAME' and u.email='$DEMO_EMAIL';")"
  [ "$expected_demo_count" = '1' ] || abort 'the existing demo organization is not the HAB-416 fixture'
fi

say "  migrations: ok"
say "  platform admin survivor: ok"
say "  commercial boundary: ok"
say "  existing demo organizations: $existing_demo_count"
say "  existing synthetic Auth users: $existing_auth_count"

if [ "$APPLY" != 'true' ]; then
  say 'PLAN ONLY: no writes performed. Re-run with APPLY=true and the explicit confirmation after review.'
  exit 0
fi

# If the Auth user already exists, the local credential file must survive from the original run. We
# never reset its password implicitly because that would silently rotate a credential the operator
# may already be using for UX validation.
if [ "$existing_auth_count" = '1' ]; then
  [ -f "$DEMO_CREDENTIALS_FILE" ] || abort 'demo Auth user exists but DEMO_CREDENTIALS_FILE is unavailable; do not reset it implicitly'
else
  if [ ! -f "$DEMO_CREDENTIALS_FILE" ]; then
    password="$(openssl rand -base64 36 | tr -d '\n')"
    printf '{"email":"%s","password":"%s"}\n' "$DEMO_EMAIL" "$password" > "$DEMO_CREDENTIALS_FILE"
    unset password
    chmod 600 "$DEMO_CREDENTIALS_FILE"
  fi
fi

mode="$(stat -c '%a' "$DEMO_CREDENTIALS_FILE")"
[ "$mode" = '600' ] || abort 'DEMO_CREDENTIALS_FILE must have mode 600'
[ "$(jq -r '.email // empty' "$DEMO_CREDENTIALS_FILE")" = "$DEMO_EMAIL" ] \
  || abort 'credential file email does not match the fixed HAB-416 synthetic identity'
[ "$(jq -r '.password // empty | length >= 16' "$DEMO_CREDENTIALS_FILE")" = 'true' ] \
  || abort 'credential file password is missing or too short'

if [ "$existing_auth_count" = '0' ]; then
  jq '{email, password, email_confirm:true, user_metadata:{fixture:"HAB-416", synthetic:true}}' \
    "$DEMO_CREDENTIALS_FILE" > "$WORK/auth-create.json"
  auth_create="$WORK/auth-create-response.json"
  status="$(http_json POST "${SUPABASE_URL%/}/auth/v1/admin/users" "$SUPABASE_SERVICE_ROLE_KEY" "$SUPABASE_SERVICE_ROLE_KEY" "$WORK/auth-create.json" "$auth_create")"
  expect_http 'Supabase Admin createUser' "$status" '200'
  [ -n "$(jq -r '.id // empty' "$auth_create")" ] || abort 'Admin API did not return a user id'
fi

# Password sign-in proves this is a real dedicated tenant identity. JWT stays only in memory/temp.
jq '{email, password}' "$DEMO_CREDENTIALS_FILE" > "$WORK/sign-in.json"
signin="$WORK/sign-in-response.json"
status="$(http_json POST "${SUPABASE_URL%/}/auth/v1/token?grant_type=password" "$SUPABASE_ANON_KEY" '' "$WORK/sign-in.json" "$signin")"
expect_http 'demo owner sign-in' "$status" '200'
owner_token="$(jq -r '.access_token // empty' "$signin")"
[ -n "$owner_token" ] || abort 'sign-in response did not contain an access token'

# Recover cleanly from an interrupted run after onboarding but before classification. The only
# customer organization we will adopt is the exact deterministic name created by the demo Auth user.
interrupted_customer_count="$(q "select count(*) from public.organizations o join auth.users u on u.id=o.created_by where o.account_type='customer' and o.name='$DEMO_ORG_NAME' and u.email='$DEMO_EMAIL';")"
[ "$interrupted_customer_count" -le 1 ] || abort 'duplicate interrupted HAB-416 organizations detected'

orgs="$WORK/organizations.json"
status="$(worker_call GET '/v1/organizations' "$owner_token" '' "$orgs")"
expect_http 'list demo owner organizations' "$status" '200'
org_id="$(jq -r --arg n "$DEMO_ORG_NAME" '[.[] | select(.name==$n)] | if length==1 then .[0].id else empty end' "$orgs")"

if [ -z "$org_id" ]; then
  [ "$interrupted_customer_count" = '0' ] || abort 'database shows interrupted organization but tenant API cannot see it'
  jq -n --arg name "$DEMO_ORG_NAME" --arg condominiumName "$DEMO_CONDO_NAME" \
    '{name:$name, condominiumName:$condominiumName}' > "$WORK/onboard.json"
  onboard="$WORK/onboard-response.json"
  status="$(worker_call POST '/v1/organizations' "$owner_token" "$WORK/onboard.json" "$onboard")"
  expect_http 'create_organization_with_condominium onboarding' "$status" '201'

  status="$(worker_call GET '/v1/organizations' "$owner_token" '' "$orgs")"
  expect_http 'reload demo owner organizations' "$status" '200'
  org_id="$(jq -r --arg n "$DEMO_ORG_NAME" '[.[] | select(.name==$n)] | if length==1 then .[0].id else empty end' "$orgs")"
  [ -n "$org_id" ] || abort 'supported onboarding did not create the expected organization'
fi

# Platform-owned classification is the only tenant-table write done through trusted SQL. We select
# the row by deterministic owner+name, not by interpolating a UUID or accepting operator input.
q "update public.organizations o set account_type='demo' from auth.users u where u.id=o.created_by and u.email='$DEMO_EMAIL' and o.name='$DEMO_ORG_NAME' and o.account_type='customer';" >/dev/null
[ "$(q "select count(*) from public.organizations o join auth.users u on u.id=o.created_by where o.account_type='demo' and o.name='$DEMO_ORG_NAME' and u.email='$DEMO_EMAIL';")" = '1' ] \
  || abort 'trusted demo classification did not converge to exactly one organization'

condos="$WORK/condominiums.json"
status="$(worker_call GET '/v1/condominiums' "$owner_token" '' "$condos")"
expect_http 'list demo condominiums' "$status" '200'
condo_id="$(jq -r --arg n "$DEMO_CONDO_NAME" '[.[] | select(.name==$n)] | if length==1 then .[0].id else empty end' "$condos")"
[ -n "$condo_id" ] || abort 'expected demo condominium was not returned to its owner'
[ "$(jq 'length' "$condos")" = '1' ] || abort 'demo owner can see an unexpected number of condominiums'

ensure_building() {
  local name="$1" buildings="$WORK/buildings.json" body="$WORK/building-body.json" response="$WORK/building-response.json" id
  status="$(worker_call GET "/v1/condominiums/$condo_id/buildings" "$owner_token" '' "$buildings")"
  expect_http 'list buildings' "$status" '200'
  id="$(jq -r --arg n "$name" '[.[] | select(.name==$n)] | if length==1 then .[0].id else empty end' "$buildings")"
  if [ -z "$id" ]; then
    jq -n --arg name "$name" '{name:$name}' > "$body"
    status="$(worker_call POST "/v1/condominiums/$condo_id/buildings" "$owner_token" "$body" "$response")"
    expect_http 'create building' "$status" '201'
    id="$(jq -r 'if type=="array" then .[0].id else .id end // empty' "$response")"
  fi
  [ -n "$id" ] || abort 'building creation did not return an id'
  printf '%s' "$id"
}

building_a_id="$(ensure_building "$BUILDING_A")"
building_b_id="$(ensure_building "$BUILDING_B")"

ensure_unit() {
  local code="$1" building_id="$2" floor="$3" units="$WORK/units.json" body="$WORK/unit-body.json" response="$WORK/unit-response.json"
  status="$(worker_call GET "/v1/condominiums/$condo_id/units" "$owner_token" '' "$units")"
  expect_http 'list units' "$status" '200'
  if [ "$(jq --arg code "$code" '[.[] | select(.code==$code)] | length' "$units")" = '0' ]; then
    jq -n --arg buildingId "$building_id" --arg code "$code" --arg floor "$floor" \
      '{buildingId:$buildingId, code:$code, type:"apartment", floor:$floor, status:"active"}' > "$body"
    status="$(worker_call POST "/v1/condominiums/$condo_id/units" "$owner_token" "$body" "$response")"
    expect_http 'create unit' "$status" '201'
  fi
}

ensure_unit 'A-01' "$building_a_id" '1'
ensure_unit 'A-02' "$building_a_id" '1'
ensure_unit 'A-11' "$building_a_id" '2'
ensure_unit 'A-12' "$building_a_id" '2'
ensure_unit 'A-21' "$building_a_id" '3'
ensure_unit 'B-01' "$building_b_id" '1'
ensure_unit 'B-02' "$building_b_id" '1'
ensure_unit 'B-11' "$building_b_id" '2'
ensure_unit 'B-12' "$building_b_id" '2'
ensure_unit 'B-21' "$building_b_id" '3'

ensure_person() {
  local first="$1" last="$2" people="$WORK/people.json" body="$WORK/person-body.json" response="$WORK/person-response.json" id
  status="$(worker_call GET "/v1/condominiums/$condo_id/people" "$owner_token" '' "$people")"
  expect_http 'list people' "$status" '200'
  id="$(jq -r --arg f "$first" --arg l "$last" '[.[] | select(.first_name==$f and .last_name==$l)] | if length==1 then .[0].id else empty end' "$people")"
  if [ -z "$id" ]; then
    jq -n --arg firstName "$first" --arg lastName "$last" '{firstName:$firstName,lastName:$lastName,status:"active"}' > "$body"
    status="$(worker_call POST "/v1/condominiums/$condo_id/people" "$owner_token" "$body" "$response")"
    expect_http 'create synthetic person' "$status" '201'
    id="$(jq -r 'if type=="array" then .[0].id else .id end // empty' "$response")"
  fi
  [ -n "$id" ] || abort 'person creation did not return an id'
  printf '%s' "$id"
}

valentina_id="$(ensure_person 'Valentina' 'Rojas')"
diego_id="$(ensure_person 'Diego' 'Salcedo')"
mariana_id="$(ensure_person 'Mariana' 'Suarez')"
lucia_id="$(ensure_person 'Lucia' 'Salcedo')"
ana_id="$(ensure_person 'Ana' 'Paredes')"
tomas_id="$(ensure_person 'Tomas' 'Leon')"

# Refresh units once and retain ids only in memory.
units="$WORK/units-final.json"
status="$(worker_call GET "/v1/condominiums/$condo_id/units" "$owner_token" '' "$units")"
expect_http 'reload units' "$status" '200'
unit_id() { jq -r --arg code "$1" '[.[] | select(.code==$code)] | if length==1 then .[0].id else empty end' "$units"; }
a01="$(unit_id 'A-01')"; a02="$(unit_id 'A-02')"; b01="$(unit_id 'B-01')"
[ -n "$a01" ] && [ -n "$a02" ] && [ -n "$b01" ] || abort 'fixture unit lookup failed'

ensure_owner() {
  local unit="$1" person="$2" primary="$3" list="$WORK/owners.json" body="$WORK/owner-body.json" response="$WORK/owner-response.json"
  status="$(worker_call GET "/v1/condominiums/$condo_id/units/$unit/owners" "$owner_token" '' "$list")"
  expect_http 'list unit owners' "$status" '200'
  if [ "$(jq --arg p "$person" '[.[] | select(.person_id==$p and .ends_at==null)] | length' "$list")" = '0' ]; then
    jq -n --arg personId "$person" --argjson primary "$primary" '{personId:$personId,ownershipPercentage:100,isPrimaryContact:$primary}' > "$body"
    status="$(worker_call POST "/v1/condominiums/$condo_id/units/$unit/owners" "$owner_token" "$body" "$response")"
    expect_http 'create unit owner' "$status" '201'
  fi
}

ensure_occupancy() {
  local unit="$1" person="$2" type="$3" primary="$4" list="$WORK/occupancies.json" body="$WORK/occupancy-body.json" response="$WORK/occupancy-response.json"
  status="$(worker_call GET "/v1/condominiums/$condo_id/units/$unit/occupancies" "$owner_token" '' "$list")"
  expect_http 'list unit occupancies' "$status" '200'
  if [ "$(jq --arg p "$person" --arg t "$type" '[.[] | select(.person_id==$p and .occupancy_type==$t and .ends_at==null)] | length' "$list")" = '0' ]; then
    jq -n --arg personId "$person" --arg occupancyType "$type" --argjson primary "$primary" \
      '{personId:$personId,occupancyType:$occupancyType,isPrimaryContact:$primary}' > "$body"
    status="$(worker_call POST "/v1/condominiums/$condo_id/units/$unit/occupancies" "$owner_token" "$body" "$response")"
    expect_http 'create occupancy' "$status" '201'
  fi
}

ensure_owner "$a01" "$valentina_id" true
ensure_occupancy "$a01" "$valentina_id" 'owner_occupant' true
ensure_owner "$a02" "$diego_id" true
ensure_occupancy "$a02" "$mariana_id" 'tenant' true
ensure_occupancy "$a02" "$lucia_id" 'family_member' false
ensure_owner "$b01" "$ana_id" true
ensure_occupancy "$b01" "$tomas_id" 'authorized_occupant' true

say '=== HAB-416 post-bootstrap verification ==='

# Database/commercial invariants. Only aggregate verdicts are printed; no UUID, email, token, or
# credential content is emitted.
[ "$(q "select count(*) from public.organizations where account_type='demo';")" = '1' ] || abort 'demo organization count is not exactly one'
[ "$(q "select count(*) from public.organizations where account_type='customer';")" = '0' ] || { [ "$REHEARSAL" = 'true' ] || abort 'Production customer organization count changed from zero'; }
[ "$(q "select count(*) from public.condominiums c join public.organizations o on o.id=c.organization_id where o.account_type='demo';")" = '1' ] || abort 'demo condominium count is not exactly one'
[ "$(q "select count(*) from public.subscriptions s join public.condominiums c on c.id=s.condominium_id join public.organizations o on o.id=c.organization_id where o.account_type='demo';")" = '0' ] || abort 'demo acquired a subscription'
[ "$(q "select count(*) from public.subscription_terms t join public.subscriptions s on s.id=t.subscription_id join public.condominiums c on c.id=s.condominium_id join public.organizations o on o.id=c.organization_id where o.account_type='demo';")" = '0' ] || abort 'demo acquired commercial terms'
[ "$(q "select count(*) from public.subscriptions s join public.condominiums c on c.id=s.condominium_id join public.organizations o on o.id=c.organization_id where o.account_type='demo' and s.commercial_status='confirmed';")" = '0' ] || abort 'demo has confirmed commercial status'
[ "$(q "select count(*) from public.platform_admins pa join auth.users u on u.id=pa.user_id where u.email='$DEMO_EMAIL';")" = '0' ] || abort 'demo owner was granted platform_admin'
[ "$(q 'select count(*) from public.platform_admins;')" = '1' ] || abort 'platform_admin count changed'
[ "$(q 'select count(*) from public.platform_admins pa join auth.users u on u.id=pa.user_id;')" = '1' ] || abort 'platform_admin survivor no longer maps to Auth'
platform_admin_after="$(q 'select user_id from public.platform_admins order by created_at limit 1;')"
[ "$platform_admin_after" = "$platform_admin_before" ] || abort 'platform_admin survivor changed'
[ "$(q 'select count(*) from public.payments;')" = '0' ] || { [ "$REHEARSAL" = 'true' ] || abort 'Production payments count is no longer zero'; }

# RLS/API-side view: the demo owner must see only its one organization and condominium, and the
# fixture cardinalities are deliberately small and deterministic.
status="$(worker_call GET '/v1/organizations' "$owner_token" '' "$orgs")"; expect_http 'RLS organization verification' "$status" '200'
[ "$(jq 'length' "$orgs")" = '1' ] || abort 'demo owner does not see exactly one organization'
[ "$(jq -r '.[0].account_type // empty' "$orgs")" = 'demo' ] || abort 'demo owner organization is not classified demo'
status="$(worker_call GET '/v1/condominiums' "$owner_token" '' "$condos")"; expect_http 'RLS condominium verification' "$status" '200'
[ "$(jq 'length' "$condos")" = '1' ] || abort 'demo owner does not see exactly one condominium'
status="$(worker_call GET "/v1/condominiums/$condo_id/buildings" "$owner_token" '' "$WORK/buildings-final.json")"; expect_http 'building verification' "$status" '200'
[ "$(jq 'length' "$WORK/buildings-final.json")" = '2' ] || abort 'fixture must contain exactly two buildings'
status="$(worker_call GET "/v1/condominiums/$condo_id/units" "$owner_token" '' "$WORK/units-verify.json")"; expect_http 'unit verification' "$status" '200'
[ "$(jq 'length' "$WORK/units-verify.json")" = '10' ] || abort 'fixture must contain exactly ten units'
status="$(worker_call GET "/v1/condominiums/$condo_id/people" "$owner_token" '' "$WORK/people-verify.json")"; expect_http 'people verification' "$status" '200'
[ "$(jq 'length' "$WORK/people-verify.json")" = '6' ] || abort 'fixture must contain exactly six synthetic people'

unset owner_token
say '  demo organization/condominium cardinality: ok'
say '  dedicated demo owner separation: ok'
say '  platform admin survivor: ok'
say '  customer count / subscriptions / commercial terms: ok'
say '  zero Production payments: ok'
say '  RLS owner scope: ok'
say '  fixture: 2 buildings, 10 units, 6 people with owner/tenant/family/authorized occupancy coverage'
say "COMPLETE: HAB-416 synthetic demo converged successfully. Credentials remain only in the mode-600 file: $DEMO_CREDENTIALS_FILE"
