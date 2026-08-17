import { describe, expect, it } from 'vitest';
import {
  createEmptyAdminOnboardingInput,
  topologyLabel,
  validateAdminOnboarding,
  type AdminOnboardingInput,
} from './lib/adminOnboarding';
import { allowedUnitTypes, defaultUnitType } from './lib/unit-domain';

function validInput(): AdminOnboardingInput {
  return {
    ...createEmptyAdminOnboardingInput('organization-id'),
    condominiumName: 'Residencias Los Pinos',
    addressLine1: 'Av. Principal, Urbanización Los Pinos',
    city: 'Caracas',
    propertyTopology: 'single_building',
    declaredUnitCount: '48',
  };
}

describe('HAB-183 condominium operating model', () => {
  it('starts Venezuela onboarding with RIF suggested but requires an explicit topology choice', () => {
    const input = createEmptyAdminOnboardingInput();
    expect(input.countryCode).toBe('VE');
    expect(input.legalIdType).toBe('RIF');
    expect(input.propertyTopology).toBe('');
  });

  it('validates topology-specific declared structure', () => {
    const house = {
      ...validInput(),
      propertyTopology: 'house_community' as const,
      declaredUnitCount: '',
    };
    expect(validateAdminOnboarding(house, true).declaredUnitCount).toContain('casas');

    const multi = {
      ...validInput(),
      propertyTopology: 'multi_building_complex' as const,
      declaredUnitCount: '',
      declaredBuildingCount: '1',
    };
    expect(validateAdminOnboarding(multi, true).declaredBuildingCount).toContain('2');

    const validMulti = { ...multi, declaredBuildingCount: '4' };
    expect(validateAdminOnboarding(validMulti, true).declaredBuildingCount).toBeUndefined();
  });

  it('keeps legal identification optional while requiring a type when a number is entered', () => {
    const suggestedOnly = { ...validInput(), legalIdType: 'RIF', legalIdNumber: '' };
    expect(validateAdminOnboarding(suggestedOnly, true).legalIdNumber).toBeUndefined();

    const numberWithoutType = {
      ...validInput(),
      legalIdType: '',
      legalIdNumber: 'J-12345678-9',
    };
    expect(validateAdminOnboarding(numberWithoutType, true).legalIdType).toBeTruthy();

    const omitted = { ...validInput(), legalIdType: '', legalIdNumber: '' };
    expect(validateAdminOnboarding(omitted, true).legalIdNumber).toBeUndefined();

    const complete = { ...validInput(), legalIdType: 'RIF', legalIdNumber: 'J-12345678-9' };
    expect(validateAdminOnboarding(complete, true).legalIdNumber).toBeUndefined();
  });

  it('adapts unit choices to the topology selected during onboarding', () => {
    expect(defaultUnitType('house_community')).toBe('house');
    expect(allowedUnitTypes('house_community')).not.toContain('apartment');
    expect(allowedUnitTypes('single_building')).not.toContain('house');
    expect(allowedUnitTypes('multi_building_complex')).not.toContain('house');
    expect(allowedUnitTypes('mixed')).toContain('house');
  });

  it('provides administrator-facing labels for supported topologies', () => {
    expect(topologyLabel('house_community')).toBe('Conjunto de casas');
    expect(topologyLabel('single_building')).toBe('Edificio residencial');
    expect(topologyLabel('multi_building_complex')).toBe('Conjunto residencial');
    expect(topologyLabel('mixed')).toBe('Estructura mixta');
  });
});
