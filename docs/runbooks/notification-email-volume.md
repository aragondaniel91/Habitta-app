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

### Explicit exception: administrator invitations

Administrator invitations are not notification fan-out. They are intentional transactional messages initiated by an authenticated condominium administrator from **Equipo y accesos**. For that reason they do **not** consult the condominium `live_email_enabled` opt-in that controls automatic/bulk notification delivery.

This exception is intentionally narrow:

- the caller must authenticate through the normal `/v1/*` API boundary;
- `create_admin_invitation` verifies the caller can administer the target condominium;
- Cloudflare `INVITATION_LIMIT` rejects abuse before token generation or email delivery;
- the database trigger independently caps administrator invitations at 20 per actor in 15 minutes;
- production live mode sends only to the email stored on that invitation; sandbox mode redirects to the configured sandbox recipient;
- the result is written to `admin_invitation_events` as `email_sent`, `email_failed` or `email_disabled`;
- delivery audit metadata records provider/mode/result metadata but does not duplicate the recipient address;
- the invitation keeps its secure backup link even if provider delivery fails.

The invitation route must never be reused as a generic email endpoint, and notification expansion/queue code must never call it to bypass HAB-130. Normal notification events continue through `notification_deliveries` and remain subject to the live-email gate and recipient preference checks.

## Operational checks

When investigating delayed email:

1. Confirm whether the message is normal notification fan-out or an explicit administrator invitation.
2. For normal fan-out, confirm the condominium has `live_email_enabled` and `email_enabled` enabled.
3. Inspect `notification_deliveries.status`, `next_attempt_at`, `attempts` and `last_error_code`.
4. For a volume-window event, confirm `next_attempt_at` has reached the next 15-minute boundary.
5. If a backlog exists, remember that only five deliveries from that condominium can enter the queue on each five-minute scheduler cycle.
6. For an administrator invitation, inspect the invitation lifecycle and `admin_invitation_events` delivery event instead of `notification_deliveries`.
7. Do not manually set deliveries to `sent`. Preserve the normal claim/queue/provider completion path so deduplication and retries remain valid.
