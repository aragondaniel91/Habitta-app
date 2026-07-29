import { describe, expect, it } from 'vitest';
import {
  buildBuildingCommunityRows,
  getCommunityDirectoryRows,
  getCommunityStats,
  getUnitTypeRows,
} from './community';
import type { CommunityBuilding, CommunityPerson, CommunityUnit } from './community';

const buildings: CommunityBuilding[] = [
  { id: 'north', name: 'Torre Norte' },
  { id: 'south', name: 'Torre Sur' },
];
const units: CommunityUnit[] = [
  { id: 'a', code: 'A-1', status: 'active', type: 'Apartamento', building_id: 'north' },
  { id: 'b', code: 'A-2', status: 'active', type: 'Apartamento', building_id: 'north' },
  { id: 'c', code: 'L-1', status: 'inactive', type: 'Local', building_id: 'south' },
];
const people: CommunityPerson[] = [
  {
    id: '1',
    first_name: 'Ana',
    last_name: 'Rodríguez',
    email: 'ana@example.com',
    phone: '+58 412 0000000',
    status: 'active',
  },
  {
    id: '2',
    first_name: 'Luis',
    last_name: 'Martínez',
    email: null,
    phone: null,
    status: 'inactive',
  },
];

describe('community overview calculations', () => {
  it('summarizes active records and contact coverage', () => {
    expect(getCommunityStats(units, people)).toEqual({
      activeUnits: 2,
      inactiveUnits: 1,
      activePeople: 1,
      inactivePeople: 1,
      peopleWithEmail: 1,
      peopleWithPhone: 1,
      peopleWithBoth: 1,
      peopleWithoutContact: 1,
      contactCoverage: 50,
    });
  });

  it('builds building distribution from real unit relationships', () => {
    expect(buildBuildingCommunityRows(buildings, units)).toEqual([
      { id: 'north', name: 'Torre Norte', units: 2, activeUnits: 2, percentage: 100 },
      { id: 'south', name: 'Torre Sur', units: 1, activeUnits: 0, percentage: 50 },
    ]);
  });

  it('orders active directory entries first and groups unit types', () => {
    expect(getCommunityDirectoryRows(people).map((person) => person.id)).toEqual(['1', '2']);
    expect(getUnitTypeRows(units)).toEqual([
      { label: 'Apartamento', count: 2 },
      { label: 'Local', count: 1 },
    ]);
  });
});
