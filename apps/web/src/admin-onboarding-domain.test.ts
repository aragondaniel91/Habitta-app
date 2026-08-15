import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createEmptyAdminOnboardingInput,
  topologyLabel,
  validateAdminOnboarding,
  type AdminOnboardingInput,
} from './lib/adminOnboarding';

const onboardingSource = readFileSync(new URL('./lib/adminOnboarding.ts', import.meta.url), 'utf8');
const structureSource = readFileSync(
  new URL('./pages/StructureManagementPage.tsx', import.meta.url),
  'utf8',
);

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
    const house = { ...validInput(), propertyTopology: 'house_community' as const, declaredUnitCount: '' };
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

  it('keeps legal identification optional but requires type and number as a pair', () => {
    const missingNumber = { ...validInput(), legalIdType: 'RIF', legalIdNumber: '' };
    expect(validateAdminOnboarding(missingNumber, true).legalIdNumber).toBeTruthy();

    const omitted = { ...validInput(), legalIdType: '', legalIdNumber: '' };
    expect(validateAdminOnboarding(omitted, true).legalIdNumber).toBeUndefined();

    const complete = { ...validInput(), legalIdType: 'RIF', legalIdNumber: 'J-12345678-9' };
    expect(validateAdminOnboarding(complete, true).legalIdNumber).toBeUndefined();
  });

  it('uses the v2 onboarding RPC contract instead of ambiguous approximate-unit fields', () => {
    expect(onboardingSource).toContain("supabase.rpc('create_admin_workspace_v2'");
    expect(onboardingSource).toContain("supabase.rpc('create_condominium_with_profile_v2'");
    expect(onboardingSource).toContain('declared_unit_count');
    expect(onboardingSource).toContain('declared_building_count');
    expect(onboardingSource).not.toContain('approximateUnits');
  });

  it('adapts structure controls for house and single-building communities', () => {
    expect(structureSource).toContain("const houseMode = topology === 'house_community'");
    expect(structureSource).toContain("const singleBuildingMode = topology === 'single_building'");
    expect(structureSource).toContain('!houseMode && !singleBuildingMode');
    expect(structureSource).toContain("houseMode ? 'house' : 'apartment'");
  });

  it('provides administrator-facing labels for supported topologies', () => {
    expect(topologyLabel('house_community')).toBe('Conjunto de casas');
    expect(topologyLabel('single_building')).toBe('Edificio residencial');
    expect(topologyLabel('multi_building_complex')).toBe('Conjunto residencial');
    expect(topologyLabel('mixed')).toBe('Estructura mixta');
  });
});
