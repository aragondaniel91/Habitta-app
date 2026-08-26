/**
 * HAB-356: lifecycle completeness contract.
 *
 * A module can look finished — premium layout, responsive, correct RLS — and still trap the
 * administrator with an entity that can be created and never corrected. This file is the
 * machine-readable answer to "what is the safe correction path for X?", and the companion test
 * refuses to let a new create route ship without one.
 *
 * Classification (from #351):
 *   - `configuration`  mutable settings. Correction is an edit.
 *   - `lifecycle`      mutable until a state transition freezes it. Correction is an edit while
 *                      the object is still open, plus the transition itself.
 *   - `history`        immutable financial or legal record. Correction is a reverse, adjustment,
 *                      supersede or annulment that adds a record instead of rewriting one.
 *   - `derived`        produced by the system from other data. Nothing to correct directly.
 *
 * `correction` names the route (or explicit action) that closes the loop. `knownGap` marks an
 * entity that has no correction path yet; every gap must carry the issue tracking it, so the
 * omission is visible in code review instead of being discovered by an administrator.
 */

export type LifecycleClassification = 'configuration' | 'lifecycle' | 'history' | 'derived';

export type LifecycleEntity = {
  /** Router key from apps/web/src/navigation.ts, or `platform` for account-level objects. */
  module: string;
  entity: string;
  /** Route literal exactly as registered in the API source. */
  create: string;
  classification: LifecycleClassification;
  /**
   * How the entity is corrected. Three shapes exist, because not every correction is a Worker
   * route and scanning only the API surface produced false gaps in the first sweep:
   *   - `/route/literal`  a route registered in apps/api/src
   *   - `rpc:name`        a Supabase function the web app calls directly through supabase-js
   *   - `supersede:name`  re-running the create function supersedes the previous record
   */
  correction: string | null;
  /** Issue tracking a missing correction path. Required whenever `correction` is null. */
  knownGap?: string;
  note?: string;
};

