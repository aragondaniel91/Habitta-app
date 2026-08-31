# HAB-423 — Production demo resident access pack

This block adds two dedicated synthetic resident identities to the existing HAB-416 nonbillable demo tenant:

- **Owner resident:** Valentina Rojas · A-01
- **Tenant resident:** Mariana Suarez · A-02

The existing `hab416.demo.owner@habitta.invalid` account remains the **Condo Admin** (`organization_owner` + `condominium_admin`). HAB-423 does not rotate that credential and does not convert it into a resident role.

## Safety model

`scripts/bootstrap-production-demo-residents.sh` is plan-only by default. The apply path:

1. verifies the exact HAB-416 demo organization/condominium and active owner/tenant assignments;
2. refuses to overwrite any non-HAB-423 person email or pre-existing cross-tenant access;
3. requires the existing HAB-416 credential file to be mode `0600`;
4. creates the two new Auth users only through the Supabase Auth Admin API;
5. updates the two synthetic people through Habitta's authenticated People API;
6. calls `create_resident_invitation` directly with the Condo Admin JWT;
7. signs in each resident and calls `accept_invitation` with that resident JWT;
8. verifies the resulting `people.auth_user_id` + condominium membership + unit relationship chains;
9. verifies subscriptions, subscription terms, payments and receivables did not change;
10. verifies no `resident_invitation_delivery_events` were added.

The direct invitation RPC is deliberate for this fixture. The normal Worker invitation endpoint wraps the same HAB-125 authorization RPC with transactional email delivery. Synthetic `.invalid` identities do not need email, so HAB-423 avoids spending provider credits while keeping the real database authorization and acceptance semantics.

The script never inserts into `auth.users`, `condominium_memberships`, or tenant business tables with SQL.

## Credential files

Use the existing HAB-416 file unchanged:

```bash
export CONDO_ADMIN_CREDENTIALS_FILE="$HOME/.config/habitta/hab416-production-demo.credentials"
```

HAB-423 stores both new resident credentials in a separate mode-`0600` JSON file:

```bash
export RESIDENT_CREDENTIALS_FILE="$HOME/.config/habitta/hab423-production-demo-residents.credentials"
```

Do not paste either file into chat, logs, issues, CI, or Git.

## Required environment

The script expects the same secure Production operator environment used by HAB-416:

```bash
export EXPECTED_PROJECT_REF='kgsfaahixbcwcmykmhat'
export HABITTA_API_BASE_URL='https://habitta-api-prod.aragondaniel91.workers.dev'
export SUPABASE_URL='https://kgsfaahixbcwcmykmhat.supabase.co'
```

`SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` must already be present securely in the shell environment. PostgreSQL connectivity must also already be configured for read-only preflight/verification queries. Never put secrets directly in shell history.

Optionally pin the Worker version being validated:

```bash
export EXPECTED_DEPLOYED_SHA='<released-main-sha>'
```

## Plan-only preflight

```bash
APPLY=false bash scripts/bootstrap-production-demo-residents.sh
```

Expected result: the fixture/access invariants are checked and the script exits with `PLAN ONLY`; no writes occur.

## Apply

Only after reviewing the plan output:

```bash
APPLY=true \
CONFIRM=BOOTSTRAP-HABITTA-PRODUCTION-DEMO-RESIDENTS \
bash scripts/bootstrap-production-demo-residents.sh
```

A successful run ends with aggregate verification only and prints the local credentials-file path, never the passwords or JWTs.

## Expected final login matrix

| Portal | Identity | Session scope |
| --- | --- | --- |
| `admin.mihabitta.com` | Existing real Platform Admin | Platform operations only |
| `app.mihabitta.com` | Existing HAB-416 synthetic account | Organization owner + Condo Admin |
| `app.mihabitta.com` | HAB-423 synthetic owner | Resident `owner` |
| `app.mihabitta.com` | HAB-423 synthetic tenant | Resident `tenant` |

Family member and authorized occupant remain outside HAB-423. Their authenticated access requires an explicit authorization/RLS product design rather than mapping occupancy labels onto owner/tenant memberships.
