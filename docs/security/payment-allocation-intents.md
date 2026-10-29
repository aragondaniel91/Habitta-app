# Resident payment allocation intents

HAB-PILOT-002-P1 stores a resident's selected same-currency receivables in
`payment_allocation_intents`. This is a review proposal only: it creates neither a
`payment_allocations` row nor a receivable-ledger entry. The existing reviewer approval path is
the only path that can create either immutable financial record.

The migration `20261018130000_hab_pilot_payment_allocation_intents.sql` depends on the R6
draft-privacy migrations (`20261018120000`, `20261018121000`, and `20261018122000`). It calls
R6's `can_manage_payment_draft` authorization boundary and must remain ordered after them. An
environment missing that database sequence fails safely: the UI does not claim that any charge was
applied.

`20261028230000_hab_pilot_payment_allocation_intent_input_guard.sql` additionally validates the
direct authenticated-RPC boundary: each proposal must contain a valid UUID, uppercase currency
codes and positive amounts with at most two decimal places. This keeps malformed or sub-cent JSON
out of the reviewer workflow even when a caller bypasses the HTTP schema. Drafts and
`correction_requested` payments remain the only mutable states; submitted and in-review proposals
are read-only until a reviewer requests correction.
