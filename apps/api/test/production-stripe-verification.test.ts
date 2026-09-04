import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  stripeWebhookSignature,
  verifyProductionStripe,
} from '../../../scripts/release/verify-production-stripe.mjs';

describe('HAB-436 production Stripe verification', () => {
  it('uses a read-only Stripe account probe and a harmless signed ignored webhook', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const secretKey = 'sk_live_redacted_fixture';
    const webhookSecret = 'whsec_redacted_fixture';
    const workerUrl = 'https://habitta-api-prod.example.workers.dev';
    const now = 1_788_534_000_000;

    const result = await verifyProductionStripe({
      secretKey,
      webhookSecret,
      workerUrl,
      now,
      fetchImpl: async (input, init) => {
        const url = String(input);
        calls.push({ url, init });

        if (url === 'https://api.stripe.com/v1/account') {
          expect(init?.method).toBe('GET');
          expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${secretKey}`);
          return Response.json({ id: 'acct_habitta_fixture', object: 'account' });
        }

        expect(url).toBe(`${workerUrl}/billing/webhooks/stripe`);
        expect(init?.method).toBe('POST');
        const headers = new Headers(init?.headers);
        const rawBody = String(init?.body);
        const payload = JSON.parse(rawBody) as { type?: string; data?: unknown };
        expect(payload.type).toBe('habitta.production_release_probe');
        expect(payload.data).toBeTruthy();

        const timestamp = Math.floor(now / 1000);
        const expected = createHmac('sha256', webhookSecret)
          .update(`${timestamp}.${rawBody}`)
          .digest('hex');
        expect(headers.get('Stripe-Signature')).toBe(`t=${timestamp},v1=${expected}`);
        expect(headers.get('Content-Type')).toBe('application/json');

        return Response.json({ received: true, ignored: true });
      },
    });

    expect(result).toEqual({ accountId: 'acct_habitta_fixture', webhookVerified: true });
    expect(calls).toHaveLength(2);
    expect(calls.filter((call) => call.url.startsWith('https://api.stripe.com'))).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.stripe.com/v1/account');
    expect(calls[0]?.init?.method).toBe('GET');
    expect(calls.some((call) => call.url.includes('payment_intents'))).toBe(false);
    expect(calls.some((call) => call.url.includes('checkout/sessions'))).toBe(false);
    expect(calls.some((call) => call.url.includes('setup_intents'))).toBe(false);
  });

  it('fails closed without leaking Stripe secret material', async () => {
    const secretKey = 'sk_live_do_not_leak';
    const webhookSecret = 'whsec_do_not_leak';

    await expect(
      verifyProductionStripe({
        secretKey,
        webhookSecret,
        workerUrl: 'https://habitta-api-prod.example.workers.dev',
        fetchImpl: async () => new Response('{}', { status: 401 }),
      }),
    ).rejects.toThrow('stripe_account_probe_failed:401');

    try {
      await verifyProductionStripe({
        secretKey,
        webhookSecret,
        workerUrl: 'https://habitta-api-prod.example.workers.dev',
        fetchImpl: async () => new Response('{}', { status: 401 }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain(secretKey);
      expect(message).not.toContain(webhookSecret);
    }
  });

  it('builds deterministic Stripe-compatible HMAC signatures', () => {
    expect(
      stripeWebhookSignature({
        secret: 'whsec_fixture',
        timestamp: 123,
        rawBody: '{"hello":"world"}',
      }),
    ).toBe(createHmac('sha256', 'whsec_fixture').update('123.{"hello":"world"}').digest('hex'));
  });
});
