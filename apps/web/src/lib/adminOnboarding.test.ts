import { describe, expect, it } from 'vitest';
import {
  createEmptyAdminOnboardingInput,
  suggestedCurrency,
  suggestedTimezone,
  validateAdminOnboarding,
} from './adminOnboarding';

describe('administrator onboarding', () => {
  it('provides Venezuela-friendly defaults', () => {
    const input = createEmptyAdminOnboardingInput();
    expect(input.countryCode).toBe('VE');
    expect(input.primaryCurrencyCode).toBe('VES');
    expect(input.secondaryCurrencyCode).toBe('USD');
    expect(input.timezone).toBe('America/Caracas');
  });

  it('requires organization details for a new administrator', () => {
    const input = createEmptyAdminOnboardingInput();
    const errors = validateAdminOnboarding(input, false);
    expect(errors.organizationName).toBeTruthy();
    expect(errors.condominiumName).toBeTruthy();
    expect(errors.city).toBeTruthy();
  });

  it('requires an existing organization when adding another condominium', () => {
    const input = createEmptyAdminOnboardingInput();
    input.condominiumName = 'Residencias Los Pinos';
    input.city = 'Caracas';
    const errors = validateAdminOnboarding(input, true);
    expect(errors.organizationId).toBeTruthy();
    expect(errors.organizationName).toBeUndefined();
  });

  it('rejects duplicate primary and secondary currencies', () => {
    const input = createEmptyAdminOnboardingInput('org-1');
    input.condominiumName = 'Residencias Los Pinos';
    input.city = 'Caracas';
    input.secondaryCurrencyCode = input.primaryCurrencyCode;
    expect(validateAdminOnboarding(input, true).secondaryCurrencyCode).toBeTruthy();
  });

  it('suggests country-specific currency and timezone values', () => {
    expect(suggestedCurrency('CL')).toBe('CLP');
    expect(suggestedTimezone('CL')).toBe('America/Santiago');
    expect(suggestedCurrency('PA')).toBe('USD');
  });
});