export const LIFECYCLE_CONTRACT: readonly LifecycleEntity[] = [
  // ---------------------------------------------------------------- platform / tenancy
  {
    module: 'platform',
    entity: 'organization',
    create: '/v1/organizations',
    classification: 'configuration',
    correction: '/v1/organizations/:organizationId',
  },
  {
    module: 'settings',
    entity: 'condominium',
    create: '/v1/condominiums',
    classification: 'configuration',
    correction: '/v1/condominiums/:id',
    note: 'HAB-360: name, legal identity and address are correctable; topology stays owned by remediate_condominium_topology.',
  },
  {
    module: 'units',
    entity: 'building',
    create: '/v1/condominiums/:id/buildings',
    classification: 'configuration',
    correction: '/:condominiumId/buildings/:buildingId',
  },
  {
    module: 'units',
    entity: 'unit',
    create: '/v1/condominiums/:id/units',
    classification: 'configuration',
    correction: '/v1/condominiums/:id/units/:unitId',
  },

  // ---------------------------------------------------------------- people
  {
    module: 'people',
    entity: 'person',
    create: '/v1/condominiums/:id/people',
    classification: 'configuration',
    correction: '/v1/condominiums/:id/people/:personId',
  },
  {
    module: 'people',
    entity: 'unit-owner assignment',
    create: '/v1/condominiums/:id/units/:unitId/owners',
    classification: 'lifecycle',
    correction: '/v1/condominiums/:id/unit-owners/:assignmentId',
    note: 'Closed with an end date; the assignment history is preserved.',
  },
  {
    module: 'people',
    entity: 'unit-occupancy assignment',
    create: '/v1/condominiums/:id/units/:unitId/occupancies',
    classification: 'lifecycle',
    correction: '/v1/condominiums/:id/unit-occupancies/:assignmentId',
  },
  {
    module: 'people',
    entity: 'person admin note',
    create: '/:id/people/:personId/admin-notes',
    classification: 'lifecycle',
    correction: '/:id/people/:personId/admin-notes/clear',
  },
  {
    module: 'people',
    entity: 'resident invitation',
    create: '/:condominiumId/resident-invitations',
    classification: 'lifecycle',
    correction: 'rpc:revoke_resident_invitation',
    note: 'Called directly from PeoplePanelV3 through supabase-js, not through the Worker.',
  },
  {
    module: 'team',
    entity: 'administrator invitation',
    create: '/:condominiumId/admin-invitations',
    classification: 'lifecycle',
    correction: 'rpc:revoke_admin_invitation',
    note: 'Called directly from TeamAccessPage through supabase-js, not through the Worker.',
  },

  // ---------------------------------------------------------------- fees
  {
    module: 'fees',
    entity: 'charge concept',
    create: '/v1/condominiums/:id/charge-concepts',
    classification: 'configuration',
    correction: '/v1/condominiums/:id/charge-concepts/:conceptId',
    note: 'HAB-354: identity fields freeze once financial history exists.',
  },
  {
    module: 'fees',
    entity: 'financial scope',
    create: '/:id/financial-scopes',
    classification: 'configuration',
    correction: '/:id/financial-scopes/:scopeId',
    note: 'HAB-355: prospective edit, archive instead of delete.',
  },
  {
    module: 'fees',
    entity: 'recurring charge plan',
    create: '/:id/recurring-charge-plans',
    classification: 'configuration',
    correction: '/:id/recurring-charge-plans/:planId',
    note: 'HAB-352 edits the plan; HAB-359 stops it without deleting published periods.',
  },
  {
    module: 'fees',
    entity: 'receivable item',
    create: '/v1/condominiums/:id/receivables',
    classification: 'history',
    correction: '/v1/condominiums/:id/receivables/:receivableId/reverse',
  },
  {
    module: 'fees',
    entity: 'resident invitation link',
    create: '/v1/condominiums/:id/invitations',
    classification: 'lifecycle',
    correction: '/v1/invitations/:token/accept',
    note: 'Superseded by issuing a new invitation; tokens expire on their own.',
  },

  // ---------------------------------------------------------------- payments
  {
    module: 'payments',
    entity: 'payment method',
    create: '/v1/condominiums/:id/payment-methods',
    classification: 'configuration',
    correction: '/v1/condominiums/:id/payment-methods/:methodId',
  },
  {
    module: 'payments',
    entity: 'payment',
    create: '/v1/condominiums/:id/payments',
    classification: 'lifecycle',
    correction: '/v1/condominiums/:id/payments/:paymentId',
    note: 'Editable while draft or correction_requested; reversible once approved.',
  },

  // ---------------------------------------------------------------- treasury
  {
    module: 'treasury',
    entity: 'treasury account',
    create: '/:id/treasury/accounts',
    classification: 'configuration',
    correction: '/:id/treasury/accounts/:accountId',
    note: 'HAB-360: descriptive fields always correctable; currency and type freeze once movements exist; archiving refused while a balance remains.',
  },
  {
    module: 'treasury',
    entity: 'treasury movement',
    create: '/:id/treasury/movements',
    classification: 'history',
    correction: '/:id/treasury/movements/:movementId/reverse',
  },
  {
    module: 'treasury',
    entity: 'treasury transfer',
    create: '/:id/treasury/transfers',
    classification: 'history',
    correction: null,
    knownGap: '#360',
    note: 'Movements can be reversed but the transfer that produced them cannot.',
  },
  {
    module: 'treasury',
    entity: 'treasury reconciliation',
    create: '/:id/treasury/reconciliations',
    classification: 'lifecycle',
    correction: '/:id/treasury/reconciliations/:reconciliationId/close',
  },
  {
    module: 'treasury',
    entity: 'overdraft authorization',
    create: '/:id/treasury/overdraft-authorizations',
    classification: 'history',
    correction: null,
    knownGap: '#360',
    note: 'An authorization granted by mistake cannot be revoked.',
  },

  // ---------------------------------------------------------------- financial policy
  {
    module: 'settings',
    entity: 'currency policy',
    create: '/:id/currency-policy',
    classification: 'configuration',
    correction: '/:id/currency-policy',
    note: 'Idempotent PUT.',
  },
  {
    module: 'settings',
    entity: 'solvency policy',
    create: '/:id/solvency-policy',
    classification: 'configuration',
    correction: '/:id/solvency-policy',
  },
  {
    module: 'settings',
    entity: 'approved exchange rate',
    create: '/:id/exchange-rates',
    classification: 'history',
    correction: 'supersede:record_approved_exchange_rate',
    note: 'Re-recording the rate for the same day and source marks the previous one superseded, so a wrong rate is corrected additively and never edited.',
  },
  {
    module: 'fees',
    entity: 'solvency certificate',
    create: '/:id/units/:unitId/solvency-certificates',
    classification: 'history',
    correction: null,
    knownGap: '#360',
    note: 'Immutable by design, but a certificate issued in error has no annulment and stays publicly verifiable.',
  },
  {
    module: 'units',
    entity: 'ownership transfer',
    create: '/:id/units/:unitId/ownership-transfers',
    classification: 'history',
    correction: null,
    knownGap: '#360',
    note: 'protect_ownership_transfer_history freezes the record with no reversal path.',
  },

  // ---------------------------------------------------------------- operations
  {
    module: 'expenses',
    entity: 'expense',
    create: '/:id/expenses',
    classification: 'lifecycle',
    correction: '/:id/expenses/:expenseId',
  },
  {
    module: 'maintenance',
    entity: 'maintenance asset',
    create: '/:id/maintenance/assets',
    classification: 'configuration',
    correction: '/:id/maintenance/assets/:assetId',
  },
  {
    module: 'maintenance',
    entity: 'work order',
    create: '/:id/maintenance/work-orders',
    classification: 'lifecycle',
    correction: '/:id/maintenance/work-orders/:workOrderId',
  },
  {
    module: 'maintenance',
    entity: 'work order quote',
    create: '/:id/maintenance/work-orders/:workOrderId/quotes',
    classification: 'lifecycle',
    correction: '/:id/maintenance/work-orders/:workOrderId/quotes/:quoteId/decision',
  },
  {
    module: 'requests',
    entity: 'service request',
    create: '/v1/condominiums/:id/requests',
    classification: 'lifecycle',
    correction: '/v1/condominiums/:id/requests/:requestId',
  },
  {
    module: 'announcements',
    entity: 'announcement',
    create: '/v1/condominiums/:id/announcements',
    classification: 'lifecycle',
    correction: '/v1/condominiums/:id/announcements/:announcementId',
  },

  // ---------------------------------------------------------------- governance
  {
    module: 'governance',
    entity: 'governance proposal',
    create: '/:id/governance-proposals',
    classification: 'lifecycle',
    correction: '/:id/governance-proposals/:proposalId/voting-rules',
  },
  {
    module: 'governance',
    entity: 'assembly',
    create: '/:id/assemblies',
    classification: 'lifecycle',
    correction: '/:id/assemblies/:assemblyId/transition',
  },
  {
    module: 'governance',
    entity: 'assembly action item',
    create: '/:id/assemblies/:assemblyId/action-items',
    classification: 'lifecycle',
    correction: '/:id/assemblies/:assemblyId/action-items/:actionItemId',
  },
  {
    module: 'budgets',
    entity: 'budget period',
    create: '/:id/budgets',
    classification: 'lifecycle',
    correction: '/:id/budgets/:periodId/revisions',
    note: 'Corrected by opening a revision, never by rewriting an approved version.',
  },

  // ---------------------------------------------------------------- documents
  {
    module: 'documents',
    entity: 'community document',
    create: '/:condominiumId/community-documents',
    classification: 'lifecycle',
    correction: '/:condominiumId/community-documents/:documentId/versions',
    note: 'Corrected by publishing a new version.',
  },
  {
    module: 'documents',
    entity: 'community document category',
    create: '/:condominiumId/community-documents/categories',
    classification: 'configuration',
    correction: null,
    knownGap: '#360',
  },
  {
    module: 'documents',
    entity: 'community document folder',
    create: '/:condominiumId/community-documents/folders',
    classification: 'configuration',
    correction: null,
    knownGap: '#360',
  },
  // ---------------------------------------------------------------- structure (structure-routes)
  {
    module: 'units',
    entity: 'building (structure router)',
    create: '/:condominiumId/buildings',
    classification: 'configuration',
    correction: '/:condominiumId/buildings/:buildingId',
  },
  {
    module: 'units',
    entity: 'unit (structure router)',
    create: '/:condominiumId/units',
    classification: 'configuration',
    correction: '/:condominiumId/units/:unitId',
  },

  // ---------------------------------------------------------------- catalogs
  {
    module: 'expenses',
    entity: 'expense category',
    create: '/:id/expense-categories',
    classification: 'configuration',
    correction: '/:id/expense-categories/:categoryId',
  },
  {
    module: 'expenses',
    entity: 'vendor',
    create: '/:id/vendors',
    classification: 'configuration',
    correction: '/:id/vendors/:vendorId',
  },
  {
    module: 'maintenance',
    entity: 'maintenance plan',
    create: '/:id/maintenance/plans',
    classification: 'configuration',
    correction: '/:id/maintenance/plans/:planId',
  },
  {
    module: 'requests',
    entity: 'service request category',
    create: '/v1/condominiums/:id/request-categories',
    classification: 'configuration',
    correction: '/v1/condominiums/:id/request-categories/:categoryId',
  },
];

/** Entities an administrator can create today with no safe way to correct them. */
export const lifecycleGaps = () => LIFECYCLE_CONTRACT.filter((entry) => entry.correction === null);
