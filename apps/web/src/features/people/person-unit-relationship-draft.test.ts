import { describe, expect, it } from 'vitest';
import {
  canCreateRelationshipState,
  relationshipDraftForUnit,
  relationshipForUnit,
} from './person-unit-relationship-draft';
import type { PersonUnitRelationshipSummary } from './person-unit-relationships';

const relationship: PersonUnitRelationshipSummary = {
  unitId: 'unit-1',
  unitLabel: 'Los Pinos I · 1-A',
  active: true,
  activeSince: '2026-08-20',
  currentOwnership: {
    id: 'ownership-1',
    person_id: 'person-1',
    unit_id: 'unit-1',
    ownership_percentage: 55.5,
    starts_at: '2026-08-20',
    units: { id: 'unit-1', code: '1-A', condominium_id: 'condo-1' },
  },
  ownershipHistory: [],
  currentOccupancy: {
    id: 'occupancy-1',
    person_id: 'person-1',
    unit_id: 'unit-1',
    occupancy_type: 'family_member',
    starts_at: '2026-08-21',
    units: { id: 'unit-1', code: '1-A', condominium_id: 'condo-1' },
  },
  occupancyHistory: [],
  currentCommunication: {
    id: 'communication-1',
    condominium_id: 'condo-1',
    person_id: 'person-1',
    unit_id: 'unit-1',
    financial_role: 'additional',
    general_recipient: true,
    effective_from: '2026-08-22',
    created_at: '2026-08-22T12:00:00Z',
    units: { id: 'unit-1', code: '1-A', condominium_id: 'condo-1' },
  },
  communicationHistory: [],
  accessRoles: [],
  latestInvitation: null,
  latestInvitationStatus: null,
  invitations: [],
};

describe('person unit relationship drawer draft', () => {
  it('resolves the existing relationship selected from the unit list', () => {
    expect(relationshipForUnit([relationship], 'unit-1')).toBe(relationship);
  });

  it('prepopulates current ownership values for an existing relationship', () => {
    expect(relationshipDraftForUnit(relationship).ownershipPercentage).toBe('55.5');
  });

  it('prepopulates current occupancy values for an existing relationship', () => {
    expect(relationshipDraftForUnit(relationship).occupancyType).toBe('family_member');
  });

  it('prepopulates current communication responsibility and recipient flag', () => {
    expect(relationshipDraftForUnit(relationship)).toMatchObject({
      financialRole: 'additional',
      generalRecipient: true,
    });
  });

  it('retains existing values when the derived draft is saved unchanged', () => {
    const draft = relationshipDraftForUnit(relationship);

    expect(draft).toEqual({
      ownershipPercentage: '55.5',
      occupancyType: 'family_member',
      financialRole: 'additional',
      generalRecipient: true,
    });
  });

  it('uses valid defaults only for a unit with no existing relationship', () => {
    expect(relationshipDraftForUnit(null)).toEqual({
      ownershipPercentage: '',
      occupancyType: 'tenant',
      financialRole: 'none',
      generalRecipient: false,
    });
  });

  it('does not permit creating duplicate active ownership or occupancy state', () => {
    expect(canCreateRelationshipState(relationship, 'ownership')).toBe(false);
    expect(canCreateRelationshipState(relationship, 'occupancy')).toBe(false);
    expect(canCreateRelationshipState(null, 'ownership')).toBe(true);
    expect(canCreateRelationshipState(null, 'occupancy')).toBe(true);
  });
});
