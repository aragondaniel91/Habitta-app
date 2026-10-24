import { describe, expect, it } from 'vitest';
import {
  billingAccountLevel,
  defaultAdministrativeChargeScope,
  financialAccountIdentity,
  supportedAdministrativeChargeScopes,
} from './billing-target-model';

describe('HAB-PILOT-004 physical topology versus billable entity contract', () => {
  it('preserves single-building apartment-level receivables', () => {
    expect(supportedAdministrativeChargeScopes('single_building')).toEqual(['unit']);
    expect(defaultAdministrativeChargeScope('single_building')).toBe('unit');
    expect(billingAccountLevel('single_building', 'unit')).toBe('individual_unit');
    expect(billingAccountLevel('single_building', 'building')).toBeNull();
  });

  it('preserves house communities as directly billable houses', () => {
    expect(supportedAdministrativeChargeScopes('house_community')).toEqual(['unit']);
    expect(billingAccountLevel('house_community', 'unit')).toBe('individual_unit');
    expect(billingAccountLevel('house_community', 'building')).toBeNull();
  });

  it('distinguishes existing per-apartment complexes from general per-building condos', () => {
    expect(supportedAdministrativeChargeScopes('multi_building_complex')).toEqual([
      'unit',
      'building',
    ]);
    // This default protects already registered buildings and their ledgers.
    expect(defaultAdministrativeChargeScope('multi_building_complex')).toBe('unit');
    expect(billingAccountLevel('multi_building_complex', 'unit')).toBe('individual_unit');
    expect(billingAccountLevel('multi_building_complex', 'building')).toBe('whole_building');
  });

  it('retains mixed-topology direct units without inventing a universal apartment kind', () => {
    expect(supportedAdministrativeChargeScopes('mixed')).toEqual(['unit']);
    expect(billingAccountLevel('mixed', 'unit')).toBe('individual_unit');
    expect(billingAccountLevel('mixed', 'building')).toBeNull();
    expect(defaultAdministrativeChargeScope('unspecified')).toBeNull();
    expect(supportedAdministrativeChargeScopes('unspecified')).toEqual([]);
  });

  it('keeps the general condo receivable with Edificio 3 when its board contact changes', () => {
    const paymentAccount = {
      condominiumId: 'general-muchachera',
      billingUnitId: 'edificio-3-billing-unit',
    };
    expect(
      financialAccountIdentity({
        ...paymentAccount,
        representativePersonId: 'former-board-president',
      }),
    ).toEqual({
      condominiumId: 'general-muchachera',
      unitId: 'edificio-3-billing-unit',
    });
    expect(
      financialAccountIdentity({
        ...paymentAccount,
        representativePersonId: 'new-board-president',
      }),
    ).toEqual({
      condominiumId: 'general-muchachera',
      unitId: 'edificio-3-billing-unit',
    });
  });
});
