import { describe, expect, it } from 'vitest';
import { buildOnboardingRequest } from './lib/onboarding';

describe('onboarding API contracts', () => {
  it('creates an organization and its first condominium atomically for a new account', () => {
    expect(
      buildOnboardingRequest({
        organizationId: '',
        organizationName: ' Administradora Los Samanes ',
        condominiumName: ' Residencias Los Samanes ',
      }),
    ).toEqual({
      path: '/v1/organizations',
      body: {
        name: 'Administradora Los Samanes',
        condominiumName: 'Residencias Los Samanes',
      },
    });
  });

  it('adds a condominium to an existing organization without recreating it', () => {
    expect(
      buildOnboardingRequest({
        organizationId: '98fa227c-0289-49b9-9db1-84aaf37f9373',
        organizationName: '',
        condominiumName: ' Residencias Ávila ',
      }),
    ).toEqual({
      path: '/v1/condominiums',
      body: {
        organizationId: '98fa227c-0289-49b9-9db1-84aaf37f9373',
        name: 'Residencias Ávila',
      },
    });
  });
});
