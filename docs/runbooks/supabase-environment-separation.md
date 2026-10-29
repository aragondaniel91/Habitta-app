# Supabase development / production separation

Development and production must not share a Supabase project. Sharing was a temporary pre-customer cost decision; it is now closed. The production project ref is `kgsfaahixbcwcmykmhat`.

## Verified state (2026-10-29)

- Production is `kgsfaahixbcwcmykmhat`. There is **no** development or QA Supabase project yet.
- The Supabase credentials (`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_ANON_KEY`) are **repository** secrets, so any workflow can read them. The GitHub `development` environment has no secrets or variables of its own, and the `production` environment has **no protection rules and no branch policy**.
- The old development Worker `habitta-api-dev` (build `042c8db`, 11-Aug) ran against production with the production service-role key and was reachable at `habitta-api-dev.aragondaniel91.workers.dev` and `api.mihabitta.com`. Containment A, approved by the founder on 2026-10-29: the custom domain was removed and the `workers.dev` and preview URLs disabled. The Worker script and its secrets still exist; deleting it is a separate approval.

## Guard in this repository

Development can no longer reach production through a workflow:

- `Development Release Apply` and `Development Release Plan` run `scripts/release/assert-development-isolation.mjs` before any credential is used. It refuses when the project ref, a Supabase URL, or a JWT key's `ref` claim names production. There is no override phrase: `DEV-SHARES-PRODUCTION-DATABASE` was removed.
- `Development Release Plan` now runs in the `development` environment, so it can only see development credentials.
- `pnpm release:dev:validate` (CI, required `quality` check) fails when any workflow uses Supabase, Stripe, ZeptoMail or backup credentials outside a GitHub environment, when a development workflow references a production-only secret, or when `supabase db push` runs outside `production` without the isolation guard first. `pnpm release:isolation:test` covers those rules.

Until the steps below are done, development releases cannot run at all. That is the intended fail-closed state.

## Founder steps (not executed; each needs explicit approval)

Order matters: production must keep working at every step.

1. **Protect the `production` environment.** Settings → Environments → `production`: required reviewer (founder) and deployment branches limited to `main`.
2. **Move production credentials into `production`.** Get the values from the Supabase dashboard of `kgsfaahixbcwcmykmhat` (they cannot be read back from GitHub), then:
   ```
   gh secret set SUPABASE_SERVICE_ROLE_KEY --env production -R aragondaniel91/Habitta-app
   gh secret set SUPABASE_DB_PASSWORD      --env production -R aragondaniel91/Habitta-app
   gh secret set SUPABASE_ACCESS_TOKEN     --env production -R aragondaniel91/Habitta-app
   gh secret set SUPABASE_ANON_KEY         --env production -R aragondaniel91/Habitta-app
   gh variable set SUPABASE_PROJECT_REF --env production --body kgsfaahixbcwcmykmhat -R aragondaniel91/Habitta-app
   ```
   Each command prompts for the value, so the value never appears on a command line. Do the same for `SUPABASE_URL` and `VITE_SUPABASE_URL` as environment variables.
3. **Prove production still works** by dispatching `Production Database Backup`. It reads the environment-scoped secrets and must succeed.
4. **Delete the repository-level copies**: `gh secret delete <NAME> -R aragondaniel91/Habitta-app` for the four secrets, and `gh variable delete` for the three repository variables.
5. **Create the development database**: either a new Supabase project or Supabase local only. Then set its own `SUPABASE_*` values in the `development` environment.
6. **Delete `habitta-api-dev`** (containment B) and redeploy development only through `Development Release Apply` once step 5 exists.

## Mandatory separation trigger

Separate the environments **before the first real condominium contains resident/person data or real payments**. Do not use the shared cloud project for day-to-day development once real customer data exists.

## Cutover sequence

1. Keep `kgsfaahixbcwcmykmhat` as production. Do not repurpose it.
2. Provision a separate development Supabase project, or use local Supabase for daily development until a cloud development project is required.
3. Configure the GitHub `development` environment with the development-only `SUPABASE_PROJECT_REF`, `SUPABASE_URL`, `VITE_SUPABASE_URL`, anon key, service-role key, DB password and access token. Never copy development credentials into the production environment.
4. Apply the reviewed migration history to the new development database and run the database/financial gates against it. Do not copy resident/payment production rows into development.
5. Point the development Worker and `preview.mihabitta.com` build to the development Supabase project.
6. Run Development Release Apply using `SEPARATE-DEVELOPMENT-DATABASE`. The workflow refuses any configuration that resolves to production.
7. Re-enable the production-only notification/cron behavior that is intentionally restricted while both environments share one database, following `docs/PROJECT-DECISIONS.md` and the notification configuration validator.
8. Validate auth redirects, invitations, documents, payments and financial E2E before considering the cutover complete.

## Rollback

If development cutover fails, roll back the development Worker/Pages deployment only. Do not point development back at production merely to get preview working. Fix the separate development configuration or use Supabase local until the cloud development environment is healthy.
