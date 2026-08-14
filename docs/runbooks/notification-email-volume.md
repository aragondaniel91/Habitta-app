# Notification email volume policy

Habitta creates in-app notifications during notification-event expansion. Email is a separate delivery channel and must never delay or remove the in-app record.

## Pilot delivery classes

### Immediate email

These events are transactional or normally target a small set of people, so their email delivery is eligible immediately when condominium live email and the recipient preference allow it:

- `payment_submitted`
- `payment_correction_requested`
- `payment_rejected`
- `payment_approved`
- `payment_reversed`
- `payment_receipt_issued`
- `maintenance_quote_submitted`
- `maintenance_quote_approved`
- `maintenance_quote_rejected`
- `maintenance_evidence_added`
- `maintenance_expense_linked`
- `service_request_submitted`
- `service_request_assigned`
- `service_request_resident_attention`
- `service_request_resolved`
- `service_request_cancelled`

### Volume-window email

These events can fan out across many residents or be generated in bulk. Their in-app notification remains immediate, but email waits until the next 15-minute boundary:

- `receivable_created`
- `opening_balance_created`
- `receivable_due_soon`
- `receivable_overdue`
- `announcement_published`
- `governance_opened`
- `governance_due_soon`
- `governance_result_available`
- `governance_decision_final`

This is a delivery window, not a semantic digest: each existing delivery keeps its own deduplication key, template, retry state and provider idempotency contract. A future product digest may combine multiple events into one message without changing this safety budget.

## Scheduler send budget

The production scheduler runs every five minutes. A call to `claim_due_notification_deliveries` can queue:

- at most **5 deliveries per condominium per cycle**;
- at most **25 deliveries globally per cycle**.

Passing a larger `limit_count` cannot bypass the global cap. Due deliveries that are not selected remain `pending`/`retry` and are eligible on a later cycle; they are not dropped or marked sent.

Cloudflare Queue remains the transport after the database claim. Existing queue retry/dead-letter behavior and provider idempotency remain unchanged.

## Live-email safety

The HAB-130 condominium live-email gate still applies before queueing and again at delivery time. Disabling live email fails active deliveries closed. User email preferences are checked again immediately before provider delivery.

## Operational checks

When investigating delayed email:

1. Confirm the condominium has `live_email_enabled` and `email_enabled` enabled.
2. Inspect `notification_deliveries.status`, `next_attempt_at`, `attempts` and `last_error_code`.
3. For a volume-window event, confirm `next_attempt_at` has reached the next 15-minute boundary.
4. If a backlog exists, remember that only five deliveries from that condominium can enter the queue on each five-minute scheduler cycle.
5. Do not manually set deliveries to `sent`. Preserve the normal claim/queue/provider completion path so deduplication and retries remain valid.
