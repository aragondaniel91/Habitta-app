import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BillingProviderIgnoredEventError,
  BillingProviderUnavailableError,
  BillingProviderVerificationError,
  resolveBillingProvider,
} from './billing-provider';
import type { NotificationBindings } from './notifications/types';

const stripeEnv = (overrides: Partial<NotificationBindings> = {}) =>
  ({
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
    ...overrides,
  }) as NotificationBindings;

const withoutStripeSecret = (key: 'STRIPE_SECRET_KEY' | 'STRIPE_WEBHOOK_SECRET') => {
  const env = stripeEnv();
  delete env[key];
  return env;
};

const sign = async (body: string, timestamp: number, secret = 'whsec_habitta') => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
  const hex = [...new Uint8Array(signature)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  return `t=${timestamp},v1=${hex}`;
};

const webhookRequest = async (event: unknown) => {
  const body = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  return new Request('https://api.mihabitta.com/billing/webhooks/stripe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Stripe-Signature': await sign(body, timestamp),
    },
    body,
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HAB-436 Stripe adapter', () => {
  it('fails closed unless both Stripe server secrets are configured', () => {
    expect(() => resolveBillingProvider(withoutStripeSecret('STRIPE_SECRET_KEY'))).toThrow(
      BillingProviderUnavailableError,
    );
    expect(() => resolveBillingProvider(withoutStripeSecret('STRIPE_WEBHOOK_SECRET'))).toThrow(
      'Stripe billing secrets are not configured.',
    );
  });

  it('creates a hosted setup-mode Checkout Session without making Stripe subscription authority', async () => {
    const stripeFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: 'cs_test_hab436',
            mode: 'setup',
            url: 'https://checkout.stripe.com/c/pay/cs_test_hab436',
            customer: null,
            setup_intent: null,
            expires_at: Math.floor(Date.now() / 1000) + 1800,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', stripeFetch);

    const provider = resolveBillingProvider(stripeEnv());
    const setup = await provider.createPaymentMethodSetup({
      attemptId: '43690000-0000-4000-8000-000000000001',
      subscriptionId: '43620000-0000-4000-8000-000000000001',
      condominiumId: '43610000-0000-4000-8000-000000000001',
      returnUrl: 'https://app.mihabitta.com/settings',
    });

    expect(setup.provider).toBe('stripe');
    expect(setup.providerSetupRef).toBe('cs_test_hab436');
    expect(setup.providerCustomerRef).toBeNull();
    expect(setup.action.url).toBe('https://checkout.stripe.com/c/pay/cs_test_hab436');

    const [url, init] = stripeFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.stripe.com/v1/checkout/sessions');
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer sk_test_habitta');
    expect(headers.get('Idempotency-Key')).toBe('43690000-0000-4000-8000-000000000001');
    const form = init.body as URLSearchParams;
    expect(form.get('mode')).toBe('setup');
    expect(form.get('customer_creation')).toBe('always');
    expect(form.getAll('payment_method_types[]')).toEqual(['card']);
    expect(form.get('metadata[habitta_subscription_id]')).toBe(
      '43620000-0000-4000-8000-000000000001',
    );
    expect([...form.keys()].some((key) => key.includes('price'))).toBe(false);
    expect([...form.keys()].some((key) => key.includes('subscription'))).toBe(true);
    expect(form.has('line_items[0][price]')).toBe(false);
  });

  it('verifies the raw Stripe signature and normalizes a completed setup session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        expect(url).toBe('https://api.stripe.com/v1/setup_intents/seti_hab436');
        return new Response(
          JSON.stringify({
            id: 'seti_hab436',
            status: 'succeeded',
            customer: 'cus_hab436',
            payment_method: 'pm_hab436',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );

    const provider = resolveBillingProvider(stripeEnv());
    const event = await provider.verifyAndNormalizeWebhook(
      await webhookRequest({
        id: 'evt_checkout_hab436',
        type: 'checkout.session.completed',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'cs_hab436',
            mode: 'setup',
            customer: 'cus_hab436',
            setup_intent: 'seti_hab436',
            metadata: { habitta_subscription_id: '43620000-0000-4000-8000-000000000001' },
          },
        },
      }),
    );

    expect(event).toMatchObject({
      provider: 'stripe',
      eventId: 'evt_checkout_hab436',
      eventType: 'payment_method_ready',
      subscriptionId: '43620000-0000-4000-8000-000000000001',
      providerSetupRef: 'cs_hab436',
      providerCustomerRef: 'cus_hab436',
      paymentMethodRef: 'pm_hab436',
    });
  });

  it('rejects a Stripe webhook whose raw body does not match its signature', async () => {
    const body = JSON.stringify({ id: 'evt_bad', type: 'unrelated.event', created: 1, data: {} });
    const request = new Request('https://api.mihabitta.com/billing/webhooks/stripe', {
      method: 'POST',
      headers: { 'Stripe-Signature': `t=${Math.floor(Date.now() / 1000)},v1=deadbeef` },
      body,
    });
    const provider = resolveBillingProvider(stripeEnv());
    await expect(provider.verifyAndNormalizeWebhook(request)).rejects.toThrow(
      BillingProviderVerificationError,
    );
  });

  it('normalizes successful Stripe PaymentIntent amounts into Habitta commercial currency units', async () => {
    const provider = resolveBillingProvider(stripeEnv());
    const event = await provider.verifyAndNormalizeWebhook(
      await webhookRequest({
        id: 'evt_pi_hab436',
        type: 'payment_intent.succeeded',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'pi_hab436',
            amount: 2900,
            amount_received: 2900,
            currency: 'usd',
            customer: 'cus_hab436',
            payment_method: 'pm_hab436',
            metadata: { habitta_subscription_id: '43620000-0000-4000-8000-000000000001' },
          },
        },
      }),
    );

    expect(event.eventType).toBe('charge_succeeded');
    expect(event.providerPaymentRef).toBe('pi_hab436');
    expect(event.amount).toBe(29);
    expect(event.currency).toBe('USD');
  });

  it('creates an off-session PaymentIntent from Habitta-owned amount and idempotency', async () => {
    const stripeFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: 'pi_charge_hab436', status: 'processing' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', stripeFetch);
    const provider = resolveBillingProvider(stripeEnv());

    const result = await provider.chargeSavedPaymentMethod({
      billingAttemptId: '43680000-0000-4000-8000-000000000001',
      subscriptionId: '43620000-0000-4000-8000-000000000001',
      providerCustomerRef: 'cus_hab436',
      paymentMethodRef: 'pm_hab436',
      amount: 29,
      currency: 'USD',
      description: 'Habitta Esencial · September 2026',
    });

    expect(result).toEqual({
      provider: 'stripe',
      providerPaymentRef: 'pi_charge_hab436',
      status: 'processing',
    });
    const [, init] = stripeFetch.mock.calls[0] as unknown as [string, RequestInit];
    const headers = new Headers(init.headers);
    const form = init.body as URLSearchParams;
    expect(headers.get('Idempotency-Key')).toBe('43680000-0000-4000-8000-000000000001');
    expect(form.get('amount')).toBe('2900');
    expect(form.get('currency')).toBe('usd');
    expect(form.get('confirm')).toBe('true');
    expect(form.get('off_session')).toBe('true');
    expect(form.get('metadata[habitta_subscription_id]')).toBe(
      '43620000-0000-4000-8000-000000000001',
    );
  });

  it('acknowledges unrelated Stripe events as intentionally ignored at the adapter boundary', async () => {
    const provider = resolveBillingProvider(stripeEnv());
    await expect(
      provider.verifyAndNormalizeWebhook(
        await webhookRequest({
          id: 'evt_unrelated_hab436',
          type: 'customer.updated',
          created: Math.floor(Date.now() / 1000),
          data: { object: { id: 'cus_hab436' } },
        }),
      ),
    ).rejects.toThrow(BillingProviderIgnoredEventError);
  });
});
