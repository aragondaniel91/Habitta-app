# Payment proof retention and R2 lifecycle

## Policy

Habitta treats payment-proof metadata as financial/audit evidence and the R2 object as the retained
supporting document.

- The current proof for a payment is retained while the payment/condominium exists.
- A superseded proof remains in R2 for **10 years from `superseded_at`**.
- After ten years, only a superseded proof with another active proof for the same payment is eligible
  for scheduled byte cleanup.
- Cleanup never deletes the `public.payment_proofs` row. Filename, SHA-256, uploader, timestamps and
  supersession linkage remain immutable for audit history.
- Condominium/unit owner-authorized deletion workflows remain separate and continue to own complete
  tenant-data cleanup semantics.

This is a conservative Habitta product-retention policy for Venezuela. The Ley de Propiedad
Horizontal requires condominium administrators to preserve supporting vouchers for administration
records, while Article 44 of the Venezuelan Código de Comercio uses ten years for accounting books
and their supporting vouchers. The policy is intentionally not shortened merely to reduce R2 cost.

## Runtime flow

The Cloudflare scheduled handler runs `runPaymentProofRetentionCleanup` alongside the existing
notification/integration scheduled work.

1. `list_expired_payment_proof_objects(100)` returns only eligible superseded objects.
2. The Worker deletes R2 objects with bounded concurrency (`5`).
3. `record_payment_proof_storage_cleanup` records success/failure in
   `habitta_internal.payment_proof_storage_lifecycle`.
4. Failed cleanup remains eligible for a later retry.
5. A successful cleanup is no longer returned in future batches.

R2 deletion is idempotent. If the object was removed but the audit RPC failed, the next scheduled run
may delete the same key again and then record success; it must never recreate or mutate proof history.

## Security boundary

The cleanup RPCs are `SECURITY DEFINER` only because the lifecycle state lives in the non-exposed
`habitta_internal` schema. They use an empty `search_path`, schema-qualify every relation, revoke
execution from `public`, `anon` and `authenticated`, and grant execution only to `service_role`.
Browser code never receives service-role credentials and cannot invoke cleanup.

## Failure diagnosis

Search Worker logs for:

- `payment_proof_retention_cleanup_failed`
- `payment_proof_retention_cleanup_audit_failed`

Logs contain the proof UUID and error class only; they do not log the R2 object key, original filename
or resident/payment details.

For a proof UUID, inspect the internal lifecycle row from a trusted database session. A non-null
`deleted_at` means R2 byte cleanup was recorded as successful. `attempt_count`, `last_attempt_at` and
`last_error_code` provide retry history without modifying `public.payment_proofs`.

## Verification before release

Required gates:

- CI / formatting / lint / typecheck / unit tests
- Supabase Database Tests / pgTAP
- Playwright Browser Tests
- Financial E2E

The pgTAP regression must prove that active proofs are never eligible, proofs superseded for less
than ten years remain retained, failures are retryable, successful cleanup stops reappearing, and the
immutable proof metadata row survives byte cleanup.
