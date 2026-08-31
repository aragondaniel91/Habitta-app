#!/usr/bin/env bash
# HAB-423 - add dedicated synthetic owner and tenant Auth identities to the existing HAB-416
# Production demo through the real HAB-125 invitation/acceptance authorization path.
#
# Safe by default: APPLY=false performs preflight only. The apply path:
# - keeps the existing HAB-416 condo-admin credential unchanged,
# - sets only fixed .invalid emails on the two existing synthetic people through Habitta's API,
# - creates Auth users only through Supabase Auth Admin API,
# - creates/accepts resident invitations through the HAB-125 RPCs,
# - performs no subscription/payment/receivable writes and no outbound email delivery.
#
# The direct create_resident_invitation RPC is intentional for this synthetic fixture: the normal
# Worker route wraps the same RPC with transactional email delivery. Calling the authorization RPC
# directly avoids consuming email provider credits for .invalid demo identities while preserving the
# exact database checks and membership creation semantics used by the product.

set -euo pipefail

readonly REQUIRED_CONFIRMATION='BOOTSTRAP-HABITTA-PRODUCTION-DEMO-RESIDENTS'
readonly PRODUCTION_PROJECT_REF='kgsfaahixbcwcmykmhat'
readonly DEMO_ORG_NAME='Conjunto Residencial Avila Esmeralda Demo'
readonly DEMO_CONDO_NAME='Residencias Avila Esmeralda'
readonly CONDO_ADMIN_EMAIL='hab416.demo.owner@habitta.invalid'
readonly OWNER_EMAIL='hab423.demo.resident.owner@habitta.invalid'
readonly TENANT_EMAIL='hab423.demo.resident.tenant@habitta.invalid'
readonly OWNER_FIRST='Valentina'
readonly OWNER_LAST='Rojas'
readonly OWNER_UNIT='A-01'
readonly TENANT_FIRST='Mariana'
readonly TENANT_LAST='Suarez'
readonly TENANT_UNIT='A-02'

APPLY="${APPLY:-false}"
CONFIRM="${CONFIRM:-}"
REHEARSAL="${REHEARSAL:-false}"
EXPECTED_PROJECT_REF="${EXPECTED_PROJECT_REF:-}"
EXPECTED_DEPLOYED_SHA="${EXPECTED_DEPLOYED_SHA:-}"
HABITTA_API_BASE_URL="${HABITTA_API_BASE_URL:-}"
SUPABASE_URL="${SUPABASE_URL:-}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
CONDO_ADMIN_CREDENTIALS_FILE="${CONDO_ADMIN_CREDENTIALS_FILE:-}"
RESIDENT_CREDENTIALS_FILE="${RESIDENT_CREDENTIALS_FILE:-}"

WORK="$(mktemp -d)"
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT
umask 077

say() { printf '%s\n' "$*"; }
abort() { say "ABORT: $*" >&2; exit 1; }
require_cmd() { command -v "$1" >/dev/null 2>&1 || abort "required command not found: $1"; }
q() { psql -X -qAt -v ON_ERROR_STOP=1 -c "$1"; }

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

rpc_call() {
  local function_name="$1" token="$2" body_file="$3" output_file="$4"
  http_json POST "${SUPABASE_URL%/}/rest/v1/rpc/$function_name" "$SUPABASE_ANON_KEY" "$token" "$body_file" "$output_file"
}

auth_sign_in() {
  local credentials_file="$1" output_file="$2"
  jq '{email,password}' "$credentials_file" > "$WORK/sign-in-body.json"
  http_json POST "${SUPABASE_URL%/}/auth/v1/token?grant_type=password" "$SUPABASE_ANON_KEY" '' "$WORK/sign-in-body.json" "$output_file"
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

case "$SUPABASE_URL" in
  *"//$EXPECTED_PROJECT_REF.supabase.co"*) ;;
  http://127.0.0.1:*|http://localhost:*)
    [ "$REHEARSAL" = 'true' ] || abort 'local Supabase is allowed only with REHEARSAL=true'
    ;;
  *) abort 'SUPABASE_URL does not match EXPECTED_PROJECT_REF' ;;
esac

