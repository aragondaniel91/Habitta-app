# HAB-307 — Final administrator premium sweep

Date: 2026-08-24

Parents: #214, #221, #278

## Result

The administrator surface contains exactly 18 routed modules and every route is represented by a compliant/certified row in `docs/frontend/form-parity-matrix.md`.

| Route | Module | Final status | Key closure evidence |
| --- | --- | --- | --- |
| `/app/dashboard` | Dashboard | Certified | Topology-neutral KPIs, independent currencies, fail-soft sources, responsive activity/cards. |
| `/app/units` | Units | Compliant | Shared forms, topology-aware structure, UUID identity, archive/reactivation and legacy topology remediation entry point. |
| `/app/people` | People | Compliant | One identity, multiple unit relationships, separated property/occupancy/communication/access lifecycles, responsive drawers. |
| `/app/maintenance` | Maintenance | Compliant | Topology-aware location selectors, shared forms, technical/financial evidence kept explicit. |
| `/app/fees` | Receivables | Compliant | Ordinary/extraordinary/one-off flows separated; recurring dues, late fees, opening balances, statements, solvency, ownership transfer and FX policy exposed without implicit conversion. |
| `/app/payments` | Payments | Compliant | Capture/review/allocation/reversal semantics preserved with currency and history explicit. |
| `/app/treasury` | Treasury | Compliant | Account/movement/transfer/reconciliation flows use shared drawers and preserve immutable balance semantics. |
| `/app/expenses` | Expenses | Compliant | Draft/support/approval/payment/void lifecycle remains explicit and history-preserving. |
| `/app/budgets` | Budgets | Compliant | Versioned budget workflow, approval and actual-vs-budget remain explicit per currency. |
| `/app/reports` | Reports | Certified | 4→2→1 KPIs, desktop table→mobile cards, independent currency books, no simulated expense values. |
| `/app/community` | Community | Certified | Topology-aware presentation does not invent buildings for house communities; responsive KPI/panels/actions. |
| `/app/documents` | Documents | Compliant | Private authenticated files, categories/folders, immutable versions, audited downloads, archive confirmation and UUID links. |
| `/app/governance` | Governance | Compliant | Proposal/voting/assembly/agreement workflows preserve quorum, eligibility snapshots, versions and traceability. |
| `/app/requests` | Requests | Compliant | Shared forms, workflow states, internal/public visibility, attachments and cancellation history. |
| `/app/announcements` | Announcements | Compliant | Topology-aware audiences, unambiguous units, scheduling/publication/archive/read-confirmation and private attachments. |
| `/app/team` | Team & Access | Certified | Shared invitation form, 44/48px controls, transactional delivery/fallback link, guarded role/lifecycle RPC and minimum-admin invariant. |
| `/app/audit` | Audit | Certified | Read-only server-filtered activity, desktop table→mobile cards, safe metadata, actor filtering and responsive pagination. |
| `/app/settings` | Settings | Certified | Global-vs-personal notification scope, 44px switches, 48px rule controls, 4→2→1 KPIs and guarded irreversible danger zone. |

## Contextual Help

Every `APP_ROUTES` entry has a complete guide with purpose, available actions, ordered steps, pre-confirmation checks, expected result, recommendations and permissions. HAB-307 adds a UI-alignment layer so the visible guide tracks current action labels without rewriting unrelated modules.

Final corrections:

- Team & Access uses the exact visible action label `Quitar acceso`.
- Settings documents `Zona de peligro`, `Quiero eliminar esta residencia`, `Revisar eliminación` and the final `Sí, eliminar residencia` confirmation.
- The Settings guide explains that condominium deletion is irreversible for condominium data, owner-only, exact-phrase guarded, double-confirmed and server-authorized.

## Legacy topology remediation / #221

Legacy condominiums with `property_topology = 'unspecified'` have a discoverable administrator remediation flow in Structure Management.

The contract requires:

- `condominium_admin` role;
- remediation UI only when topology is `unspecified` and capability is granted;
- visible `Definir tipo de propiedad` entry point;
- Worker `/topology-remediation` POST action;
- no browser service-role secret or direct privileged Supabase RPC;
- no destructive structure DELETE during remediation;
- hidden/stale declared counts are not submitted for topology types where they do not apply.

Maintenance and Announcements topology-specific gaps were closed by their focused slices, and Community/Dashboard presentation no longer assumes buildings where they do not apply.

## Premium quality bar / #214 + #278

The final matrix and focused HAB contracts jointly cover the required premium patterns:

- one shared `PageHeader` language;
- shared Field/FormGrid/FormActions/Drawer/Dialog primitives where semantically appropriate;
- intentional desktop/tablet/mobile states instead of accidental wrapping;
- explicit loading/empty/error/permission states;
- 44px+ interactive targets where the final slices exposed undersized controls;
- no browser-native alert/confirm/prompt as the product confirmation mechanism;
- financial amount/currency/scope/history semantics remain visible;
- topology-aware labels/selectors remain context-safe;
- destructive actions explain consequence and preserve the appropriate history or require explicit irreversible confirmation.

No new P0/P1 administrator UX gap was identified by this final sweep.

## Gate applicability

HAB-307 changes contextual-help presentation, tests and documentation only. It does not change financial calculations, database migrations, Supabase policies/RLS or backend routes. Therefore Financial E2E and Supabase/pgTAP are not newly applicable to this slice; CI and Playwright remain the required same-SHA gates before merge.

## Release rule

After HAB-307 merges with same-SHA CI + Playwright green and clean review threads, close #214, #221 and #278 as completed. The resulting exact `main` SHA becomes the Production Release candidate; production must still use `.github/workflows/production-release.yml` with its normal confirmation inputs and exact-SHA verification.
