import { describe, expect, it } from 'vitest';
import type { ResidentInvitation } from '../../lib/residentAccess';
import { buildPersonUnitRelationships } from './person-unit-relationships';
import type { CommunicationAssignment, Occupancy, Ownership, Unit } from './types';

const unit: Unit = {
  id: 'unit-1',
  code: '1-A',
  building_id: 'building-1',
  status: 'active',
};

const unitContext = {
  id: 'unit-1',
  code: '1-A',
  condominium_id: 'condo-1',
  building_id: 'building-1',
  buildings: { id: 'building-1', name: 'Los Pinos I' },
};

const ownership: Ownership = {
  id: 'owner-1',
  person_id: 'person-1',
  unit_id: 'unit-1',
  ownership_percentage: 100,
  starts_at: '2026-08-20',
  units: unitContext,
};

const occupancy: Occupancy = {
  id: 'occupancy-1',
  person_id: 'person-1',
  unit_id: 'unit-1',
  occupancy_type: 'tenant',
  starts_at: '2026-08-21',
  units: unitContext,
};

const communication: CommunicationAssignment = {
  id: 'communication-1',
  condominium_id: 'condo-1',
  person_id: 'person-1',
  unit_id: 'unit-1',
  financial_role: 'primary',
  general_recipient: true,
  effective_from: '2026-08-22',
  created_at: '2026-08-22T12:00:00Z',
  units: unitContext,
};

const invitation: ResidentInvitation = {
  id: 'invitation-1',
  condominium_id: 'condo-1',
  person_id: 'person-1',
  unit_id: 'unit-1',
  email: 'juan@example.com',
  intended_role: 'owner',
  status: 'pending',
  expires_at: '2026-08-30T00:00:00Z',
  accepted_at: null,
  revoked_at: null,
  created_at: '2026-08-22T13:00:00Z',
};

function build(overrides: Partial<Parameters<typeof buildPersonUnitRelationships>[0]> = {}) {
  return buildPersonUnitRelationships({
    units: [unit],
    buildings: [{ id: 'building-1', name: 'Los Pinos I' }],
    ownerships: [ownership],
    occupancies: [occupancy],
    communicationAssignments: [communication],
    invitations: [invitation],
    now: new Date('2026-08-22T14:00:00Z'),
    ...overrides,
  });
}

describe('person unit relationship presentation model', () => {
  it('groups ownership, occupancy, communications and access into one unit summary', () => {
    const [summary] = build();

    expect(summary?.unitId).toBe('unit-1');
    expect(summary?.unitLabel).toBe('Los Pinos I · 1-A');
    expect(summary?.currentOwnership?.id).toBe('owner-1');
    expect(summary?.currentOccupancy?.id).toBe('occupancy-1');
    expect(summary?.currentCommunication?.id).toBe('communication-1');
    expect(summary?.accessRoles).toEqual(['owner', 'tenant']);
    expect(summary?.activeSince).toBe('2026-08-20');
    expect(summary?.active).toBe(true);
  });

  it('keeps historical records visible without calling them active', () => {
    const historicalOwnership = { ...ownership, ends_at: '2026-08-21' };
    const historicalOccupancy = { ...occupancy, ends_at: '2026-08-21' };
    const historicalCommunication = { ...communication, effective_to: '2026-08-21' };
    const [summary] = build({
      ownerships: [historicalOwnership],
      occupancies: [historicalOccupancy],
      communicationAssignments: [historicalCommunication],
    });

    expect(summary?.active).toBe(false);
    expect(summary?.currentOwnership).toBeNull();
    expect(summary?.currentOccupancy).toBeNull();
    expect(summary?.currentCommunication).toBeNull();
    expect(summary?.ownershipHistory).toHaveLength(1);
    expect(summary?.occupancyHistory).toHaveLength(1);
    expect(summary?.communicationHistory).toHaveLength(1);
    expect(summary?.accessRoles).toEqual([]);
  });

  it('does not grant tenant access for non-tenant occupancy types', () => {
    const [summary] = build({
      ownerships: [],
      occupancies: [{ ...occupancy, occupancy_type: 'family_member' }],
    });

    expect(summary?.accessRoles).toEqual([]);
    expect(summary?.active).toBe(true);
  });

  it('derives invitation status at render time and keeps the newest invitation', () => {
    const oldAccepted: ResidentInvitation = {
      ...invitation,
      id: 'invitation-old',
      status: 'accepted',
      created_at: '2026-08-20T13:00:00Z',
      accepted_at: '2026-08-20T14:00:00Z',
    };
    const expiringPending: ResidentInvitation = {
      ...invitation,
      id: 'invitation-new',
      created_at: '2026-08-23T13:00:00Z',
      expires_at: '2026-08-24T00:00:00Z',
    };
    const [summary] = build({
      invitations: [oldAccepted, expiringPending],
      now: new Date('2026-08-25T00:00:00Z'),
    });

    expect(summary?.latestInvitation?.id).toBe('invitation-new');
    expect(summary?.latestInvitationStatus).toBe('expired');
    expect(summary?.invitations.map((item) => item.id)).toEqual([
      'invitation-new',
      'invitation-old',
    ]);
  });

  it('can label a historical unit from embedded relationship context when the directory omits it', () => {
    const [summary] = build({ units: [] });

    expect(summary?.unitLabel).toBe('Los Pinos I · 1-A');
  });

  it('sorts active relationships before historical relationships', () => {
    const secondContext = {
      ...unitContext,
      id: 'unit-2',
      code: '1-B',
    };
    const historical: Ownership = {
      ...ownership,
      id: 'owner-2',
      unit_id: 'unit-2',
      ends_at: '2026-08-20',
      units: secondContext,
    };

    const summaries = build({ ownerships: [historical, ownership] });

    expect(summaries.map((item) => item.unitId)).toEqual(['unit-1', 'unit-2']);
  });
});