if [ "$APPLY" = 'true' ]; then
  [ "$CONFIRM" = "$REQUIRED_CONFIRMATION" ] || abort "APPLY=true requires CONFIRM=$REQUIRED_CONFIRMATION"
  [ -n "$SUPABASE_ANON_KEY" ] || abort 'SUPABASE_ANON_KEY is required to apply'
  [ -n "$SUPABASE_SERVICE_ROLE_KEY" ] || abort 'SUPABASE_SERVICE_ROLE_KEY is required to apply'
  [ -n "$CONDO_ADMIN_CREDENTIALS_FILE" ] || abort 'CONDO_ADMIN_CREDENTIALS_FILE is required to apply'
  [ -n "$RESIDENT_CREDENTIALS_FILE" ] || abort 'RESIDENT_CREDENTIALS_FILE is required to apply'
fi

say '=== HAB-423 demo resident access preflight ==='

if [ -n "$EXPECTED_DEPLOYED_SHA" ]; then
  health="$WORK/health.json"
  status="$(http_json GET "${HABITTA_API_BASE_URL%/}/health" '' '' '' "$health")"
  expect_http 'Worker health check' "$status" '200'
  [ "$(jq -r '.commit // empty' "$health")" = "$EXPECTED_DEPLOYED_SHA" ] \
    || abort 'Worker commit does not match EXPECTED_DEPLOYED_SHA'
fi

demo_org_count="$(q "select count(*) from public.organizations where account_type='demo' and name='$DEMO_ORG_NAME';")"
[ "$demo_org_count" = '1' ] || abort 'expected exactly one HAB-416 demo organization'

demo_condo_count="$(q "select count(*) from public.condominiums c join public.organizations o on o.id=c.organization_id where o.account_type='demo' and o.name='$DEMO_ORG_NAME' and c.name='$DEMO_CONDO_NAME';")"
[ "$demo_condo_count" = '1' ] || abort 'expected exactly one HAB-416 demo condominium'

condo_admin_count="$(q "select count(*) from auth.users u join public.organization_memberships om on om.user_id=u.id join public.organizations o on o.id=om.organization_id join public.condominium_memberships cm on cm.user_id=u.id join public.condominiums c on c.id=cm.condominium_id where u.email='$CONDO_ADMIN_EMAIL' and o.name='$DEMO_ORG_NAME' and o.account_type='demo' and om.role='organization_owner' and c.name='$DEMO_CONDO_NAME' and cm.role='condominium_admin';")"
[ "$condo_admin_count" = '1' ] || abort 'HAB-416 identity is not the expected demo condo administrator'

owner_assignment_count="$(q "select count(*) from public.people p join public.unit_owners uo on uo.person_id=p.id and uo.ends_at is null join public.units u on u.id=uo.unit_id join public.condominiums c on c.id=u.condominium_id join public.organizations o on o.id=c.organization_id where o.account_type='demo' and o.name='$DEMO_ORG_NAME' and c.name='$DEMO_CONDO_NAME' and p.first_name='$OWNER_FIRST' and p.last_name='$OWNER_LAST' and p.status='active' and u.code='$OWNER_UNIT' and u.status='active';")"
[ "$owner_assignment_count" = '1' ] || abort 'expected owner fixture assignment is missing or ambiguous'

tenant_assignment_count="$(q "select count(*) from public.people p join public.unit_occupancies uo on uo.person_id=p.id and uo.ends_at is null and uo.occupancy_type='tenant' join public.units u on u.id=uo.unit_id join public.condominiums c on c.id=u.condominium_id join public.organizations o on o.id=c.organization_id where o.account_type='demo' and o.name='$DEMO_ORG_NAME' and c.name='$DEMO_CONDO_NAME' and p.first_name='$TENANT_FIRST' and p.last_name='$TENANT_LAST' and p.status='active' and u.code='$TENANT_UNIT' and u.status='active';")"
[ "$tenant_assignment_count" = '1' ] || abort 'expected tenant fixture assignment is missing or ambiguous'

