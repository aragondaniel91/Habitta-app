import { describe, expect, it } from 'vitest';
import {
  activeOccupancies,
  activeOwnerships,
  condominiumRelationshipLabels,
  occupancyLabels,
  personSearchText,
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
        id: 'unit-1',
        code: 'A-12',
        condominium_id: 'condo-1',
        buildings: { id: 'building-1', name: 'Torre Este' },
      }),
    ).toBe('Torre Este · A-12');
    expect(unitContextLabel({ id: 'house-1', code: 'Casa 8', condominium_id: 'condo-1' })).toBe(
      'Casa 8',
    );
  });

  it('keeps ended ownerships and occupancies out of active invitation choices without deleting history', () => {
    const ownerships = [
      { id: 'o1', ends_at: null },
      { id: 'o2', ends_at: '2026-08-01' },
    ] as Ownership[];
    const occupancies = [
      { id: 't1', ends_at: null },
      { id: 't2', ends_at: '2026-08-01' },
    ] as Occupancy[];

    expect(activeOwnerships(ownerships).map((item) => item.id)).toEqual(['o1']);
    expect(activeOccupancies(occupancies).map((item) => item.id)).toEqual(['t1']);
  });

  it('uses operational Venezuela-first labels without changing stored enums', () => {
    expect(condominiumRelationshipLabels.board_member).toBe('Junta de condominio');
    expect(occupancyLabels.authorized_occupant).toBe('Ocupante autorizado');
  });
});
