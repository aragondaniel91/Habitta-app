# API abuse controls

This note records the abuse controls that are enforced in application code and the controls that must remain environment-specific at the Cloudflare edge.

## Enforced in the Worker

- Payment proofs accept only JPEG, PNG, WebP, and PDF content types.
- Empty payment proofs are rejected.
- Payment proofs larger than 10 MB are rejected.
- The payment-proof upload checks authorization before storing metadata permanently.
- Production CORS accepts only origins configured through `CORS_ALLOWED_ORIGINS`; localhost is limited to non-production environments. This is decided in exactly one place, `http-security.ts`, and applied by `security-entry.ts`.
- PostgREST error codes and messages are written to private Worker logs; schema details are replaced publicly with a stable error plus a request ID.
- Cloudflare rate limiters, declared in `wrangler.jsonc` and applied per authenticated user, cover the three endpoints an abusive client would reach for:

  | Binding              | Endpoint                                  | Limit       |
  | -------------------- | ----------------------------------------- | ----------- |
  | `PROOF_UPLOAD_LIMIT` | `PUT /v1/condominiums/*/payments/*/proof` | 20 / minute |
  | `INVITATION_LIMIT`   | `POST /v1/condominiums/*/invitations`     | 10 / minute |
  | `REQUEST_LIMIT`      | `POST /v1/condominiums/*/requests`        | 30 / minute |

  The limits are enforced by the platform rather than counted inside the isolate, which could never hold a shared total. The proof check runs before the body is read, so a flood cannot make the Worker buffer 10 MB per attempt. A missing binding lets the request through: local runs and tests have no limiter, and failing closed there would break development without protecting anything. Exceeding a limit returns `429` with no detail beyond the status.

## Required before the first external pilot

Tune the thresholds against the pilot condominium's real workflow. The current numbers are deliberate starting points, not measured ones.

Still outstanding:

1. A limit on repeated unauthorized requests to `/v1/*`. The current limiters key on the authenticated user, so they do not apply before the bearer guard runs.
2. Confirmation that rate-limit events are observable without logging authorization tokens, request bodies, payment evidence, or personal data.