owner_person_email="$(q "select coalesce(p.email,'') from public.people p join public.condominiums c on c.id=p.condominium_id join public.organizations o on o.id=c.organization_id where o.account_type='demo' and o.name='$DEMO_ORG_NAME' and c.name='$DEMO_CONDO_NAME' and p.first_name='$OWNER_FIRST' and p.last_name='$OWNER_LAST' and p.status='active';")"
[ -z "$owner_person_email" ] || [ "$owner_person_email" = "$OWNER_EMAIL" ] \
  || abort 'owner fixture already has a different email; refusing to overwrite it'

tenant_person_email="$(q "select coalesce(p.email,'') from public.people p join public.condominiums c on c.id=p.condominium_id join public.organizations o on o.id=c.organization_id where o.account_type='demo' and o.name='$DEMO_ORG_NAME' and c.name='$DEMO_CONDO_NAME' and p.first_name='$TENANT_FIRST' and p.last_name='$TENANT_LAST' and p.status='active';")"
[ -z "$tenant_person_email" ] || [ "$tenant_person_email" = "$TENANT_EMAIL" ] \
  || abort 'tenant fixture already has a different email; refusing to overwrite it'

owner_auth_count="$(q "select count(*) from auth.users where email='$OWNER_EMAIL';")"
tenant_auth_count="$(q "select count(*) from auth.users where email='$TENANT_EMAIL';")"
[ "$owner_auth_count" -le 1 ] || abort 'duplicate synthetic owner Auth users detected'
[ "$tenant_auth_count" -le 1 ] || abort 'duplicate synthetic tenant Auth users detected'

owner_linked_email="$(q "select coalesce(au.email,'') from public.people p left join auth.users au on au.id=p.auth_user_id join public.condominiums c on c.id=p.condominium_id join public.organizations o on o.id=c.organization_id where o.account_type='demo' and o.name='$DEMO_ORG_NAME' and c.name='$DEMO_CONDO_NAME' and p.first_name='$OWNER_FIRST' and p.last_name='$OWNER_LAST' and p.status='active';")"
[ -z "$owner_linked_email" ] || [ "$owner_linked_email" = "$OWNER_EMAIL" ] \
  || abort 'owner fixture person is already linked to another Auth identity'

tenant_linked_email="$(q "select coalesce(au.email,'') from public.people p left join auth.users au on au.id=p.auth_user_id join public.condominiums c on c.id=p.condominium_id join public.organizations o on o.id=c.organization_id where o.account_type='demo' and o.name='$DEMO_ORG_NAME' and c.name='$DEMO_CONDO_NAME' and p.first_name='$TENANT_FIRST' and p.last_name='$TENANT_LAST' and p.status='active';")"
[ -z "$tenant_linked_email" ] || [ "$tenant_linked_email" = "$TENANT_EMAIL" ] \
  || abort 'tenant fixture person is already linked to another Auth identity'

[ "$(q "select count(*) from public.platform_admins pa join auth.users u on u.id=pa.user_id where u.email in ('$OWNER_EMAIL','$TENANT_EMAIL');")" = '0' ] \
  || abort 'synthetic resident identity was granted platform_admin'
[ "$(q "select count(*) from public.organization_memberships om join auth.users u on u.id=om.user_id where u.email in ('$OWNER_EMAIL','$TENANT_EMAIL');")" = '0' ] \
  || abort 'synthetic resident identity already has organization membership'

owner_unexpected_memberships="$(q "select count(*) from public.condominium_memberships cm join auth.users u on u.id=cm.user_id join public.condominiums c on c.id=cm.condominium_id join public.organizations o on o.id=c.organization_id where u.email='$OWNER_EMAIL' and not (o.account_type='demo' and o.name='$DEMO_ORG_NAME' and c.name='$DEMO_CONDO_NAME' and cm.role='owner');")"
[ "$owner_unexpected_memberships" = '0' ] || abort 'synthetic owner already has unexpected condominium scope'
tenant_unexpected_memberships="$(q "select count(*) from public.condominium_memberships cm join auth.users u on u.id=cm.user_id join public.condominiums c on c.id=cm.condominium_id join public.organizations o on o.id=c.organization_id where u.email='$TENANT_EMAIL' and not (o.account_type='demo' and o.name='$DEMO_ORG_NAME' and c.name='$DEMO_CONDO_NAME' and cm.role='tenant');")"
[ "$tenant_unexpected_memberships" = '0' ] || abort 'synthetic tenant already has unexpected condominium scope'

