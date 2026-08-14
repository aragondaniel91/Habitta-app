# Financial 5xx observability

Habitta treats 5xx responses on payments, treasury and expenses as critical pilot signals. The API emits structured, sanitized log events so an operator can find the failure without exposing request bodies, bearer tokens, JWTs, email addresses or document contents.

## Events

### `worker_error`

Emitted when the Worker or the composed application throws an exception. The event contains:

- server-owned `requestId`;
- environment, build commit and application version;
- HTTP method and sanitized pathname;
- sanitized error name, message and stack.

The sanitization removes bearer credentials, JWT-looking values, email addresses and URL query/hash data. Messages and stacks are length bounded.

### `critical_financial_5xx`

Emitted for status 500-599 on these route families:

- `payments`
- `treasury`
- `expenses`

The event deliberately stores only the route family, not a payment ID, expense ID, account ID, request body or authorization header. When a thrown error is available, sanitized name/message/stack are attached.

## Cloudflare pilot workflow

Workers Logs is enabled in `wrangler.jsonc` through `observability.enabled`. Cloudflare Workers Logs collects custom logs, errors and uncaught exceptions, and the Observability Query Builder can filter and group 5xx responses.

Create and star/save these production queries in the Cloudflare Observability dashboard:

1. `critical_financial_5xx` grouped by `route`, `status` and `commit` for the last 15 minutes.
2. `worker_error` grouped by `path`, `name` and `commit` for the last hour.
3. Worker invocation status 500-599 grouped by request path and status as a backstop against missing application logs.

During the external pilot, treat either of these as an incident trigger:

- any `critical_financial_5xx` affecting a user-visible payment/treasury/expense action;
- two or more `critical_financial_5xx` events for the same route family within 15 minutes;
- a repeated `worker_error` on the same build commit.

Cloudflare's native Advanced Error Rate Alert is an Enterprise feature, so it is not the free-plan pilot dependency. If unattended push alerts are required, export Workers telemetry using Cloudflare's supported OpenTelemetry export to an alerting backend such as Grafana Cloud or Axiom. That changes the alert destination, not Habitta's structured event contract.

## Investigation

1. Open Workers & Pages → `habitta-api-prod` → Logs/Observability.
2. Filter `event = critical_financial_5xx` and copy the `requestId`, `route`, `status`, `commit` and timestamp.
3. Search the same `requestId` for the paired `worker_error`, `application_5xx` or `postgrest_error` event.
4. Compare the logged `commit` with `/health`. If they differ, stop and verify which release is serving traffic.
5. If `postgrest_error` exists, use its PostgREST error code plus the request route to inspect the relevant database/RPC path. Do not add database messages to the public response.
6. If a sanitized stack exists, use it to identify the code path. Never ask a resident to send an authorization token or full proof document to correlate the incident.
7. Reproduce in development/QA with non-production data, add a regression test, and deploy through the normal PR gates.

## Escalation and rollback

A financial 5xx is not permission to modify ledger rows manually. Preserve the existing financial state machine and audit trail. If the error was introduced by the current release and materially blocks payment, treasury or expense operations, use the normal production rollback/release procedure to a previously validated main commit, then fix through a new PR.

## References

Cloudflare documentation verified for this runbook in August 2026:

- Workers Logs collects invocation logs, custom logs, errors and uncaught exceptions.
- Workers Observability Query Builder supports filtering/grouping 5xx responses by request path/status.
- Advanced Error Rate Alerts are Enterprise-only.
- Cloudflare supports exporting Workers OpenTelemetry data to Grafana Cloud and Axiom for external dashboards and alerts.
