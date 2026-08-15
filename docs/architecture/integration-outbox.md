# Integration outbox foundation

Habitta uses PostgreSQL as the durable source of truth and Cloudflare Queues as asynchronous transport.

## Guarantees

- Domain writes and their integration event are committed atomically in PostgreSQL.
- Queue messages contain only the durable outbox identifier, never credentials or private document bodies.
- Consumers are idempotent because Cloudflare Queues delivery is at-least-once.
- Retry exhaustion is routed to a configured dead-letter queue instead of being silently discarded.
- Integration processing is condominium-scoped and correlation IDs are server-generated.
- Provider credentials and public webhook destinations are deliberately out of scope for this foundation.

## Lifecycle

1. A trusted database function inserts a pending outbox event in the same transaction as the domain change.
2. The scheduled Worker claims due events.
3. The Worker sends `{ outboxId }` to the integration queue and marks the transport publication.
4. The queue consumer claims the durable event idempotently and completes the internal transport boundary.
5. Future provider adapters will fan out from the consumed event into separate delivery records with their own retries, signing, health and diagnostics.

## Safety boundary

The foundation must not expose browser writes to the outbox, public webhook registration, third-party credentials, or provider calls. Those capabilities require explicit authorization, signing and audit controls before they are enabled.