demo_subscription_before="$(q "select count(*) from public.subscriptions s join public.condominiums c on c.id=s.condominium_id join public.organizations o on o.id=c.organization_id where o.account_type='demo' and o.name='$DEMO_ORG_NAME';")"
demo_terms_before="$(q "select count(*) from public.subscription_terms t join public.subscriptions s on s.id=t.subscription_id join public.condominiums c on c.id=s.condominium_id join public.organizations o on o.id=c.organization_id where o.account_type='demo' and o.name='$DEMO_ORG_NAME';")"
demo_payments_before="$(q "select count(*) from public.payments p join public.condominiums c on c.id=p.condominium_id join public.organizations o on o.id=c.organization_id where o.account_type='demo' and o.name='$DEMO_ORG_NAME';")"
demo_receivables_before="$(q "select count(*) from public.receivable_items r join public.condominiums c on c.id=r.condominium_id join public.organizations o on o.id=c.organization_id where o.account_type='demo' and o.name='$DEMO_ORG_NAME';")"
delivery_events_before="$(q "select count(*) from public.resident_invitation_delivery_events e join public.condominiums c on c.id=e.condominium_id join public.organizations o on o.id=c.organization_id where o.account_type='demo' and o.name='$DEMO_ORG_NAME';")"

say '  existing HAB-416 demo tenant: ok'
say '  condo-admin boundary: ok'
say '  owner relationship: ok'
say '  tenant relationship: ok'
say "  existing dedicated resident Auth users: owner=$owner_auth_count tenant=$tenant_auth_count"
say '  commercial/financial baseline captured'
say '  outbound-email audit baseline captured'

if [ "$APPLY" != 'true' ]; then
  say 'PLAN ONLY: no writes performed. Re-run with APPLY=true and the explicit confirmation after review.'
  exit 0
fi

[ -f "$CONDO_ADMIN_CREDENTIALS_FILE" ] || abort 'existing HAB-416 condo-admin credential file is missing'
[ "$(stat -c '%a' "$CONDO_ADMIN_CREDENTIALS_FILE")" = '600' ] || abort 'CONDO_ADMIN_CREDENTIALS_FILE must have mode 600'
[ "$(jq -r '.email // empty' "$CONDO_ADMIN_CREDENTIALS_FILE")" = "$CONDO_ADMIN_EMAIL" ] \
  || abort 'CONDO_ADMIN_CREDENTIALS_FILE does not contain the HAB-416 identity'
[ "$(jq -r '.password // empty | length >= 16' "$CONDO_ADMIN_CREDENTIALS_FILE")" = 'true' ] \
  || abort 'HAB-416 condo-admin credential password is missing or too short'

condo_admin_signin="$WORK/condo-admin-signin.json"
status="$(auth_sign_in "$CONDO_ADMIN_CREDENTIALS_FILE" "$condo_admin_signin")"
expect_http 'HAB-416 condo-admin sign-in' "$status" '200'
condo_admin_token="$(jq -r '.access_token // empty' "$condo_admin_signin")"
[ -n "$condo_admin_token" ] || abort 'condo-admin sign-in did not return an access token'

memberships="$WORK/condo-admin-memberships.json"
status="$(worker_call GET '/v1/memberships' "$condo_admin_token" '' "$memberships")"
expect_http 'load condo-admin memberships' "$status" '200'
[ "$(jq '[.organizations[] | select(.role=="organization_owner")] | length' "$memberships")" = '1' ] \
  || abort 'HAB-416 identity no longer has exactly one organization_owner membership'
[ "$(jq '[.condominiums[] | select(.role=="condominium_admin")] | length' "$memberships")" = '1' ] \
  || abort 'HAB-416 identity no longer has exactly one condominium_admin membership'

condos="$WORK/condominiums.json"
status="$(worker_call GET '/v1/condominiums' "$condo_admin_token" '' "$condos")"
expect_http 'load demo condominiums' "$status" '200'
condo_id="$(jq -r --arg n "$DEMO_CONDO_NAME" '[.[] | select(.name==$n)] | if length==1 then .[0].id else empty end' "$condos")"
[ -n "$condo_id" ] || abort 'demo condominium was not returned to condo admin'

