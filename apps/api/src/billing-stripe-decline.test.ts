import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveBillingProvider } from './billing-provider';
import type { NotificationBindings } from './notifications/types';

const env = {
  APP_ENV: 'development',
  APP_BASE_URL: 'https://app.mihabitta.com',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  BILLING_PROVIDER: 'stripe',
  STRIPE_SECRET_KEY: 'sk_test_habitta',
  STRIPE_WEBHOOK_SECRET: 'whsec_habitta',
  NOTIFICATIONS_FROM_EMAIL: 'noreply@example.com',
  NOTIFICATIONS_FROM_NAME: 'Habitta',
} as NotificationBindings;

afterEach(() => vi.unstubAllGlobals());

describe('HAB-436 Stripe decline identity', () => {
  it('keeps the definitive failed PaymentIntent reference from an HTTP 402 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                type: 'card_error',
                code: 'card_declined',
                payment_intent: { id: 'pi_declined_hab436', status: 'requires_payment_method' },
              },
            }),
            { status: 402, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );

    const provider = resolveBillingProvider(env);
    const result = await provider.chargeSavedPaymentMethod({
      billingAttemptId: '43680000-0000-4000-8000-000000000099',
      subscriptionId: '43620000-0000-4000-8000-000000000099',
      providerCustomerRef: 'cus_hab436',
      paymentMethodRef: 'pm_hab436',
      amount: 29,
      currency: 'USD',
      description: 'Habitta · 2026-09-03',
    });

    expect(result).toEqual({
      provider: 'stripe',
      providerPaymentRef: 'pi_declined_hab436',
      status: 'failed',
      errorCode: 'card_declined',
    });
  });
});
