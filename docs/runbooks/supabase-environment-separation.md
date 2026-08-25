# Supabase development / production separation

Habitta currently allows development and production to share the production Supabase project only as a temporary pre-customer cost decision. The production project ref is `kgsfaahixbcwcmykmhat`.

## Current shared-database guard

`Development Release Apply` targets the GitHub `development` environment and requires all of the following before it can apply migrations:

- the normal `DEPLOY-HABITTA-DEVELOPMENT` confirmation;
- the exact configured `SUPABASE_PROJECT_REF`;
- `DEV-SHARES-PRODUCTION-DATABASE` while the development project ref equals the production ref.

The extra phrase exists because `supabase db push` in the development workflow can affect the production database while the projects are shared. Sandbox email and the shared-database cron restrictions remain mandatory during this period.

## Mandatory separation trigger

Separate the environments **before the first real condominium contains resident/person data or real payments**. Do not use the shared cloud project for day-to-day development once real customer data exists.

## Cutover sequence

1. Keep `kgsfaahixbcwcmykmhat` as production. Do not repurpose it.
2. Provision a separate development Supabase project, or use local Supabase for daily development until a cloud development project is required.
3. Configure the GitHub `development` environment with the development-only `SUPABASE_PROJECT_REF`, `SUPABASE_URL`, `VITE_SUPABASE_URL`, anon key, service-role key, DB password and access token. Never copy development credentials into the production environment.
4. Apply the reviewed migration history to the new development database and run the database/financial gates against it. Do not copy resident/payment production rows into development.
5. Point the development Worker and `preview.mihabitta.com` build to the development Supabase project.
6. Run Development Release Apply using `SEPARATE-DEVELOPMENT-DATABASE`. The workflow will reject the old shared-database phrase once the project ref differs from production.
7. Re-enable the production-only notification/cron behavior that is intentionally restricted while both environments share one database, following `docs/PROJECT-DECISIONS.md` and the notification configuration validator.
8. Validate auth redirects, invitations, documents, payments and financial E2E before considering the cutover complete.

## Rollback

If development cutover fails, roll back the development Worker/Pages deployment only. Do not point development back at production merely to get preview working. Fix the separate development configuration or use Supabase local until the cloud development environment is healthy.
