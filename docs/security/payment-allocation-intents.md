# Resident payment allocation intents

HAB-PILOT-002-P1 stores a resident's selected same-currency receivables in
`payment_allocation_intents`. This is a review proposal only: it creates neither a
`payment_allocations` row nor a receivable-ledger entry. The existing reviewer approval path is
the only path that can create either immutable financial record.

The migration `20261018130000_hab_pilot_payment_allocation_intents.sql` depends on the pending R6
draft-privacy DB acceptance migrations (`20261018120000`, `20261018121000`, and
`20261018122000`). It calls R6's `can_manage_payment_draft` authorization boundary and must not be
accepted or applied ahead of those migrations. Until that database sequence is accepted, the UI is
not expected to submit payment intents in an environment where the RPC is absent; it fails safely
without claiming that any charge was applied.