people="$WORK/people.json"
status="$(worker_call GET "/v1/condominiums/$condo_id/people" "$condo_admin_token" '' "$people")"
expect_http 'load demo people' "$status" '200'
owner_person_id="$(jq -r --arg f "$OWNER_FIRST" --arg l "$OWNER_LAST" '[.[] | select(.first_name==$f and .last_name==$l and .status=="active")] | if length==1 then .[0].id else empty end' "$people")"
tenant_person_id="$(jq -r --arg f "$TENANT_FIRST" --arg l "$TENANT_LAST" '[.[] | select(.first_name==$f and .last_name==$l and .status=="active")] | if length==1 then .[0].id else empty end' "$people")"
[ -n "$owner_person_id" ] && [ -n "$tenant_person_id" ] || abort 'demo person lookup failed'

units="$WORK/units.json"
status="$(worker_call GET "/v1/condominiums/$condo_id/units" "$condo_admin_token" '' "$units")"
expect_http 'load demo units' "$status" '200'
owner_unit_id="$(jq -r --arg code "$OWNER_UNIT" '[.[] | select(.code==$code and .status=="active")] | if length==1 then .[0].id else empty end' "$units")"
tenant_unit_id="$(jq -r --arg code "$TENANT_UNIT" '[.[] | select(.code==$code and .status=="active")] | if length==1 then .[0].id else empty end' "$units")"
[ -n "$owner_unit_id" ] && [ -n "$tenant_unit_id" ] || abort 'demo unit lookup failed'

set_person_email() {
  local person_id="$1" desired_email="$2" label="$3" current_email body response
  current_email="$(jq -r --arg id "$person_id" '[.[] | select(.id==$id)] | if length==1 then (.[] | .email // "") else "__ambiguous__" end' "$people")"
  [ "$current_email" != '__ambiguous__' ] || abort "$label person lookup is ambiguous"
  if [ -n "$current_email" ] && [ "$current_email" != "$desired_email" ]; then
    abort "$label person already has a different email; refusing to overwrite it"
  fi
  if [ "$current_email" != "$desired_email" ]; then
    body="$WORK/${label}-person-email.json"
    response="$WORK/${label}-person-email-response.json"
    jq -n --arg email "$desired_email" '{email:$email}' > "$body"
    status="$(worker_call PATCH "/v1/condominiums/$condo_id/people/$person_id" "$condo_admin_token" "$body" "$response")"
    expect_http "set $label synthetic email" "$status" '200'
  fi
}

if [ -f "$RESIDENT_CREDENTIALS_FILE" ]; then
  [ "$(stat -c '%a' "$RESIDENT_CREDENTIALS_FILE")" = '600' ] || abort 'RESIDENT_CREDENTIALS_FILE must have mode 600'
else
  [ "$owner_auth_count" = '0' ] && [ "$tenant_auth_count" = '0' ] \
    || abort 'synthetic resident Auth user exists but RESIDENT_CREDENTIALS_FILE is unavailable; do not reset credentials implicitly'
  owner_password="$(openssl rand -base64 36 | tr -d '\n')"
  tenant_password="$(openssl rand -base64 36 | tr -d '\n')"
  jq -n \
    --arg ownerEmail "$OWNER_EMAIL" \
    --arg ownerPassword "$owner_password" \
    --arg tenantEmail "$TENANT_EMAIL" \
    --arg tenantPassword "$tenant_password" \
    '{owner:{email:$ownerEmail,password:$ownerPassword},tenant:{email:$tenantEmail,password:$tenantPassword}}' \
    > "$RESIDENT_CREDENTIALS_FILE"
  unset owner_password tenant_password
  chmod 600 "$RESIDENT_CREDENTIALS_FILE"
fi

[ "$(jq -r '.owner.email // empty' "$RESIDENT_CREDENTIALS_FILE")" = "$OWNER_EMAIL" ] \
  || abort 'resident credential file owner email does not match HAB-423'
