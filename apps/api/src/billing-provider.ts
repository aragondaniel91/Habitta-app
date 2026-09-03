import type { NotificationBindings } from './notifications/types';

export type BillingSetupInput = {
  attemptId: string;
  subscriptionId: string;
  condominiumId: string;
  returnUrl: string;
};

export type BillingSetupSession = {
  provider: string;
  providerSetupRef: string;
  providerCustomerRef: string;
  expiresAt: string;
  action: {
    kind: 'redirect';
    url: string;
  };
};

export type NormalizedBillingProviderEvent = {
  provider: string;
  eventId: string;
  eventType:
    | 'payment_method_ready'
    | 'payment_method_removed'
    | 'setup_failed'
    | 'charge_succeeded'
    | 'charge_failed';
  subscriptionId: string | null;
  providerSetupRef: string | null;
  providerCustomerRef: string | null;
  paymentMethodRef: string | null;
  providerPaymentRef: string | null;
  amount: number | null;
  currency: string | null;
  occurredAt: string;
};

export interface BillingProviderAdapter {
  readonly name: string;
  createPaymentMethodSetup(input: BillingSetupInput): Promise<BillingSetupSession>;
  verifyAndNormalizeWebhook(request: Request): Promise<NormalizedBillingProviderEvent>;
}

export class BillingProviderUnavailableError extends Error {
  constructor(message = 'Billing provider is not configured.') {
    super(message);
    this.name = 'BillingProviderUnavailableError';
  }
}

// A deterministic contract adapter for local/CI development only. It deliberately does not mark a
// payment method ready and cannot be enabled in production. Its only job is to exercise the
// provider boundary before a real provider is selected/configured.
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
        url: `${input.returnUrl}${input.returnUrl.includes('?') ? '&' : '?'}billingSetup=mock&attempt=${encodeURIComponent(input.attemptId)}`,
      },
    };
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
      throw new BillingProviderUnavailableError('Mock billing provider is forbidden in production.');
    }
    return mockBillingProvider();
  }

  throw new BillingProviderUnavailableError(`Unsupported billing provider: ${configured}`);
}
