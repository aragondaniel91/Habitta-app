# Payment connector adapters (future)

Phase 1 is a catalog and audited configuration boundary only. Every catalog entry and saved connection is `PENDING` or `DISABLED`; neither state can collect, settle, confirm, reconcile, or create a financial record.

## Adapter contract

A future server-only adapter must implement `describeCapabilities(country)`, `beginConnection(scope)`, `disableConnection(connection)`, and `verifyProviderEvent(rawRequest)`. It receives an opaque connection id, never browser-provided credentials. It must return an explicit non-operational state until its provider-side verification has completed. Payment ingestion, if approved later, must enter the existing governed payment-review lifecycle rather than insert payments, allocations, receipts, or ledger entries directly.

## Secret boundary

Provider API keys, OAuth tokens, private keys, and webhook signing secrets are excluded from this repository and database schema. A separately approved secrets-vault implementation must use a server-side vault reference keyed by connection id, audited access, rotation and revocation, and signed webhook verification. It must not expose values through PostgREST, RPC results, logs, browser bundles, or audit metadata.
