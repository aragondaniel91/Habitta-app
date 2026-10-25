# HAB-PILOT-004: physical topology versus billable unit

- **Status (2026-10-24):** Architectural contract established. Draft implementation in [PR #545](https://github.com/aragondaniel91/Habitta-app/pull/545) includes billing-scope selection and whole-building unit registration; **not merged, deployed, or certified customer-ready**.
- **Founder use case:** Condominio de edificio; condominio general (10 edificios); condominio general (casas).
- **Related:** #518, #515, #519, #483.
- **Baseline:** production `9ab9d9f81d9a5317380bd061f3f8dc3e96e8402e`.

## Founder-approved problem statement

The *physical structure* of a residence and the *entity receiving general condominium charges* are two different axes.

| Scenario | Physical structure | Billable entity | Financial contact |
| --- | --- | --- | --- |
| Single building | One edificio with apartments | Each **apartment** | Unit's authorized owner/resident |
| General condominium over multiple buildings (La Muchachera) | Ten physical buildings | Each **whole building** | Its board or explicitly delegated representative |
| General house condominium | Houses, no fake building | Each **house** | House's authorized owner/resident |

**Historical baseline (before PR #545):** `multi_building_complex` supported apartment/commercial/parking/storage billable units, not whole-building billing; `public.unit_type` lacked `building`. **Draft candidate (PR #545, SHA `39e385c`):** the proposed schema and web/API add an explicit `building` unit type and charge scope, alongside a selector and registration UI. These draft changes are not a production capability. Board/delegate permissions, plan billable counts, onboarding and full financial E2E remain release blockers. Confirm current PR HEAD before relying on this snapshot.

## Architecture decision

1. Keep existing `public.buildings` to describe **physical buildings**, and keep existing `public.units.id` as the unique, authoritative **financial account key** used by quotas, allocations, CxC, receipts, account statements and treasury. Do not create a second money ledger for boards or physical buildings.
2. Extend condominium configuration (in a later separately reviewed migration) with explicit **charge scope**, defaulting to `unit` for all pre-existing condominiums; new `multi_building_complex` projects may explicitly select `building`. A single-building condo, house community and mixed property keep their present direct-unit behavior. An unspecified topology cannot be billed.
3. For building scope, add first-class `unit_type=building` with precisely one billable unit referencing each physical building under the **same condominium**. An administrative charge to that unit must never be replicated to its apartments automatically. Unit name/labels should read `Edificio 1`, not `Edificio 1 · Apartamento ficticio`.
4. The **billing unit** is the debtor/accounting target. The **board or appointed delegate** is a contact and access principal, not a property owner by implication. Store roles, appointment dates and end-of-term history explicitly; do not require or invent patrimonial ownership percentages. Changing contact must not change the charge's `unit_id`.
5. For a 10-building general condominium, a charge batch meant to bill each building once targets **10 billable units**. Declared counts, product plan limits, KPIs and invoices must use effective billing-unit counts consistently. Do not silently alter existing commercial plan prices or historical counts.
6. If a residence currently bills apartments, converting its billing scope when units, allocations, recurring fees, reports or ledger entries exist **must be blocked** until a separately approved migration policy can preserve all historical entitlements. No destructive reshuffling.
7. Cross-tenant building/unit associations, duplicate building billing, board privileges and child-unit financial visibility must be rejected **in PostgreSQL** and covered by positive/negative RLS tests; frontend validation is insufficient. Follow October 30 Supabase explicit GRANT/RLS standard for any new table or RPC.
8. Respect the existing distinction between `ownership_percentage` (real patrimonial ownership) and a board/authorized financial representative. No implicit ownership, voting weight or other financial access from being a contact.

## Evidence and acceptance checkpoint — 2026-10-24

- PR #545 candidate `39e385c82009c86c3f0d64e1d1d5814eadbd4cfc`: CI, Supabase Database Tests, Financial E2E and Playwright workflows returned PASS for that SHA. **This is not an SDP 4/4 certification.**
- Independent Claude review and Founder visual acceptance are not recorded as completed; draft PR is not to be merged just because workflows are green.
- Next implementation boundary: board/delegate access lifecycle with role/tenant negative tests; plan counting/onboarding; charge-to-treasury end-to-end scenarios for apartment, 10 buildings and houses.
- Source-of-truth progress tracker: [`docs/HABITTA-LIVE-STATUS.md`](../HABITTA-LIVE-STATUS.md).

## Implementation gates, in order

**A. Contract (this change):** canonical terminology, backward-compatible type-level decision functions and tests for three scenarios plus representative turnover. Zero runtime wiring, SQL migration, ledger mutation or permissions change.

**B. Additive PostgreSQL foundation:** explicit condominium scope; safe `building` unit identity; same-tenant relation and one-to-one uniqueness; guard billing-mode transitions; pgTAP for all three modes; no automatic postings.

**C. Guided onboarding + Units + Personas/Junta:** choose financial unit granularity clearly, create physical buildings and billable records without duplicates, nominate board contacts without ownership, minimize scroll, preserve familiar Gastos/Pagos styling; founder visual acceptance.

**D. Financial E2E + commercial certification:** fees, admin review, resident/board portal, CxC, statements, treasury, exports, payments and commercial plan billing quota evaluated across all modes with at least ten buildings, homes and apartments. Strict tenant isolation and existing customer regression gates. No AI financial answer until source reconciliation is deterministic.

**Every slice:** isolated worktree, SDP 4/4, independent review, four GitHub workflows, Founder gates for visuals or material policy decisions, protected production release. No post to production as part of this contract-only slice.