[ "$(jq -r '.tenant.email // empty' "$RESIDENT_CREDENTIALS_FILE")" = "$TENANT_EMAIL" ] \
  || abort 'resident credential file tenant email does not match HAB-423'
[ "$(jq -r '.owner.password // empty | length >= 16' "$RESIDENT_CREDENTIALS_FILE")" = 'true' ] \
  || abort 'resident owner password is missing or too short'
[ "$(jq -r '.tenant.password // empty | length >= 16' "$RESIDENT_CREDENTIALS_FILE")" = 'true' ] \
  || abort 'resident tenant password is missing or too short'

create_auth_user_if_missing() {
  local role="$1" email="$2" credentials_path="$3" existing_count="$4" body response
  if [ "$existing_count" = '1' ]; then
    return
  fi
  body="$WORK/${role}-auth-create.json"
  response="$WORK/${role}-auth-create-response.json"
  jq --arg role "$role" \
    '{email:.email,password:.password,email_confirm:true,user_metadata:{fixture:"HAB-423",synthetic:true,demo_role:$role}}' \
    "$credentials_path" > "$body"
  status="$(http_json POST "${SUPABASE_URL%/}/auth/v1/admin/users" "$SUPABASE_SERVICE_ROLE_KEY" "$SUPABASE_SERVICE_ROLE_KEY" "$body" "$response")"
  expect_http "create synthetic $role Auth user" "$status" '200'
  [ -n "$(jq -r '.id // empty' "$response")" ] || abort "Auth Admin API did not return $role user id"
}

jq '.owner' "$RESIDENT_CREDENTIALS_FILE" > "$WORK/owner.credentials.json"
jq '.tenant' "$RESIDENT_CREDENTIALS_FILE" > "$WORK/tenant.credentials.json"
create_auth_user_if_missing 'owner' "$OWNER_EMAIL" "$WORK/owner.credentials.json" "$owner_auth_count"
create_auth_user_if_missing 'tenant' "$TENANT_EMAIL" "$WORK/tenant.credentials.json" "$tenant_auth_count"

owner_signin="$WORK/owner-signin.json"
status="$(auth_sign_in "$WORK/owner.credentials.json" "$owner_signin")"
expect_http 'synthetic owner sign-in' "$status" '200'
owner_token="$(jq -r '.access_token // empty' "$owner_signin")"
owner_user_id="$(jq -r '.user.id // empty' "$owner_signin")"
[ -n "$owner_token" ] && [ -n "$owner_user_id" ] || abort 'synthetic owner sign-in payload is incomplete'

tenant_signin="$WORK/tenant-signin.json"
status="$(auth_sign_in "$WORK/tenant.credentials.json" "$tenant_signin")"
expect_http 'synthetic tenant sign-in' "$status" '200'
tenant_token="$(jq -r '.access_token // empty' "$tenant_signin")"
tenant_user_id="$(jq -r '.user.id // empty' "$tenant_signin")"
[ -n "$tenant_token" ] && [ -n "$tenant_user_id" ] || abort 'synthetic tenant sign-in payload is incomplete'

# Remote tenant data is mutated only after credentials are safe and both Auth identities can sign in.
set_person_email "$owner_person_id" "$OWNER_EMAIL" 'owner'
set_person_email "$tenant_person_id" "$TENANT_EMAIL" 'tenant'

