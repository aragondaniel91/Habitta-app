# HABITTA — Financial Truth Foundation (HAB-FINANCIAL-TRUTH-001)

- **Date:** 2026-10-23 (Founder authorization)
- **Production baseline:** `3ed393b0cb034c49ba0a2e62020bafc4f6cba740`
- **Related work:** pilot epic #515, CxC/Treasury #519, Supabase grants #528
- **Change boundary:** Non-destructive financial-regression tests and source-of-truth inventory. No schema, data migration, RPC contract, frontend behavior, automatic credit application, or production configuration changes in this delivery.

## 1. Authority and ownership of money

| Domain | Authoritative source | What may read it |
| --- | --- | --- |
| Posted obligation | `receivable_items` and its debit entry in `receivable_ledger_entries` | Scoped CxC and statement read models |
| Amount still due | Sum of **unreversed** debit and credit directions for each receivable item | `receivable_balances`, scoped API and UI |
| Proposed resident allocations | `payment_allocation_intents` | Draft owner and authorized reviewers after submission |
| Approved allocations | `payment_allocations` + payment-credit ledger entries | Receipt snapshot, reviewer, authorized resident |
| Unapplied payment credit | Payment-credit ledger entry with **null** `receivable_item_id`, scoped by condominium, unit and currency | Financial authority; not silently applied to another invoice |
| Correction/refund-like reversal | Audited compensating ledger entry pointing to original `reversal_of_entry_id` | Financial authority and scoped reports |
| Unit running account | `get_unit_statement` over authorized ledger entries | Resident or authorized staff for **that unit** |
| Aggregate CxC | `get_receivables_summary` / aging RPCs over authorized records | Approved role and tenancy boundary |

**Non-equivalences:** a payment draft is not money received in the ledger; submission is not approval; an allocation proposal is not an approved allocation; a credit entry not tied to a receivable is not a reusable-credit service; a chronological account statement is not the collection operations workspace. Aggregate net balance, charge-specific outstanding, and unapplied credit should not be mislabeled as interchangeable.

## 2. Proven pilot scenarios

`supabase/tests/payments.sql` adds 29 transaction-rolled-back pgTAP regressions using existing authorized admin/reviewer/owner fixtures:

1. **Charge USD 12 / draft USD 5:** original charge stays 12; no ledger write.
2. **Submit USD 5:** no ledger write, and charge remains outstanding.
3. **Approve USD 5:** exactly 5 recorded as a payment allocation; ledger **and** RLS-scoped `receivable_balances` show USD 7. Original posted amount stays USD 12. The authorized `get_unit_statement` exposes a single USD 5 credit.
4. **Retry approval:** one allocation, no duplicate credit or additional receipt.
5. **Charge USD 4.50 / payment USD 5:** approve an allocation for 4.50; the charge's balance is 0; an independent 0.50 credit entry exists and the immutable receipt snapshots `unapplied_credit: "0.50"`.
6. **Retry and reversal:** no duplicate credit; compensating entries cancel the allocated and unapplied credits. Ledger and the CxC view again show the original USD 4.50 outstanding.
7. **All test writes execute inside a database transaction and end in `ROLLBACK`.** Never replay the fixture outside an isolated test database.

### Local evidence and limits

The 29/29 **focused** pgTAP assertions passed on the dedicated, non-production Docker container `hab_test_p2b_pgtap`. The entire legacy `payments.sql` suite cannot be accepted as a green run on that older container because its `record_payment_proof` function rejects INSERT due to an old function body. The current source contains a newer, corrected function in migration `20261019130000_hab_pilot_pending_proof_replacement.sql`.

**Required next proof:** run **all** pgTAP/CI/Financial E2E/Playwright on a newly migrated database from exact PR HEAD; never declare the branch complete on focused tests alone. Do not change the old QA container to silence the failure. CI is the authoritative clean-build check.

## 3. Known functional gaps: do not confuse with unimplemented foundations

- **Resident overpayment UX:** `ResidentPaymentWizard.tsx` currently validates `proposedCents <= fullTotalCents`; it cannot submit USD 5 against USD 4.50 solely through this wizard.
- **Credit reuse lifecycle:** the database can record unused money but the verified code does not establish an end-to-end, single-use, RBAC-controlled flow for applying the 0.50 to a later obligation. Before implementing, explicitly define eligible owner/unit/condominium/currency, credit balance and reservations, posting/reversal timing, duplicate prevention and receipt/audit linkage. Transfers across units, exchange rates, or external refunds need a separate Founder business decision.
- **Reconciliation reporting:** closed treasury periods and matching already exist; bank-statement-like export and distinct auxiliary/general ledger views require verified coverage and incremental implementation.
- **Navigation:** Units ↔ People is released; collection drilldowns, filtered dashboard shortcuts and multi-person debtor lookup require scoped behavior.
- **Performance:** measure p75/p95 for real CxC/Cuotas/Pagos/Gastos requests and UI hydration before changing queries. No fabricated performance claims.

## 4. Contract for future HABITTA AI (read-only first)

An AI explanation of a fee, statement, payment or balance must be generated from **authorized, versioned server-side query tools** using the same canonical financial read models as the app. Every monetary response should contain:

- Condominium and permitted unit/person scope; authorized user and role checked server-side.
- Period and effective date (explicit timezone/cutoff), original charge, payment status, **approved** applications and credits, currency, and deterministic decimal calculation.
- Source IDs and traceable references (charge, ledger entries, payment/receipt); no invented allocation or blended currencies.
- Explicit distinction between *original charge*, *still due*, *in review*, *unapplied credit* and *statement balance*.
- An honest refusal/uncertainty when financial evidence, accounting policy or authorization is missing. No guessed reasons for changes.
- No generative SQL across tenant data, no service-role secrets in browsers, no unsupervised monetary mutations, no model-computed totals that contradict the ledger.

**AI integration gate:** Clean migration rebuild, pgTAP and cross-tenant RLS/GRANT regression, E2E by resident/admin/board, reconciliation of dashboard/CxC/statement balances, deterministic source-to-answer tests, independent SDP review, Founder acceptance.

## 5. Release and security boundary

Treat Supabase's October 30 grant-default change as a separate, high-priority #528 audit: least-privilege GRANT, RLS on exposed objects, invoker views, explicit audited definer functions, and positive/negative tenant tests. Never fix access by broadly granting `anon` or bypassing RLS.

This delivery **does not** authorize automatic credits, changing existing financial policies, merging code without green gates, or a production database migration. Tests and evidence only.
