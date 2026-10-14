import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerPaymentAgreementRoutes } from './payment-agreement-routes';

const condominiumId = '91320000-0000-0000-0000-000000000001';
const unitId = '91330000-0000-0000-0000-000000000001';
const receivableId = '91360000-0000-0000-0000-000000000001';
const env = { SUPABASE_URL: 'https://supabase.test', SUPABASE_ANON_KEY: 'anon-key' };

const app = () => {
  const router = new Hono<{ Bindings: typeof env; Variables: { token: string; userId: string } }>();
  router.use('*', async (c, next) => {
    c.set('token', 'caller-token');
    c.set('userId', 'caller');
    await next();
  });
  registerPaymentAgreementRoutes(router as never);
  return router;
};

afterEach(() => vi.unstubAllGlobals());

describe('payment agreement routes', () => {
  it('sends only schedule metadata to the agreement RPC', async () => {
    const requests: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
        return new Response(JSON.stringify({ id: 'agreement-id', status: 'pending' }), {
          status: 200,
        });
      }),
    );
    const response = await app().request(
      `/${condominiumId}/payment-agreements`,
      {
        method: 'POST',
        body: JSON.stringify({
          unitId,
          currencyCode: 'USD',
          receivableItemIds: [receivableId],
          installments: [{ dueDate: '2026-12-01', amount: '50.00', currencyCode: 'USD' }],
          idempotencyKey: 'agreement-api-test',
        }),
      },
      env,
    );
    expect(response.status).toBe(201);
    expect(requests[0]).toEqual({
      url: `${env.SUPABASE_URL}/rest/v1/rpc/create_payment_agreement`,
      body: expect.objectContaining({
        target_condominium: condominiumId,
        target_unit: unitId,
        target_receivable_ids: [receivableId],
        target_schedule: [{ due_date: '2026-12-01', amount: '50.00', currency_code: 'USD' }],
      }),
    });
    expect(JSON.stringify(requests[0]?.body)).not.toContain('payment_allocation');
  });
});
