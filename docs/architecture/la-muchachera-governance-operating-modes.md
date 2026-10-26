# HAB-553 — Governance modes by building: architecture contract

**Status:** PROPOSED CONTRACT ONLY; not implemented or customer-ready. No new financial permissions, building-specific RLS, apartment dues, ledgers, or transfers are enabled by this document.

**Baseline:** PR #545 at `977746987533b4552333bec6fa804b7bfd72d3fd`; see `HAB-PILOT-004-billable-entity-model.md` and issues #550–#553. This contract is an additive proposal requiring separate design, migration, QA, security and Founder release gates.

## Founder intent and example

Residencias La Muchachera has ten physical buildings, each operated autonomously by its own junta. Habitta must also support centralized, hybrid and autonomous *governance* modes per building, including a residence with a mix of modes. One application, identity and context-sensitive workspaces; no parallel apps or implicit roles.

A governance mode is **not** a billing mode. All ten buildings remain ten separate `type=building` billing units in the *general condominium*, and current `condominiums.charge_scope='building'` continues unchanged regardless of each building's governance mode. The mode does not change `units.id`, financial debtor identity, ledger, historical allocations, commercial counts or organization tenancy.

| Governance mode | Building operation | General administration |
| --- | --- | --- |
| Centralized | Limited visibility and tasks through existing permissions; future specific delegated grants may extend these | Conducts general condominium operations with existing authorized roles |
| Hybrid | Future scoped tasks and approvals under explicit grants and thresholds | Retains shared services and delegated oversight |
| Autonomous | Future internal operation, board-led governance and optional internal finance features when separately built | Administers only general-residence services and building-level receivables, subject to existing role authority |

Mode configuration by building is a *future feature*, not a current database field or permission.

## Existing product and database constraints

1. **Tenancy:** an organization contains a condominium (`organization_id` / `condominium_id`). The ten physical buildings do not automatically become independent Supabase organizations or top-level tenants. New building-level scopes must enforce the existing organization/condominium boundary and an additional building authorization boundary where applicable.
2. **Existing financial identity:** one `public.units.id` billing account for each physical building in the general complex. Existing charges, receipts, allocations and statements are attached to those existing billable units. No parallel ledger for boards, no implicit copying general fees to apartments.
3. **Critical current prohibition:** when a condominium has `charge_scope='building'`, existing database guards **reject direct apartment/house billing units** in the same condominium. Thus a promise to bill apartments internally inside that current condominium is *not implemented and cannot be inferred from governance-mode configuration*.
4. **Internal building finance — future design gate:** if autonomous buildings need their own apartment dues, collections, bank funds and reports, architecture must first choose and validate a separate authorized accounting context (e.g. an explicitly linked subordinate condominium/administrative entity if legally and technically appropriate, or a new additive scoped-account model). The selection must establish ownership, tenant isolation, commercial plan counting, data lifecycle and cross-scope reconciliation. Do not introduce apartments in the existing building-charged condominium, rewrite history, or treat a second ledger as approved.
5. **Inter-scope settlement — future design gate:** the general residence's receivable against Edificio 1 and any eventual building-internal resident dues are distinct obligations. Any cash remittance between contexts needs authorized source/destination, traceable balanced entries, reconciliation, approval, idempotency and reversal handling. There is **no existing cross-scope settlement mechanism authorized here**.

## Boards, representatives and appointments

Future `Juntas y equipos` experience may configure condominium-wide board, one board per building, committees, offices (president/treasurer/secretary/vocal), term dates, authorized appointing body, audit trail, replacement and revocation. Names and contacts are **not** permissions and do not transfer ownership or `ownership_percentage`.

The current condominium membership roles are condominium-scoped, not building-scoped. A person may hold several roles or appointments in a future design, but changing the UI context must never elevate server-side access.

A future scoped-capability grant must identify organization, condominium, target building where relevant, principal, action, time window, limits, source of appointment, revocation status and independent approver. Revocation must supersede expired or concurrent appointments; no self-appointment or self-approval.

## Current authorization baseline and target separation

Current financial permissions are governed by functions including `can_manage_receivables`, `can_register_payment_for`, `can_review_payments`, `can_submit_payment`, `can_read_financial_unit` and `can_read_board_aggregates`. In the current HAB-552 regression, a `board_member` can read authorized **condominium-wide aggregates**, but cannot enumerate individual building charge/payment records or perform financial writes. Merely being a `representative` contact grants **no** financial reads/writes. An authorized `condominium_admin` currently has financial access across the condominium; do not claim per-building RLS restricts that existing staff role.

| Capability | Current behavior | Future design intent, not implemented |
| --- | --- | --- |
| General administration finance | Authorized condominium roles under existing RPC/RLS | Preserve existing authority unless independently approved change |
| Board aggregate view | `can_read_board_aggregates` under current policy | Optional scoped dashboard with explicit authority |
| Building account detailed financial read | Board/contact denied by default | Separate explicit building-specific grant and RLS coverage |
| Register resident/building payment | Authorized staff RPC only | Optional constrained delegation with identity and scope checks |
| Approve payments or expenses | Existing independent payment-review contracts | Distinct initiator/reviewer, limits, policy and audit |
| Internal apartment finance | Not permitted inside general `charge_scope=building` condo | New separately approved accounting design and tests |

Any future scoped permission is an **additive new security design**, not something that can be achieved by hiding buttons or by reusing the plain `representative` relationship.

## Functional UX contracts

- Administrator onboarding: choose physical topology and financial charging scope separately; for a complex, record each building's desired governance mode without altering the current general billing scope.
- Organization > Juntas y equipos: list scoped groups, members, offices, appointment dates, approval authority and access/audit history.
- Contextual portal: resident, general administration, appointed building board; server-validated capabilities select visible actions and data. Default-deny and accessible UX.
- Autonomous scenario: show the building's own operational dashboard only after scoped authorization exists; internal apartment finance is hidden/unavailable until the chosen architecture passes its separate release gate.
- Support revocation, turnover and role switching without modifying historic financial records.

## Security and commercial gates (SDP)

**Gate A — current contract:** verify source constraints and document gaps; three governance modes as design-only types, coexistence with current `charge_scope`, no migration or permissions change. Independent review must compare actual SQL/RLS and not certify future features as live.

**Gate B — governance foundation:** separately approved additive schema for per-building group/appointment/grants, explicit minimal GRANT (including Supabase 2026-10-30 behavior), RLS on exposed tables, deny anonymous access, cross-condominium and cross-building tests, expiry/revocation tests; existing central admin behavior preserved unless Founder approves otherwise.

**Gate C — internal finance architecture decision:** explicitly determine how apartment dues can exist for autonomous buildings despite the current building-scope guard. Review alternative linked entity versus scoped-account design, plan billing implications, reconciliation, access isolation, historical data and independent accounting controls. **Do not implement finance until Founder approves the chosen design.**

**Gate D — UX and safe operations:** contextual portal for junta, accessible navigation, maintenance, documents, communications, approved finance visibility and granular task-level grants. Founder visual approval. Harden transaction idempotency, independent approval, immutable audit and revocation.

**Gate E — commercial certification and release:** multi-mode residence with ten autonomous buildings plus mixed models; unit count, fee emission, apartment billing only in newly approved design, no double charging, cross-scope settlement, resident/board separation, payment allocation, statement and treasury reconciliation, period turnover, RLS denial, Supabase pgTAP, browser and Financial E2E, independent reviewer, exact-SHA 4/4 GitHub checks. Protected Founder approval before merge/deploy.

This document **does not alter** existing database schema, financial runtime, role semantics, or production behavior.
