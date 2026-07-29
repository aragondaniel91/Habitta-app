import { describe, expect, it } from 'vitest';
import {
  countUnitsByStatus,
  filterPeople,
  filterUnits,
  getBuildingName,
  getPersonInitials,
  getUnitTypeLabel,
  isCurrentAssignment,
} from './lib/community-directory';

const buildings = [
  { id: 'building-a', name: 'Torre Norte' },
  { id: 'building-b', name: 'Torre Sur' },
];

const units = [
  {
    id: 'unit-1',
    code: 'A-01',
    building_id: 'building-a',
    type: 'apartment',
    floor: 1,
    status: 'active',
  },
  {
    id: 'unit-2',
    code: 'L-02',
    building_id: 'building-b',
    type: 'commercial',
    floor: 2,
    status: 'inactive',
  },
];

describe('community directory helpers', () => {
  it('filters units using code, building, type and status without accent sensitivity', () => {
    expect(filterUnits(units, buildings, { query: 'norte', buildingId: '', status: '' })).toEqual([
      units[0],
    ]);
    expect(filterUnits(units, buildings, { query: 'local', buildingId: '', status: '' })).toEqual([
      units[1],
    ]);
    expect(filterUnits(units, buildings, { query: '', buildingId: '', status: 'active' })).toEqual([
      units[0],
    ]);
  });

  it('filters people by name and contact information', () => {
    const people = [
      {
        id: 'person-1',
        first_name: 'María',
        last_name: 'Gómez',
        email: 'maria@example.com',
        phone: '+58 412 000 0000',
        status: 'active',
      },
      {
        id: 'person-2',
        first_name: 'Carlos',
        last_name: 'Pérez',
        email: 'carlos@example.com',
        status: 'inactive',
      },
    ];

    expect(filterPeople(people, { query: 'maria', status: '' })).toEqual([people[0]]);
    expect(filterPeople(people, { query: '412', status: '' })).toEqual([people[0]]);
    expect(filterPeople(people, { query: '', status: 'inactive' })).toEqual([people[1]]);
  });

  it('provides stable display labels and summary values', () => {
    expect(getBuildingName(units[0], buildings)).toBe('Torre Norte');
    expect(getUnitTypeLabel('commercial')).toBe('Local');
    expect(getPersonInitials({ id: '1', first_name: 'Ana', last_name: 'Rodríguez' })).toBe('AR');
    expect(countUnitsByStatus(units)).toEqual({ active: 1, inactive: 1 });
  });

  it('detects current and historical assignments', () => {
    expect(isCurrentAssignment({ ends_at: null })).toBe(true);
    expect(isCurrentAssignment({ ends_at: '2999-01-01' })).toBe(true);
    expect(isCurrentAssignment({ ends_at: '2000-01-01' })).toBe(false);
  });
});
