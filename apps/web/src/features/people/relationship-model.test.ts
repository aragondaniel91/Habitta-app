import { describe, expect, it } from 'vitest';
import {
  activeOccupancies,
  activeOwnerships,
  condominiumRelationshipLabels,
  directoryUnitLabel,
  occupancyLabels,
  personSearchText,
  residentAccessOptions,
  residentInvitationDisplayStatus,
  residentInvitationStatusLabels,
  unitContextLabel,
} from './relationship-model';
import type { Occupancy, Ownership, Person } from './types';

describe('people relationship presentation model', () => {
  it('searches identity documents as well as contact data', () => {
    const person: Person = {
      id: 'person-1',
      first_name: 'Ana',
      last_name: 'Pérez',
      document_type: 'Cédula',
      document_number: 'V-12.345.678',
      email: 'ana@example.com',
      phone: '+58 414 0000000',
    };

    expect(personSearchText(person)).toContain('v-12.345.678');
    expect(personSearchText(person)).toContain('ana@example.com');
  });

  it('shows building context only when a unit belongs to a building', () => {
    expect(
      unitContextLabel({
        code: 'A-12',
        buildings: { id: 'building-1', name: 'Torre Este' },
      }),
    ).toBe('Torre Este · A-12');
    expect(unitContextLabel({ code: 'Casa 8' })).toBe('Casa 8');
    expect(
      directoryUnitLabel({ id: 'unit-2', code: '1A', building_id: 'building-2' }, [
        { id: 'building-2', name: 'Torre Oeste' },
      ]),
    ).toBe('Torre Oeste · 1A');
  });

  it('treats an assignment as active only while ends_at is null, matching HAB-125', () => {
    const ownerships = [
      { id: 'o1', ends_at: null },
      { id: 'o2', ends_at: '2099-08-20' },
      { id: 'o3', ends_at: '2000-08-01' },
    ] as Ownership[];
    const occupancies = [
      { id: 't1', ends_at: null },
      { id: 't2', ends_at: '2099-08-20' },
      { id: 't3', ends_at: '2000-08-01' },
    ] as Occupancy[];

    expect(activeOwnerships(ownerships).map((item) => item.id)).toEqual(['o1']);
    expect(activeOccupancies(occupancies).map((item) => item.id)).toEqual(['t1']);
  });

  it('offers resident access from every active relationship that maps to a membership', () => {
    const unit = (id: string, code: string) => ({
      id,
      code,
      condominium_id: 'condo-1',
      buildings: { id: `building-${id}`, name: `Torre ${id}` },
    });
    const ownerships = [
      {
        id: 'owner-a',
        person_id: 'person-1',
        unit_id: 'unit-a',
        starts_at: '2026-01-01',
        units: unit('unit-a', '1A'),
      },
      {
        id: 'owner-ended',
        person_id: 'person-1',
        unit_id: 'unit-b',
        starts_at: '2026-01-01',
        ends_at: '2099-06-01',
        units: unit('unit-b', '1B'),
      },
    ] as Ownership[];
    const occupancies = [
      {
        id: 'tenant-c',
        person_id: 'person-1',
        unit_id: 'unit-c',
        occupancy_type: 'tenant',
        starts_at: '2026-01-01',
        units: unit('unit-c', '2C'),
      },
      {
        id: 'family-d',
        person_id: 'person-1',
        unit_id: 'unit-d',
        occupancy_type: 'family_member',
        starts_at: '2026-01-01',
        units: unit('unit-d', '2D'),
      },
      {
        id: 'authorized-e',
        person_id: 'person-1',
        unit_id: 'unit-e',
        occupancy_type: 'authorized_occupant',
        starts_at: '2026-01-01',
        units: unit('unit-e', '2E'),
      },
      {
        id: 'owner-occupant-a',
        person_id: 'person-1',
        unit_id: 'unit-a',
        occupancy_type: 'owner_occupant',
        starts_at: '2026-01-01',
        units: unit('unit-a', '1A'),
      },
    ] as Occupancy[];

    expect(
      residentAccessOptions(ownerships, occupancies, new Date('2026-09-01T12:00:00')),
    ).toEqual([
      {
        role: 'owner',
        unitId: 'unit-a',
        unitLabel: 'Torre unit-a · 1A',
        relationshipId: 'owner-a',
      },
      {
        role: 'tenant',
        unitId: 'unit-c',
        unitLabel: 'Torre unit-c · 2C',
        relationshipId: 'tenant-c',
      },
      {
        role: 'family_member',
        unitId: 'unit-d',
        unitLabel: 'Torre unit-d · 2D',
        relationshipId: 'family-d',
      },
      {
        role: 'authorized_occupant',
        unitId: 'unit-e',
        unitLabel: 'Torre unit-e · 2E',
        relationshipId: 'authorized-e',
      },
    ]);
  });

  it('uses strict start and inclusive end dates for family and authorized invitation eligibility', () => {
    const unit = (id: string) => ({ id, code: id, condominium_id: 'condo-1' });
    const occupancies = [
      {
        id: 'future-family',
        person_id: 'person-1',
        unit_id: 'future-family-unit',
        occupancy_type: 'family_member',
        starts_at: '2026-09-02',
        units: unit('future-family-unit'),
      },
      {
        id: 'ending-authorized',
        person_id: 'person-1',
        unit_id: 'ending-authorized-unit',
        occupancy_type: 'authorized_occupant',
        starts_at: '2026-08-01',
        ends_at: '2026-09-15',
        units: unit('ending-authorized-unit'),
      },
      {
        id: 'expired-family',
        person_id: 'person-1',
        unit_id: 'expired-family-unit',
        occupancy_type: 'family_member',
        starts_at: '2026-08-01',
        ends_at: '2026-08-31',
        units: unit('expired-family-unit'),
      },
    ] as Occupancy[];

    expect(
      residentAccessOptions([], occupancies, new Date('2026-09-01T12:00:00')).map(
        (option) => option.relationshipId,
      ),
    ).toEqual(['ending-authorized']);
  });

  it('derives an expired invitation display state without mutating stored lifecycle state', () => {
    expect(
      residentInvitationDisplayStatus(
        { status: 'pending', expires_at: '2026-08-10T00:00:00Z' },
        new Date('2026-08-17T00:00:00Z'),
      ),
    ).toBe('expired');
    expect(
      residentInvitationDisplayStatus(
        { status: 'accepted', expires_at: '2026-08-10T00:00:00Z' },
        new Date('2026-08-17T00:00:00Z'),
      ),
    ).toBe('accepted');
    expect(residentInvitationStatusLabels.revoked).toBe('Revocada');
  });

  it('uses operational Venezuela-first labels without changing stored enums', () => {
    expect(condominiumRelationshipLabels.board_member).toBe('Junta de condominio');
    expect(condominiumRelationshipLabels.representative).toBe('Representante legal');
    expect(occupancyLabels.authorized_occupant).toBe('Ocupante autorizado');
  });
});
