# Pilot 6: financial performance baseline

## Scope and verified pathology

The admin **Gastos / Expenses** initial screen previously called
`GET /v1/condominiums/:id/expenses`, whose Worker query used `select=*` with no `limit` or
`offset`.  This downloaded the complete tenant expense catalog before the browser applied its
filters. Payments already uses a paginated history endpoint; this pilot fixes the matching
Expenses path rather than changing ledger, role, or RLS behavior.

## Repair

- `GET /expenses?page=1` opts into a page of 50 rows (or accepts explicit `pageSize` 1--100),
  sends the caller JWT to Supabase, retains condominium/status/currency predicates, requests
  an exact count, and uses stable `expense_date.desc,created_at.desc,id.desc` ordering.
  **Compatibility:** `GET /expenses` without either pagination parameter preserves the original
  array response for `MaintenanceFinancialWorkspace`. That legacy consumer remains unbounded;
  #6 cannot be considered fully closed until it is migrated separately.
- The Expenses UI requests that bounded page, passes status/currency and a **debounced
  300 ms description/invoice/reference search** to PostgREST before pagination (search is across
  the authorized tenant's full dataset, not only the first 50), keeps the existing server summary
  for all-catalog financial totals, and provides previous/next page controls. It retains the
  loading skeleton and cancels superseded fetches. Category-editor linked-expense counts are
  temporarily hidden rather than showing incorrect current-page-only totals; a true aggregate
  count is a separately tracked follow-up.
- No SQL migration was required. The request is still made with the authenticated caller token,
  so the existing Supabase RLS policies remain the tenant authorization boundary.

Initial-page waterfall (both versions issue these four independent requests concurrently):

```text
Expenses page mount
├─ expenses list: before 1 unbounded catalog request → after 1 bounded page request
├─ expense categories
├─ vendors
└─ expense summary
```

Thus the repair does not add round trips: it changes the list leg from every matching row to at
most 50 ordered rows. Per-expense events, attachments, and eligible treasury accounts remain
lazy requests made only when the user opens that expense; no N+1 list expansion is introduced.

## Reproducible local benchmark

Run:

```powershell
node scripts/performance/pilot-financial-expenses.mjs
```

The script serializes a deterministic 121-row representative fixture and applies a fixed
0.02 ms/byte local transport delay for 40 parallel samples. This isolates payload cost; it is
not an authenticated environment or production measurement.

Result on 2026-10-28 (Windows local):

| Scenario | List bytes | p75 | p95 |
| --- | ---: | ---: | ---: |
| Before: full 121-row catalog | 46,672 | 936.2 ms | 936.3 ms |
| After: first 50-row page plus metadata | 19,298 | 392.1 ms | 392.1 ms |

That is a 58.7% lower first-list payload and approximately 58.1% lower synthetic p75/p95 in this
method. It does **not** establish production p75/p95: real values depend on authenticated RLS,
Supabase response timing, cache state, network, and tenant cardinality.

## Regression coverage and validation commands

`apps/api/src/expense-list-pagination.test.ts` proves the Worker makes exactly one bounded,
tenant-scoped request with caller authorization, exact-count metadata, filters, and stable order;
it also verifies the legacy array contract remains intact without pagination parameters.
`apps/web/src/lib/api.test.ts` proves the page's `AbortSignal` reaches `fetch`; the Expenses
effect aborts that signal when server-side filters, page, tenant, or the component changes, preventing a
superseded request from updating the UI.

Intended validation commands:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @habitta/api test -- expense-list-pagination.test.ts
pnpm --filter @habitta/web test -- ExpensesPage.financial-summary.test.tsx
pnpm --filter @habitta/api typecheck
pnpm --filter @habitta/web typecheck
pnpm format:check
```

The first isolated agent attempt could not install dependencies from its offline package
cache. A subsequent package installation and the real local Vitest, TypeScript and formatting
checks are run as the integration verification gate before publishing this candidate. The
synthetic benchmark completed, but authenticated production p75/p95 remains unmeasured.
