# API abuse controls

This note records the abuse controls that are enforced in application code and the controls that must remain environment-specific at the Cloudflare edge.

## Enforced in the Worker

- Payment proofs accept only JPEG, PNG, WebP, and PDF content types.
- Empty payment proofs are rejected.
- Payment proofs larger than 10 MB are rejected.
- The payment-proof upload checks authorization before storing metadata permanently.
- Production CORS accepts only origins configured through `CORS_ALLOWED_ORIGINS`; localhost is limited to non-production environments.
- PostgREST error codes and messages are written to private Worker logs; schema details are replaced publicly with a stable error plus a request ID.

## Required before the first external pilot

Configure distributed Cloudflare rate limits for the production Worker. Do not use an in-memory JavaScript counter because Worker isolates do not provide a reliable global limit.

Initial rules should cover at least:

1. `POST /v1/condominiums/*/invitations`
2. `PUT /v1/condominiums/*/payments/*/proof`
3. `POST /v1/condominiums/*/requests`
4. Repeated unauthorized requests to `/v1/*`

The thresholds must be tested with the pilot condominium's real workflow before enforcement. Rate-limit events should be observable without logging authorization tokens, request bodies, payment evidence, or personal data.