ensure_resident_access() {
  local role="$1" user_id="$2" person_id="$3" unit_id="$4" resident_token="$5"
  local linked_user membership_count org_membership_count body create_response raw_token accept_body accept_response

  linked_user="$(q "select coalesce(auth_user_id::text,'') from public.people where id='$person_id';")"
  membership_count="$(q "select count(*) from public.condominium_memberships where condominium_id='$condo_id' and user_id='$user_id' and role='$role';")"
  org_membership_count="$(q "select count(*) from public.organization_memberships where user_id='$user_id';")"

  [ "$org_membership_count" = '0' ] || abort "$role synthetic resident unexpectedly has organization membership"
  [ "$membership_count" -le 1 ] || abort "$role synthetic resident has duplicate condominium memberships"

  if [ -n "$linked_user" ] && [ "$linked_user" != "$user_id" ]; then
    abort "$role person is already linked to another Auth user"
  fi

  if [ "$membership_count" = '1' ] && [ "$linked_user" = "$user_id" ]; then
    return
  fi
  if [ "$membership_count" = '1' ] && [ -z "$linked_user" ]; then
    abort "$role membership exists without the person/Auth linkage; refusing to paper over inconsistent state"
  fi

  body="$WORK/${role}-invitation-create.json"
  create_response="$WORK/${role}-invitation-create-response.json"
  jq -n \
    --arg condominiumId "$condo_id" \
    --arg personId "$person_id" \
    --arg unitId "$unit_id" \
    --arg role "$role" \
    '{target_condominium_id:$condominiumId,target_person_id:$personId,target_unit_id:$unitId,target_role:$role,target_expires_at:null}' \
    > "$body"
  status="$(rpc_call 'create_resident_invitation' "$condo_admin_token" "$body" "$create_response")"
  expect_http "create $role HAB-125 invitation" "$status" '200'
  raw_token="$(jq -r '.raw_token // empty' "$create_response")"
  [ -n "$raw_token" ] || abort "$role invitation did not return a raw token"

  accept_body="$WORK/${role}-invitation-accept.json"
  accept_response="$WORK/${role}-invitation-accept-response.json"
  jq -n --arg rawToken "$raw_token" '{raw_token:$rawToken}' > "$accept_body"
  unset raw_token
  status="$(rpc_call 'accept_invitation' "$resident_token" "$accept_body" "$accept_response")"
  expect_http "accept $role HAB-125 invitation" "$status" '200'
}

ensure_resident_access 'owner' "$owner_user_id" "$owner_person_id" "$owner_unit_id" "$owner_token"
ensure_resident_access 'tenant' "$tenant_user_id" "$tenant_person_id" "$tenant_unit_id" "$tenant_token"

say '=== HAB-423 post-bootstrap verification ==='

owner_final="$(q "select count(*) from auth.users au join public.people p on p.auth_user_id=au.id join public.unit_owners uo on uo.person_id=p.id and uo.ends_at is null join public.units u on u.id=uo.unit_id join public.condominium_memberships cm on cm.user_id=au.id and cm.condominium_id=u.condominium_id and cm.role='owner' join public.condominiums c on c.id=u.condominium_id join public.organizations o on o.id=c.organization_id where au.email='$OWNER_EMAIL' and p.first_name='$OWNER_FIRST' and p.last_name='$OWNER_LAST' and u.code='$OWNER_UNIT' and o.account_type='demo' and o.name='$DEMO_ORG_NAME';")"
[ "$owner_final" = '1' ] || abort 'owner Auth/person/unit/membership chain did not converge'

tenant_final="$(q "select count(*) from auth.users au join public.people p on p.auth_user_id=au.id join public.unit_occupancies uo on uo.person_id=p.id and uo.ends_at is null and uo.occupancy_type='tenant' join public.units u on u.id=uo.unit_id join public.condominium_memberships cm on cm.user_id=au.id and cm.condominium_id=u.condominium_id and cm.role='tenant' join public.condominiums c on c.id=u.condominium_id join public.organizations o on o.id=c.organization_id where au.email='$TENANT_EMAIL' and p.first_name='$TENANT_FIRST' and p.last_name='$TENANT_LAST' and u.code='$TENANT_UNIT' and o.account_type='demo' and o.name='$DEMO_ORG_NAME';")"
[ "$tenant_final" = '1' ] || abort 'tenant Auth/person/unit/membership chain did not converge'

[ "$(q "select count(*) from public.condominium_memberships cm join auth.users u on u.id=cm.user_id where u.email='$OWNER_EMAIL';")" = '1' ] \
  || abort 'owner synthetic identity has unexpected condominium membership scope'
[ "$(q "select count(*) from public.condominium_memberships cm join auth.users u on u.id=cm.user_id where u.email='$TENANT_EMAIL';")" = '1' ] \
  || abort 'tenant synthetic identity has unexpected condominium membership scope'
[ "$(q "select count(*) from public.organization_memberships om join auth.users u on u.id=om.user_id where u.email in ('$OWNER_EMAIL','$TENANT_EMAIL');")" = '0' ] \
  || abort 'resident synthetic identity acquired organization membership'
