# Habitta observability runbook

## Scope

Habitta uses Cloudflare Workers Observability as the first-line production error store. The API emits structured events and the browser forwards a narrow, sanitized error payload to the Worker.

No request bodies, authorization headers, access tokens, email addresses, payment amounts, proof contents, or query-string values should be written to observability logs.

## Correlation IDs

Every HTTP request receives a server-generated `X-Request-Id`. Sanitized API error responses also include the same value as `requestId` in JSON.

When a user reports a failure, capture the request ID when available and use it as the primary search key in Workers Logs.

## Structured events

Search for these `event` values:

- `worker_error` — an exception reached the outer Worker error handler.
- `application_5xx` — the inner Hono application converted an exception/failure into a generic 5xx response.
- `postgrest_error` — Supabase/PostgREST returned an error response. Only the PostgREST error code is logged; its raw message/details are intentionally excluded.
- `client_error` — the web application reported an uncaught `error` or `unhandledrejection` event.

Each event carries the correlation ID plus deployment context such as environment, commit and app version when those bindings are present.

## Triage

1. Open the Cloudflare dashboard for the affected Worker and navigate to Workers Logs / Observability.
2. Filter by `requestId` when one is available.
3. Otherwise filter by `event`, `environment`, `commit`, `path` and the incident time window.
4. For an exception outcome, correlate the platform exception record with Habitta's structured `worker_error` or `application_5xx` event.
5. For client-only failures, use `client_error`, then correlate its commit/path/time with nearby API errors.
6. Do not copy sensitive customer or financial data into incident notes. Use internal entity IDs only when they are already available through an authorized operational view.

## Client telemetry abuse controls

`POST /telemetry/client-error` is intentionally available before authentication so login and signup failures are observable. It is protected by:

- the same production CORS origin allowlist as the rest of the API;
- JSON-only input;
- a 4 KiB body limit;
- a narrow event contract;
- server-side sanitization and truncation;
- the `TELEMETRY_LIMIT` Cloudflare rate limiter keyed by connecting IP.

If client telemetry traffic spikes, inspect the rate-limit behavior before increasing the limit. Do not weaken the origin, size, or sanitization guards to improve ingestion volume.

## Privacy check after changes

Any change that adds an observability field must answer all of these before merge:

- Can it contain an authorization token or session identifier?
- Can it contain an email address or other direct personal identifier?
- Can it contain a payment amount, bank reference, payment proof, or uploaded document content?
- Can it include a URL query string or fragment?

If any answer is yes or uncertain, do not log the field. Log a non-sensitive category/code instead.
