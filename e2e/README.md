# Habitta end-to-end tests

This directory is intentionally isolated from the pnpm workspaces so browser-test dependencies do not affect the application runtime or production bundle. Playwright is pinned to an exact version and installed only inside `e2e/`.

## Public suite

The public suite starts the local Vite application and validates the unauthenticated experience in desktop Chromium and a mobile Chromium profile:

- sign-in screen renders without JavaScript errors;
- registration and password-recovery modes remain reachable;
- protected application routes do not expose administrative pages without a session.

Run it with:

```bash
npm ci --prefix e2e --ignore-scripts --no-audit --no-fund
npm --prefix e2e exec -- playwright install chromium
pnpm exec tsc -p e2e/tsconfig.json --noEmit
npm --prefix e2e run test:public
```

## Financial suite

The financial project must never use production credentials or a personal administrator account. It remains separate until an isolated fixture exists with:

- a dedicated test organization and condominium;
- an administrator/reviewer test account;
- a payer/resident test account;
- two tenants for cross-condominium isolation checks;
- deterministic units, charge concepts, payment methods, and opening state;
- a reset or cleanup operation keyed by the test run ID.

The initial readiness test requires these variables:

```text
E2E_BASE_URL
E2E_ADMIN_EMAIL
E2E_ADMIN_PASSWORD
E2E_CONDOMINIUM_NAME
E2E_FIXTURE_ID
```

`E2E_FIXTURE_ID` identifies the disposable dataset used by the run. The financial test code rejects `https://habitta-web-prod.pages.dev` even when credentials are provided.

Authentication state files belong under `e2e/playwright/.auth/` and must never be committed. Playwright storage state can impersonate a test user.

## Local Platform Admin suite

`platform-admin-local` is a test-only HAB-484/HAB-486 harness. With `E2E_BASE_URL` unset it serves the raw Platform Admin files on `127.0.0.1:4174`, generates an in-memory local `config.js`, seeds the existing browser session before navigation, and intercepts only that surface's Supabase and Worker requests. It uses no privileged credentials and makes no email delivery request or simulation.

The test submits the real onboarding form, uses future-relative invitation expiry, and covers pending, accepted, and completed onboarding rows along with Customer 360 and Comercial content/link navigation.

Run it with:

```bash
pnpm exec tsc -p e2e/tsconfig.json --noEmit
npm --prefix e2e exec -- playwright test --project=platform-admin-local
```

When `E2E_BASE_URL` is set, the harness does not start the local Platform Admin server. The local-only project probes `127.0.0.1:4174` and skips cleanly when it is unavailable; public projects retain their existing base URL and behavior.

## Planned financial flow

Once the isolated fixture is available, the financial suite will cover:

1. create a receivable;
2. confirm a pending payment does not alter the definitive balance;
3. register and submit a payment with private proof;
4. review and approve it with an authorized role;
5. confirm the receivable balance changes only after approval;
6. open the generated receipt;
7. exercise rejection/correction;
8. verify another condominium cannot read the records.

The reproducible fresh-clone bootstrap is:

```bash
pnpm install --frozen-lockfile
npm ci --prefix e2e --ignore-scripts --no-audit --no-fund
npm --prefix e2e exec -- playwright install chromium
pnpm exec tsc -p e2e/tsconfig.json --noEmit
npm --prefix e2e run test:public
```

The e2e package remains intentionally isolated from the pnpm workspace. Its dependency graph is fixed by `e2e/package-lock.json`; browser binaries are provisioned explicitly by the Playwright install command above. CI uses the same lockfile-backed install and provisions Chromium with `--with-deps`.
