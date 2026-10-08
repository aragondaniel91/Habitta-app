# Financial lifecycle T1 findings

## Fixed: payment authorization is surfaced as forbidden

- Reproduction: invoke each payment mutation as an authenticated principal that its RPC rejects with SQLSTATE `42501`.
- Actual before the correction: the Worker treated most RPC errors as `409 {"error":"Request conflict"}`; the approval-only regression depended on `P0001` and the literal `approval denied` message.
- Outcome: **reproduced and fixed**. `responseJson` now maps the database authorization SQLSTATE, not an error message. Regression coverage exercises create, update, submit, all three review transitions, approval, and reversal with a changed authorization message and confirms `403 {"error":"Forbidden"}` for each.
- Database disposition: payment-submission, payment-update, payment-review, payment-approval, payment-reversal, allocation-preview, and payment-treasury-selection authorization paths raise `42501`; non-authorization validation and lifecycle failures retain their domain error behavior.

## Lifecycle evidence inspected

The following paths were inspected in `supabase/migrations/20260726000920_manual_payments_completion.sql`, `supabase/migrations/20260825041500_hab322_tenant_purge_no_global_locks.sql`, and `supabase/tests/payments.sql`. They were **checked and found sound**; this remediation does not alter their business behavior.

| Concern | Inspection / reproduction | Outcome |
| --- | --- | --- |
| Duplicate and retry | `create_payment_draft` locks `(condominium_id, idempotency_key)`, returns a matching retry, and rejects changed retry payloads with `23505`; `payments.sql` asserts repeated approval produces no duplicate credit or receipt. | Checked and found sound. |
| Stale allocation previews | `preview_payment_allocation` is read-only, while approval calls `validate_payment_allocations(..., true)` under row locks before writing. `payments.sql` asserts preview writes no allocation and invalid/over-applied proposals return errors. | Checked and found sound. |
| Partial allocation and unapplied credit | Approval records allocated credits and a separate remaining payment credit; `payments.sql` verifies a partial application leaves the expected receivable balance and `40.00` unapplied credit. | Checked and found sound. |
| Receipts | Approval creates one sequence-backed receipt; retries return the existing receipt. Tests assert one receipt, a unique sequence number, and immutable receipt data. | Checked and found sound. |
| Reconciliation and reversal | Payment credits are immutable ledger entries; reversal writes one opposite entry per credit and preserves allocations/receipts. Tests verify reversal count, reversal uniqueness, and that a receivable can reverse only after its payment credit reverses. | Checked and found sound. |
| Overdraft protection | Allocation validation rejects an amount above current outstanding and approval revalidates with locks. `payments.sql` exercises the over-application proposal and expects an error. | Checked and found sound. |
| FROZEN-27 balance paths | The HAB-322 payment treasury selection guard remains tenant-scoped and lifecycle-limited; `hab127_treasury_financial_links.sql` reproduces a non-reviewer account selection and asserts SQLSTATE `42501`. No balance calculation or mutation was changed. | Checked and found sound. |

## MISSING: processor-initiated monetary refunds

The condominium collection lifecycle supports additive payment reversal, including reversal of allocation credits and the linked Treasury movement. It does not expose a separate processor-initiated refund operation. No approved rule in this workspace defines its settlement source, approval authority, receipt treatment, or relationship to an external payment provider, so no refund behavior was inferred or implemented. The genuine ambiguity is whether “refund” means the existing accounting reversal or an outbound processor settlement; the latter remains **MISSING**.


## Direct follow-up: 2026-10-03

User explicitly authorized direct Habitta work with tests and independent review; no push, deployment, frozen-contract changes or final acceptance.

Delivery Status: TESTED. Audit Classification: COMPLETE for the two remaining review findings only; overall Payments + Treasury delivery remains PARTIAL.

- Formatted TreasuryDrawers.tsx with the existing project Prettier. No validation policy changes.
- Restored the exact HEAD tenant-only create_payment_draft denial assertion alongside the newer authorization regressions; payments.sql now plans 97 assertions.
- Fresh pnpm test: PASS across five packages; web reports 146 files and 806 tests passing.
- Fresh pnpm typecheck and pnpm lint: PASS across five packages.
- Scoped Prettier check and git diff --check: PASS. A repository-wide formatting pass was not performed.
- Full pgTAP verification: PASS in an ephemeral Supabase copy (CLI 2.84.2), 2026-10-03T16:17:40.637Z. Startup, tests and cleanup all succeeded. Test stdout SHA256: 498DAD86BA5AF51E90D465731EDA48B58EDB405A8C1AC25FA69979DD4B7CF6BB.
- Independent Claude static follow-up review: PASS, no blocking findings. Reviewer did not run tests; runtime test results above were produced separately.
- Earlier public integration and security evidence passed before these formatting/test-only edits; neither is presented as a newly executed check.

Brain historical mission records were not overwritten or accepted. This closes the two specific remaining findings, not root T2/T3, visual UX validation, pilot certification or Founder Accept.
