import { describe, expect, it } from 'vitest';
import {
  BillingProviderUnavailableError,
  resolveBillingProvider,
} from './billing-provider';
import type { NotificationBindings } from './notifications/types';

const env = (overrides: Partial<NotificationBindings> = {}) =>
  ({
    APP_ENV: 'development',
    APP_BASE_URL: 'https://app.mihabitta.com',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    NOTIFICATIONS_FROM_EMAIL: 'noreply@example.com',
    NOTIFICATIONS_FROM_NAME: 'Habitta',
    ...overrides,
  }) as NotificationBindings;

describe('HAB-436 billing provider adapter', () => {
  it('fails closed when no billing provider is configured', () => {
    expect(() => resolveBillingProvider(env())).toThrow(BillingProviderUnavailableError);
  });

  it('refuses the mock adapter in production', () => {
    expect(() => resolveBillingProvider(env({ APP_ENV: 'production', BILLING_PROVIDER: 'mock' }))).toThrow(
      'Mock billing provider is forbidden in production.',
    );
  });

  it('refuses unknown provider names instead of silently choosing one', () => {
    expect(() => resolveBillingProvider(env({ BILLING_PROVIDER: 'stripe' }))).toThrow(
      'Unsupported billing provider: stripe',
    );
  });

  it('provides a deterministic dev-only setup contract without marking payment readiness', async () => {
    const provider = resolveBillingProvider(env({ BILLING_PROVIDER: 'mock' }));
    const setup = await provider.createPaymentMethodSetup({
      attemptId: '43690000-0000-4000-8000-000000000001',
      subscriptionId: '43620000-0000-4000-8000-000000000001',
      condominiumId: '43610000-0000-4000-8000-000000000001',
      returnUrl: 'https://app.mihabitta.com/settings',
    });

    expect(setup.provider).toBe('mock');
    expect(setup.providerSetupRef).toBe('set_mock_43690000000040008000');
    expect(setup.providerCustomerRef).toBe('cus_mock_43620000000040008000');
    expect(setup.action.kind).toBe('redirect');
    expect(setup.action.url).toContain('billingSetup=mock');
    expect(setup.action.url).toContain('attempt=43690000-0000-4000-8000-000000000001');
  });

  it('never accepts mock webhook traffic', async () => {
    const provider = resolveBillingProvider(env({ BILLING_PROVIDER: 'mock' }));
    await expect(provider.verifyAndNormalizeWebhook(new Request('https://example.test'))).rejects.toThrow(
      'Mock billing provider never accepts webhook traffic.',
    );
  });
});