[ "$(q "select count(*) from public.platform_admins pa join auth.users u on u.id=pa.user_id where u.email in ('$OWNER_EMAIL','$TENANT_EMAIL');")" = '0' ] \
  || abort 'resident synthetic identity acquired platform_admin'

[ "$(q "select count(*) from public.invitations i join auth.users u on lower(u.email)=lower(i.email) where u.email in ('$OWNER_EMAIL','$TENANT_EMAIL') and i.status='pending';")" = '0' ] \
  || abort 'a HAB-423 resident invitation remains pending'

[ "$(q "select count(*) from public.subscriptions s join public.condominiums c on c.id=s.condominium_id join public.organizations o on o.id=c.organization_id where o.account_type='demo' and o.name='$DEMO_ORG_NAME';")" = "$demo_subscription_before" ] \
  || abort 'demo subscription state changed during resident bootstrap'
[ "$(q "select count(*) from public.subscription_terms t join public.subscriptions s on s.id=t.subscription_id join public.condominiums c on c.id=s.condominium_id join public.organizations o on o.id=c.organization_id where o.account_type='demo' and o.name='$DEMO_ORG_NAME';")" = "$demo_terms_before" ] \
  || abort 'demo subscription terms changed during resident bootstrap'
[ "$(q "select count(*) from public.payments p join public.condominiums c on c.id=p.condominium_id join public.organizations o on o.id=c.organization_id where o.account_type='demo' and o.name='$DEMO_ORG_NAME';")" = "$demo_payments_before" ] \
  || abort 'demo payment state changed during resident bootstrap'
[ "$(q "select count(*) from public.receivable_items r join public.condominiums c on c.id=r.condominium_id join public.organizations o on o.id=c.organization_id where o.account_type='demo' and o.name='$DEMO_ORG_NAME';")" = "$demo_receivables_before" ] \
  || abort 'demo receivable state changed during resident bootstrap'
[ "$(q "select count(*) from public.resident_invitation_delivery_events e join public.condominiums c on c.id=e.condominium_id join public.organizations o on o.id=c.organization_id where o.account_type='demo' and o.name='$DEMO_ORG_NAME';")" = "$delivery_events_before" ] \
  || abort 'outbound-email delivery audit changed; HAB-423 must not send invitation email'

[ "$(stat -c '%a' "$RESIDENT_CREDENTIALS_FILE")" = '600' ] || abort 'RESIDENT_CREDENTIALS_FILE mode changed'

owner_memberships="$WORK/owner-memberships.json"
status="$(worker_call GET '/v1/memberships' "$owner_token" '' "$owner_memberships")"
expect_http 'verify owner memberships through Worker' "$status" '200'
[ "$(jq '[.condominiums[] | select(.role=="owner")] | length' "$owner_memberships")" = '1' ] \
  || abort 'owner Worker membership scope is incorrect'
[ "$(jq '.organizations | length' "$owner_memberships")" = '0' ] \
  || abort 'owner Worker organization scope is broader than intended'

tenant_memberships="$WORK/tenant-memberships.json"
status="$(worker_call GET '/v1/memberships' "$tenant_token" '' "$tenant_memberships")"
expect_http 'verify tenant memberships through Worker' "$status" '200'
[ "$(jq '[.condominiums[] | select(.role=="tenant")] | length' "$tenant_memberships")" = '1' ] \
  || abort 'tenant Worker membership scope is incorrect'
[ "$(jq '.organizations | length' "$tenant_memberships")" = '0' ] \
  || abort 'tenant Worker organization scope is broader than intended'

unset condo_admin_token owner_token tenant_token owner_user_id tenant_user_id

say '  dedicated owner resident: ok'
say '  dedicated tenant resident: ok'
say '  person/Auth links and HAB-125 memberships: ok'
say '  no organization/platform-admin privilege escalation: ok'
say '  commercial and financial state unchanged: ok'
say '  no invitation email delivery attempted: ok'
say "COMPLETE: HAB-423 demo resident access pack converged. Credentials remain only in the mode-600 file: $RESIDENT_CREDENTIALS_FILE"
