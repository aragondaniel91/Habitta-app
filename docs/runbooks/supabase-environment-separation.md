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

## What the isolation guard proves

`assert-development-isolation.mjs --mode plan|apply` runs inside both development workflows before
any credential is used for real work. It fails closed: a missing setting, an unknown key format or a
check that cannot be completed is a refusal.

- **Static checks:** every critical setting must be present. The project ref must be a development
  ref, and both URLs must be exactly `https://<that ref>.supabase.co`. JWT keys must name that ref and
  the expected role, and non-JWT keys must carry the expected prefix (`sb_publishable_`, `sb_secret_`).
- **Live checks:**
  - every key must be **accepted** by the development project and **refused** (401/403) by production;
  - the access token must see the development project and must not see production.
  This is what covers the non-JWT keys, which carry no project ref.

Consequence: a Supabase personal access token belongs to an account, not to a project. A token from
the account that owns production can always see production, so it is refused. A cloud development
project needs a Supabase account (or organization member) that has no access to production.
Otherwise, use local Supabase for development.

## Founder procedure: protect production without breaking any workflow (not executed)

GitHub gives a job its environment's secrets **plus** the repository's, and the environment value
wins when both define a name. That is what makes this order safe: nothing breaks at any step, and
each step can be checked before the next.

1. **Merge this PR.** The nightly backup moves to its own environment, `production-backup`: no
   reviewers, so a required approval never stops it. Until step 3, both `production` and
   `production-backup` keep reading the repository secrets as they do today.
2. **Configure the environments** (Settings → Environments):
   - `production-backup`: deployment branches limited to `main`, no required reviewers.
   - `production`: required reviewer = founder, deployment branches limited to `main`. Production
     Release, Stripe verification and the restore drill will wait for your approval. The backup will
     not.
3. **Copy the credentials into the environments.** Use values from the Supabase and Cloudflare
   dashboards; GitHub cannot show the current ones. Each command prompts for the value, so it never
   appears on a command line:
   ```
   # production: everything a release needs
   for s in SUPABASE_SERVICE_ROLE_KEY SUPABASE_DB_PASSWORD SUPABASE_ACCESS_TOKEN SUPABASE_ANON_KEY CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID ZEPTOMAIL_SEND_TOKEN; do
     gh secret set "$s" --env production -R aragondaniel91/Habitta-app; done
   # production-backup: only what the backup needs
   for s in SUPABASE_DB_PASSWORD SUPABASE_ACCESS_TOKEN CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID; do
     gh secret set "$s" --env production-backup -R aragondaniel91/Habitta-app; done
   gh variable set SUPABASE_PROJECT_REF --env production --body kgsfaahixbcwcmykmhat -R aragondaniel91/Habitta-app
   gh variable set SUPABASE_PROJECT_REF --env production-backup --body kgsfaahixbcwcmykmhat -R aragondaniel91/Habitta-app
   ```
   Do the same for `SUPABASE_URL` and `VITE_SUPABASE_URL` in `production`.
   **`BACKUP_ENCRYPTION_PASSPHRASE`:** copy it only if you have the current value stored outside
   GitHub. Every existing backup was encrypted with it. If you do not have it, leave the repository
   copy in place; it is the only key to those backups.
4. **Prove both paths still work:**
   - Dispatch `Production Database Backup`; it must succeed without asking for approval.
   - Dispatch `Database Restore Drill` on that backup; it must ask for your approval, then pass.
5. **Delete the repository-level copies** of the Supabase, Cloudflare and ZeptoMail secrets
   (`gh secret delete <NAME> -R aragondaniel91/Habitta-app`) and of the three repository variables.
   Then repeat step 4. Any workflow that silently depended on a repository copy fails here,
   visibly, instead of later.
6. **Development** gets its own project and credentials in the `development` environment. The
   isolation guard proves them before every development release.
7. **Delete `habitta-api-dev`** (containment B) once its removal is approved.

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
