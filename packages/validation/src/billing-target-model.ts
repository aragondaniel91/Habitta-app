/**
 * Canonical proposed billing scope for HAB-PILOT-004.
 *
 * Physical topology answers "what structures exist?". Charge scope answers
 * "what receives the condominium's receivable?". They must never be inferred
 * from each other for multi-building communities.
 *
 * This domain contract does NOT enable building-level billing in PostgreSQL.
 * It is the safe, testable specification for a separately gated migration.
 */
export type CondominiumPhysicalTopology =
  'unspecified' | 'single_building' | 'multi_building_complex' | 'house_community' | 'mixed';

export type AdministrativeChargeScope = 'unit' | 'building';

export type BillingAccountLevel = 'individual_unit' | 'whole_building';

const supportedScopes: Record<CondominiumPhysicalTopology, readonly AdministrativeChargeScope[]> = {
  unspecified: [],
  single_building: ['unit'],
  multi_building_complex: ['unit', 'building'],
  house_community: ['unit'],
  mixed: ['unit'],
};

export function supportedAdministrativeChargeScopes(
  topology: CondominiumPhysicalTopology,
): readonly AdministrativeChargeScope[] {
  return supportedScopes[topology];
}

/**
 * Compatibility rule: existing installations continue billing their existing
 * units. An explicit Founder/admin choice is required before introducing the
 * new building-level scope.
 */
export function defaultAdministrativeChargeScope(
  topology: CondominiumPhysicalTopology,
): AdministrativeChargeScope | null {
  return supportedScopes[topology].includes('unit') ? 'unit' : null;
}

/**
 * This classifies the accounting level, NOT the subtype of a direct unit.
 * Direct units may also be shops, parking or storage, as allowed by existing
 * topologies; this must never silently narrow historical unit types.
 */
export function billingAccountLevel(
  topology: CondominiumPhysicalTopology,
  scope: AdministrativeChargeScope,
): BillingAccountLevel | null {
  if (!supportedScopes[topology].includes(scope)) return null;
  return scope === 'building' ? 'whole_building' : 'individual_unit';
}

/**
 * The charge and balance stay attached to the immutable billing-unit ID,
 * NEVER to the current board representative, owner or occupant.
 * The database must independently enforce tenant and association correctness.
 */
export function financialAccountIdentity(input: {
  condominiumId: string;
  billingUnitId: string;
  representativePersonId?: string | null;
}): { condominiumId: string; unitId: string } {
  return { condominiumId: input.condominiumId, unitId: input.billingUnitId };
}
