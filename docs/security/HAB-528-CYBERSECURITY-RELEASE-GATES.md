# HABITTA — Cybersecurity release assurance (HAB-528)

**Status: OPEN — security assessment NOT completed.** This document defines mandatory evidence, not a security certification. Applies to every commercial release and every tenant tier.

## Threat model and exposed trust boundaries

1. Browser/PWA and eventual native clients ↔ Cloudflare Worker API ↔ Supabase Postgres/Auth/Storage.
2. Tenant boundary (organization / condominium / building / unit), owners, tenants, delegates, administrators and service personnel.
3. Payments, bank evidence, approvals, corrections, treasury ledger and billing.
4. Public website, invitations, tokenized links, background workers, webhooks and integrations.
5. CI/CD identities, GitHub Actions, dependencies, signing keys, credentials and infrastructure configuration.

## Required security gates

| Gate | Minimum evidence | Failure consequence |
| --- | --- | --- |
| Identity & access | JWT and session expiry, MFA/admin recovery, privilege transitions, authenticated and unauthenticated negative tests | Critical/high unresolved: BLOCK |
| Tenant isolation | Authenticated cross-org/condominium/unit BOLA/IDOR read/write negative tests across API, RPC, Storage and reports | Any reproducible cross-tenant access: BLOCK |
| Database | Effective GRANT/REVOKE/PUBLIC/default ACL inventory, RLS/policy tests, SECURITY DEFINER review with full function signatures and approved public allowlist; migration drift | Unclassified privileged public mutation: BLOCK |
| Web/API | OWASP Top 10 incl. injection, XSS, CSRF, CORS, SSRF, mass assignment, resource exhaustion, pagination abuse and response data minimization | Exploitable critical/high: BLOCK |
| Finance | Independent approvals, double-submit/replay, idempotency, immutable ledger, race conditions, proof/document authorization, reversal authorization | Unauthorized monetary state transition: BLOCK |
| Supply chain & infrastructure | Secrets scan, dependency advisories/SBOM, least privilege CI, Cloudflare/Supabase credentials, branch protection and deployment approvals | Leaked active secret or privileged CI abuse: BLOCK |
| Detection/recovery | Audit completeness, actionable alerts, incident response contacts, backup + **verified restore drill**, migration rollback and post-deploy smoke | Unrecoverable critical data path: BLOCK |
| Privacy/data lifecycle | Data minimization, retention, export/delete authorization and isolation, sensitive logs/storage access controls | Critical/high data disclosure: BLOCK |

## Evidence requirements (per release SHA)

- Record scope/assets, production-equivalent test environment, threats, exact SHA, test commands, output, failures, mitigations and residual risk.
- Finding register: ID, severity, vulnerable boundary, reproducible steps using synthetic/test tenants only, remediation owner, fix PR, regression proof, independent reviewer, closure status.
- Run controlled adversarial testing only on authorized isolated/preview environments, with synthetic identities and data. Production receives non-invasive read-only inventory and approved smoke tests; no destructive probing or exploit traffic.
- Automate safe checks in CI when possible, but **green CI is not a substitute for threat modeling, code review, authenticated E2E and penetration testing**.
- No production promotion if critical/high findings are unresolved unless Founder explicitly accepts a bounded residual risk in a recorded decision; active exploitable cross-tenant/financial vulnerabilities must be fixed before release.
- Independently approve production migration preflight, grants/default privileges, rollback readiness and release gates.

## Present baseline (not signoff)

- PRs #559, #561, #562, #563 and #564 were merged into main.
- Production read-only audit found 127 public tables with RLS and two views with security_invoker. Inventory reported 202 anon-executable SECURITY DEFINER functions and 27 mutable search_path warnings; these are **not individually cleared**.
- Existing pgTAP guards cover table/view baseline, charge-scope ACL and several privileged RPCs; no comprehensive exposed-RPC allowlist or authenticated cross-tenant red-team E2E evidence has been established here.
- Security issue #528 remains open and production promotion blocked.

## Immediate delivery backlog

1. Collect exact inventory of all exposed RPC signatures and default ACL grants in authorized environment; classify all anon executables. Protect reviewed Class A signatures using CI inventory drift guard.
2. Validate cross-tenant negative tests for organization/condominium/building/unit, resident payments and storage.
3. Review 27 search_path warnings and dependency call paths; prioritize security definer exposure.
4. Run supply chain/secrets and Cloudflare Worker route hardening checks, then independent adversarial review.
5. Conduct pre-release backup/restore and post-deploy validation rehearsal; record release decision.
