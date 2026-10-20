# Payment-event draft privacy

`payment_events.metadata` and `reason` contain internal audit and review information. As of HAB-PILOT-001-R5, direct reads require both the original reviewer-only `can_review_payments(condominium_id)` audience and invoker visibility of the parent `payments` row. Residents and non-review staff cannot read events, including for their own payment; reviewers gain event access only once the parent payment is visible to them. An administrator can see a staff-owned draft only when the existing parent-payment policy permits it.

The API event route (`GET /v1/condominiums/:id/payments/:paymentId/events`) performs only the same authenticated PostgREST read, so it inherits that policy. The administrator audit RPC is security-definer and therefore applies the equivalent parent-payment predicate inside its source query, before feed sorting, limiting, and offsetting; it does not expose resident draft payment events to an administrator before submission or distort pagination around hidden events.

Remaining privileged exposure is intentional: `service_role` bypasses RLS and must remain limited to trusted server-side maintenance. Immutable event rows and the payment ledger are unchanged.
