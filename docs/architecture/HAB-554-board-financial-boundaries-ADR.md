# HAB-554 / HAB-555 — Decision draft: building boards and financial boundaries

**Status:** PROPOSED / awaiting independent architectural review and Founder financial-policy decision.
**Scope:** analysis only. No migrations, grants, RLS changes, live accounting, role assignments, or production release.

## Invariants (already established)

- Physical buildings and billable units are separate identities. General condominium `multi_building_complex` with `charge_scope=building` charges exactly one **billable building unit** per physical building. Never silently create an apartment debt in the general condominium.
- The authoritative money identity is `units.id`; boards are administrative principals/contacts, not implicit owners or debtors. Replacing a board member must not transfer or erase charges.
- The existing `set_condominium_charge_scope` RPC is authenticated, denies non-structure administrators, limits building scope to multi-building topology, and blocks changes after units exist. This ADR does not weaken those controls.
- Houses remain directly billable units, and an ordinary building condominium bills apartment units; neither must create phantom building-level financial accounts.
- Board mode does not grant access. Mode is a proposed *policy configuration*, with capabilities granted separately, verified server-side and enforced by PostgreSQL for data scopes.

## Terminology and explicit choices

| Concept | Identity | General residence | Autonomous building |
| --- | --- | --- | --- |
| Physical structure | Building | Building 1..10 | Same physical building |
| General receivable | Billable unit | One building unit for Building 1 | Liability/contact arrangement defined by general governance, not inferred from board |
| Internal apartment receivable | **Separate financial context if approved** | **Not** written to general residence ledger | Apartment unit within child condominium, or future subledger |
| Board | Membership + effective term | General board | Building board with building-specific appointment |
| Auth principal | Auth user + explicit grants | General permissions | Building/child-context permissions only |

**Founder decision required before financial implementation:** whether autonomous buildings are legally/operationally separate accounting entities, who is the debtor to the general condominium, who can pay that invoice, who owns bank balances, and whether any transfer between entities is a payment, settlement or journal entry.

## Modes: proposed capabilities, never automatic rights

| Action | Centralized | Hybrid | Autonomous |
| --- | --- | --- | --- |
| Read building directory and publicly shared notices | Via explicit access grant | Via explicit access grant | Via explicit access grant |
| Building board roster / tenure | General admin manages | Building board proposes, general admin verifies | Building board manages within approved scope |
| Building requests and communications | General team manages | Delegated workflow with escalation | Building team manages, optional escalation |
| General condominium fees / CxC | General authorized finance only | General authorized finance only | General authorized finance only |
| General building-unit receipts/payments | General authorized finance only | General authorized finance only | General authorized finance only |
| Apartment fees in an autonomous building | Not enabled | Not enabled by mode alone | Only inside separately approved child financial context |
| Bank accounts, refunds, reversals or exports | No implicit access | No implicit access | No implicit access |

Never expose financial balances, personally identifiable information, receipts or cross-building membership solely from the board directory. Prevent a board member for Building A from enumerating Building B.

## Options under study

### A. Explicitly linked child condominium per autonomous building — provisional preference **only if** separate legal/accounting books are required

Reuse the existing accounting, unit and payment contracts inside a fully separate child condominium, with apartments as its billable units. The general parent continues billing its **building unit** once. Linkage must be explicit and tenant-verified; do not assume the same organization owns both tenants, that a parent board can access child books, or that child leadership can view general finance.

Advantages: leverages tested unit-based CxC/payment flows and tenant-scoped policies; accounting and reversals are natively separated. Risks: organization tenancy and subscription billable-unit counts, duplicated onboarding, single-person context switching, child ownership and lifecycle, inter-entity receivable reconciliation, cash transfer classification, historic correction workflows, and cross-tenant RLS. A link cannot be a privilege shortcut.

Conditions before selecting A: verified same-authority organizational ownership rules; explicit pairwise agreement and authorization; unique and reversible link without cascading deletion; independent invoices/balances; validated admin/board term history; plan billing policy; negative RLS/pgTAP for parent-to-child and sibling denial; no auto-pay or mirrored ledger postings.

### B. Building-scoped subaccounts inside the general condominium

Advantages: one onboarding boundary and perhaps simpler user navigation. Risks: material changes to `units.id` receivable semantics, `charge_scope` guards, every financial aggregation/filter, payment allocation, billable plan counting, treasury, exports, accounting close and every RLS predicate. A simple `building_id` filter is not a safe financial boundary.

**Decision tendency:** do not introduce B into the established production money ledger without independent exhaustive financial certification. Choose A only if business policy confirms separate books; otherwise keep internal apartment charging out of scope while boards perform nonfinancial delegated operations.

## Permission design principles

1. Separate membership in an organization/condominium from board appointment, and separate appointment from delegated capabilities.
2. Every building-scoped read/write requires authenticated identity, condominium ownership, building belonging to that condominium, an active effective-dated appointment or grant, and an action-specific capability. Deny by default.
3. Server/API and Postgres must independently enforce it. Route hiding, demo context selector and client-selected IDs do not authorize anything.
4. Effective dates, maker/checker approval where needed, revocation, audit actor/reason, and board turnover must be explicit; previous invoices, allocations and receipts remain unchanged.
5. If new exposed tables or RPCs are authorized later: **explicit least-privilege GRANT, enabled RLS, secure per-action policies, cross-tenant denial**, and pgTAP regression per Supabase October 30 rule.

## Delivery gates — SDP

- **G0: founder policy** — decide child legal/financial identity, debtor/payee, banking and billable plan impact. Until resolved, no child ledger/membership automation.
- **G1: ADR review** — independent architect/security/financial reviewer verifies actual migrations, existing grants and API contracts. Resolve conflicts with current charge-scope constraints.
- **G2: design validation** — keep `/app/board-groups-preview` explicitly demo-only; review building/general/resident perspectives with existing minimal Habitta design and accessible dialogs.
- **G3: additive governance foundation** — separate reviewed PR; safe identities, active terms, explicit grants and audit. No money rights. Test cross-condominium and cross-building denial plus appointment expiry.
- **G4: optional child finance** — only after Founder approval of A/B; financial E2E with parent billing 10 buildings once, child apartment charging, duplicate guard, refunds, reconciliations, exports, treasury and subscription quotas. Zero silent ledger migration.
- **G5: release** — all CI, Supabase pgTAP, browser and independent reviewer green at exact SHA; staging verification and explicit release authorization.

## Rollback and retention

Before G4, disable navigation/feature flag and revoke delegated grants through audited operations; do not delete historical appointments. Child finance adoption needs a separately approved compensation/reconciliation strategy: never delete ledgers or silently detach children with unsettled receivables. Keep backward compatibility with direct apartment and house condominiums.

## Review questions to resolve

- Are child condominiums billed separately in SaaS plans? How are effective billable counts calculated without double billing?
- Can one Auth identity switch parent/child and multiple buildings without leaking data via cached queries, websocket subscriptions or exports?
- Is a building's board a financial contact, legal debtor, payment delegate or a combination explicitly appointed?
- Who approves board changes and handles disputes, dissolution, arrears and retroactive corrections?
- Can buildings operate hybrid administrative tasks without separate accounting? (Default proposal: yes, via explicit limited grants.)
