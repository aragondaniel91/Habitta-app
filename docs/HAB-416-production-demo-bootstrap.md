# HAB-416 — Production demo bootstrap runbook

This runbook creates exactly one synthetic Habitta demo tenant after HAB-414 and the HAB-416 nonbillable guard are deployed. It is **not** a schema seed and must never run as part of migrations or ordinary CI.

## Hard order of operations

1. Merge the reviewed HAB-416 PR only when CI, Supabase/pgTAP, Playwright, and Financial E2E are green on the same SHA.
2. Deploy that merged SHA through `.github/workflows/production-release.yml` only.
3. Confirm the production release, Worker smoke, Pages/API smoke, and migration step are green.
4. Run `scripts/bootstrap-production-demo.sh` in plan-only mode against Production.
5. Review the plan and Production aggregate state.
6. Run the same script with explicit apply confirmation.
7. Run the commercial placement report and the post-bootstrap checks below.

Never run step 4 or later from a HAB-416 branch that has not been merged and deployed.

## What the bootstrap is allowed to write

- Supabase Auth: one synthetic user via `POST /auth/v1/admin/users` with `email_confirm=true`; no invitation or confirmation email is sent.
- Tenant onboarding: organization, condominium, and memberships only through Habitta's `/v1/organizations` endpoint, which calls `create_organization_with_condominium()` under the signed-in demo owner.
- Fixture: buildings, units, people, owners, and occupancies through existing authenticated Habitta API routes.
- Platform classification: the single trusted SQL update `organizations.account_type = 'demo'` for the deterministic synthetic owner/name pair.

The bootstrap must not insert directly into `auth.users`, organizations, condominiums, buildings, units, people, ownership, occupancy, subscriptions, terms, receivables, or payments.

## Deterministic fixture

- Organization: `Conjunto Residencial Avila Esmeralda Demo`
- Condominium: `Residencias Avila Esmeralda`
- Buildings: `Torre Avila`, `Torre Esmeralda`
- Units: exactly 10 apartments split 5/5 across the two buildings
- People: exactly 6 fictional people with no email, phone, document number, or other real PII
- Relationships include owner-occupant, tenant, family member, and authorized occupant coverage
- No financial fixture is created for HAB-416; this avoids manufacturing commercial/payment state merely to populate a dashboard

The Auth email uses the reserved `.invalid` TLD so it cannot be a real recipient.

## Secrets and local files

The repository is public. Never put any credential in a command argument, Git file, issue, PR comment, Actions log, or chat transcript.

The script expects the normal PostgreSQL `PG*` environment variables plus:

- `EXPECTED_PROJECT_REF`
- `EXPECTED_DEPLOYED_SHA` (strongly recommended; required by the production procedure below)
- `HABITTA_API_BASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (apply only)
- `SUPABASE_SERVICE_ROLE_KEY` (apply only)
- `DEMO_CREDENTIALS_FILE` (apply only)

`DEMO_CREDENTIALS_FILE` is generated locally when the synthetic Auth user does not yet exist. The script forces mode `0600`; `.gitignore` excludes the supported credential-file patterns. If the Auth user already exists and that file is lost, the script aborts instead of silently rotating the password.

## Rehearsal outside Production

Apply the HAB-416 branch/migration to an isolated development or local Supabase environment first, then run:

```bash
REHEARSAL=true \
APPLY=false \
EXPECTED_PROJECT_REF=<non-production-ref> \
EXPECTED_DEPLOYED_SHA=<deployed-test-sha> \
HABITTA_API_BASE_URL=<test-worker-url> \
SUPABASE_URL=<test-supabase-url> \
./scripts/bootstrap-production-demo.sh
```

After the plan is reviewed, run the same isolated environment with `APPLY=true`, `CONFIRM=BOOTSTRAP-HABITTA-PRODUCTION-DEMO`, the Auth keys, and a local mode-600 credential file. Run it a second time: the second execution must converge without creating duplicate organization/buildings/units/people/assignments.

## Production plan-only pass

Prerequisites:

- Production `main` SHA is the merged HAB-416 SHA.
- The official Production Release for that SHA is green.
- Migration `20260831000000_hab416_nonbillable_account_types.sql` is present in Production.
- Production still has exactly one platform admin, zero customer organizations, zero demo organizations before first apply, zero subscriptions, and zero payments.

Run with `APPLY=false` (default). The script prints only aggregate/check status and never credentials or UUIDs.

## Production apply pass

Use the identical environment as the reviewed plan, add the Auth keys and a local credential file path, then set:

```bash
APPLY=true
CONFIRM=BOOTSTRAP-HABITTA-PRODUCTION-DEMO
DEMO_CREDENTIALS_FILE=./hab416-demo-credentials.json
```

The credentials file must remain local and mode `0600`. Do not paste its contents anywhere.

## Required post-bootstrap invariants

The script aborts unless all of these converge:

- exactly 1 organization with `account_type = 'demo'`
- exactly 1 condominium belonging to the demo organization
- exactly 2 buildings, 10 units, and 6 synthetic people
- demo Auth owner is not a platform admin
- the original platform admin row is unchanged and still maps to an Auth user
- Production customer organization count remains 0
- demo has zero subscriptions and zero subscription terms
- demo cannot have `commercial_status = 'confirmed'`
- Production payment count remains 0
- demo owner sees exactly one organization and one condominium through tenant RLS/API
- the commercial placement report returns `noncustomer_subscriptions = 0`

The nonbillable database migration independently prevents both dangerous transitions:

1. creating/moving a subscription onto a demo/internal condominium;
2. reclassifying a customer organization with existing subscription state to demo/internal.

## Rerun behavior

The script is intentionally convergent. It reuses the exact synthetic Auth identity and deterministic tenant, then GETs each supported API collection before creating missing fixture members. If it finds an unexpected demo, duplicate deterministic rows, missing credential state for an existing Auth user, or contradictory commercial state, it aborts rather than guessing.
