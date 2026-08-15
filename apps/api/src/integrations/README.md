# Integrations

This module owns Habitta's asynchronous integration transport boundary.

Current scope is intentionally limited to durable outbox dispatch and idempotent queue consumption. External provider adapters, signed public webhooks, credential storage, retries per third-party destination and integration-health UI are separate increments built on top of this foundation.
