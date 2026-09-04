import type { BillingProviderAdapter } from './billing-provider-contract';
import { BillingProviderUnavailableError } from './billing-provider-contract';
import { createStripeBillingProvider } from './stripe-billing-provider';
import type { NotificationBindings } from './notifications/types';

export * from './billing-provider-contract';

const addQuery = (url: string, values: Record<string, string>) => {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(values)) parsed.searchParams.set(key, value);
  return parsed.toString();
};

// A deterministic contract adapter for local/CI development only. It deliberately does not mark a
// payment method ready, create charges or accept webhooks. Production can never resolve it.
const mockBillingProvider = (): BillingProviderAdapter => ({
  name: 'mock',
  async createPaymentMethodSetup(input) {
    const suffix = input.attemptId.replaceAll('-', '').slice(0, 20);
    return {
      provider: 'mock',
      providerSetupRef: `set_mock_${suffix}`,
      providerCustomerRef: `cus_mock_${input.subscriptionId.replaceAll('-', '').slice(0, 20)}`,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      action: {
        kind: 'redirect',
        url: addQuery(input.returnUrl, { billingSetup: 'mock', attempt: input.attemptId }),
      },
    };
  },
  async chargeSavedPaymentMethod() {
    throw new BillingProviderUnavailableError('Mock billing provider never creates charges.');
  },
  async verifyAndNormalizeWebhook() {
    throw new BillingProviderUnavailableError(
      'Mock billing provider never accepts webhook traffic. Use DB-level provider event fixtures in tests.',
    );
  },
});

export function resolveBillingProvider(env: NotificationBindings): BillingProviderAdapter {
  const configured = env.BILLING_PROVIDER?.trim().toLowerCase();
  if (!configured) throw new BillingProviderUnavailableError();

  if (configured === 'mock') {
    if (env.APP_ENV === 'production') {
      throw new BillingProviderUnavailableError(
        'Mock billing provider is forbidden in production.',
      );
    }
    return mockBillingProvider();
  }

  if (configured === 'stripe') return createStripeBillingProvider(env);

  throw new BillingProviderUnavailableError(`Unsupported billing provider: ${configured}`);
}
