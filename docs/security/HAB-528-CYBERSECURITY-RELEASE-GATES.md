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
- Production promotion requires every mandatory security gate to PASS. Critical/high findings are blockers subject only to the explicitly defined non-waivable STOPs and tightly controlled exceptions in **Release decision and accountability** below; a Founder-only waiver is invalid.
- Independently approve production migration preflight, grants/default privileges, rollback readiness and release gates.

## Release decision and accountability

- **Non-waivable STOP:** demonstrated cross-tenant unauthorized read/write, unauthorized financial state transition, an active compromised/leaked secret, or an unclassified anonymous-executable privileged mutation. Such exposure must be contained and fixed before any production release; a Founder signature cannot waive these release-blocking conditions.
- Other critical/high risks require remediation before release by default. Any bounded exception requires documented business justification, residual-risk owner, independent security-review approval, compensating controls, expiration date and linked tracking issue. Founder alone may accept business residual risk but may not self-certify security controls.
- Assign severity using CVSS v4.0 plus exploitability, tenant scope, sensitivity and financial impact. Critical: stop release and triage immediately, remediation by default; high: stop release until remediation by default. Critical/high exceptions, if any, must comply with the independent approval and non-waivable STOP criteria above; medium: owner and dated remediation plan; low: backlog with owner. A missing tested restore path or monitoring for core financial events is a non-waivable release STOP until established, irrespective of CVSS.
- Each gate **PASSES** only with linked per-release evidence, owner, independently verified test result and no blocking finding. Missing evidence = NOT VERIFIED, never PASS; any mandatory NOT VERIFIED or FAIL gate blocks production promotion. Maintain a restricted evidence register with retention policy and minimum access. Record scope, SHA, test environment and assumptions.
- Gate owners: engineering implements; security reviewer (a qualified human independent of the change author and release approver) validates; AI review is supplementary evidence, not a substitute for that human signoff; release engineer validates CI/rollback; Founder accepts bounded business risk and final commercial launch decision. A major release or a new trust boundary requires a new full adversarial assessment; each routine SHA receives a risk-based delta review; comprehensive assessment at least annually.
- Never expose vulnerability reproduction secrets or sensitive production ACL inventories in public issues. Maintain responsible disclosure contact / security.txt, incident owner, recovery point objective (RPO) and recovery time objective (RTO), and regulatory/privacy breach-notification escalation.

## Additional critical attack surfaces

- **Platform-admin across tenants:** enforce operator authorization, impersonation audit, least privilege, tenant overrides and emergency access expiry.
- **Stripe payment and webhooks:** signed-event verification, event replay prevention, idempotent processing, PCI responsibility and settlement reconciliation.
- **Auth:** redirect allowlists, OTP/magic-link rate limiting, enumeration resistance, leaked-password checks, refresh/session revocation after role removal.
- **Cloudflare Worker and Supabase service-role credentials:** secrets custody/rotation, blast-radius review, per-environment separation, endpoint abuse limits before login.
- **Storage and exports:** bucket RLS, signed URL expiry, file type/size/content validation and malware handling, spreadsheet formula injection, PDF injection and sensitive export authorization.
- **Web delivery:** CSP and headers, HTTPS transport, cookie flags, domain takeover controls for custom domain binding, SPF/DKIM/DMARC.
- **Supply chain:** GitHub Actions pinned to immutable SHA when practical, pull_request_target controls, restricted environment secrets, SBOM/advisory scanning and artifact provenance.
- **Operations and regulations:** encrypted backup passphrase custody, tested restoration/RPO/RTO, incident runbooks, vendor data processing and applicable privacy requirements.

## Present baseline (not signoff)

- Verified GitHub merges: #559 is a functional board-directory change (not security certification); #561–#564 introduce security regression tests and audit methodology. PR #560 closed without merge.
- Read-only production audit recorded in GitHub security issue #528 on 2026-10-26: 127 public tables with RLS, two views with security_invoker, 202 anon-executable and 306 authenticated-executable SECURITY DEFINER warnings, 27 mutable search_path warnings, 13 policyless RLS tables (informational), and a leaked-password-protection warning. None are automatically vulnerabilities or individually cleared.
- Existing pgTAP guards cover table/view baseline, charge-scope ACL and several privileged RPCs; no comprehensive exposed-RPC allowlist or authenticated cross-tenant red-team E2E evidence has been established here.
- Security issue #528 remains open and production promotion blocked.

## Existing evidence and tracked gaps

Review `supabase/tests/hab_sec_008_cross_tenant_recipients.sql`, `supabase/tests/hab_sec_009_rls_bypass_class.sql`, `supabase/tests/hab528_privileged_rpc_overload_grants.sql`, `.github/workflows/database-restore-drill.yml`, `.github/workflows/financial-e2e.yml`, and `docs/security/HAB-528-PRIVILEGED-RPC-TRIAGE.md`. Evidence exists in parts; comprehensive coverage, including platform-admin and authenticated nonmock attack tests, remains unverified.

## Immediate delivery backlog

1. Collect exact inventory of all exposed RPC signatures and default ACL grants in authorized environment; classify all anon executables. Protect reviewed Class A signatures using CI inventory drift guard.
2. Validate cross-tenant negative tests for organization/condominium/building/unit, resident payments and storage.
3. Review 27 search_path warnings and dependency call paths; prioritize security definer exposure.
4. Run supply chain/secrets and Cloudflare Worker route hardening checks, then independent adversarial review.
5. Conduct pre-release backup/restore and post-deploy validation rehearsal; record release decision.
