import { describe, expect, it } from 'vitest';
import {
  allowedUnitTypes,
  defaultUnitType,
  isUnitTypeAllowed,
  unitReferenceLabel,
  unitTypeOptions,
} from './unit-domain';

describe('HAB-209 topology-aware unit domain', () => {
  it('keeps houses out of building-only condominiums', () => {
    expect(allowedUnitTypes('single_building')).toEqual([
      'apartment',
      'commercial',
      'parking',
      'storage',
    ]);
    expect(isUnitTypeAllowed('single_building', 'house')).toBe(false);
    expect(isUnitTypeAllowed('multi_building_complex', 'house')).toBe(false);
  });

  it('makes house the natural unit for house communities', () => {
    expect(defaultUnitType('house_community')).toBe('house');
    expect(allowedUnitTypes('house_community')).toEqual([
      'house',
      'commercial',
      'parking',
      'storage',
    ]);
    expect(isUnitTypeAllowed('house_community', 'apartment')).toBe(false);
  });

  it('keeps mixed and legacy topologies backward-compatible', () => {
    expect(allowedUnitTypes('mixed')).toHaveLength(5);
    expect(allowedUnitTypes('unspecified')).toHaveLength(5);
    expect(unitTypeOptions('mixed').map(([value]) => value)).toContain('house');
  });

  it('disambiguates repeated human unit codes with building context', () => {
    expect(unitReferenceLabel({ code: '1-A', buildingName: 'Torre II' })).toBe('Torre II · 1-A');
    expect(unitReferenceLabel({ code: '1-A' })).toBe('1-A');
  });
});
