import type { FinancialRecipientRole, Occupancy } from './types';
import type { PersonUnitRelationshipSummary } from './person-unit-relationships';

export type PersonUnitRelationshipDraft = {
  ownershipPercentage: string;
  occupancyType: Occupancy['occupancy_type'];
  financialRole: FinancialRecipientRole;
  generalRecipient: boolean;
};

export function relationshipForUnit(
  relationships: PersonUnitRelationshipSummary[],
  unitId: string,
) {
  return relationships.find((relationship) => relationship.unitId === unitId) ?? null;
}

export function relationshipDraftForUnit(
  relationship: PersonUnitRelationshipSummary | null,
): PersonUnitRelationshipDraft {
  const communication = relationship?.currentCommunication;

  return {
    ownershipPercentage: relationship?.currentOwnership?.ownership_percentage?.toString() ?? '',
    occupancyType: relationship?.currentOccupancy?.occupancy_type ?? 'tenant',
    financialRole: communication?.financial_role ?? 'none',
    generalRecipient: communication?.general_recipient ?? false,
  };
}

export function canCreateRelationshipState(
  relationship: PersonUnitRelationshipSummary | null,
  kind: 'ownership' | 'occupancy',
) {
  return kind === 'ownership' ? !relationship?.currentOwnership : !relationship?.currentOccupancy;
}
