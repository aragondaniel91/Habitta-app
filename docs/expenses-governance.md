# Expenses and community governance

This release completes the previously placeholder **Expenses** module and adds the first production foundation for community proposals and voting.

## Expenses

- Condominium-scoped expense categories and vendors.
- Draft, pending approval, approved, paid and void states.
- Server-side state transitions with optimistic version checks.
- Separate totals per currency; Habitta never adds USD, VES or EUR together.
- Optional invoice number, due date, payment reference, notes and secure support URL.
- Immutable expense event trail.
- Role model:
  - organization owner and condominium administrator can approve or void;
  - organization owner, condominium administrator and accountant can create and manage drafts;
  - assistants, reviewers and board members receive read access where appropriate.

The module is intentionally separate from receivables and payment allocations. No existing calculation, ledger or payment approval behavior is changed.

## Proposals and voting

- Draft, open, closed, approved, rejected and archived proposal states.
- Categories for budgets, maintenance, improvements, community decisions and policy.
- Optional budget and support-document links.
- Configurable quorum.
- One vote per linked owner or one vote per eligible unit.
- Voting eligibility is derived from the authenticated account, an active person record and active ownership assignments.
- Unique database indexes prevent duplicate votes.
- Results are aggregated by PostgreSQL and include participation and quorum state.
- Proposal lifecycle and vote events are auditable.

## Security

- All records include `condominium_id` and are protected with row-level security.
- Expenses and proposals are created and transitioned through security-definer PostgreSQL functions.
- The browser never supplies a role or voting eligibility decision.
- Raw individual votes are visible only to the voter and governance managers; members receive aggregated results.
