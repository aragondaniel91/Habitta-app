# Habitta end-to-end tests

This directory is intentionally isolated from the pnpm workspaces. It has its own reproducible npm lock so browser-test dependencies do not affect the application runtime or production bundle.

## Public suite

The public suite starts the local Vite application and validates the unauthenticated experience in desktop Chromium and a mobile Safari profile:

- sign-in screen renders without JavaScript errors;
- registration and password-recovery modes remain reachable;
- protected application routes do not expose administrative pages without a session.

Run it with:

```bash
npm ci --prefix e2e
npm --prefix e2e exec playwright install chromium
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
```

Authentication state files belong under `e2e/playwright/.auth/` and must never be committed. Playwright storage state can impersonate a test user.

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
