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
  it('uses one database-side exact-numeric page query, then fetches only that page', async () => {
    const requests: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
        if (url.includes('rpc/list_payment_agreement_ids'))
          return new Response(JSON.stringify([{ agreement_id: 'agreement-1', total_count: 1 }]));
        if (url.includes('payment_agreements?'))
          return new Response(
            JSON.stringify([
              {
                id: 'agreement-1',
                updated_at: '2026-10-20T10:00:00.000Z',
              },
            ]),
          );
        return new Response(JSON.stringify([]));
      }),
    );
    const response = await app().request(
      `/${condominiumId}/payment-agreements?page=1&pageSize=10&unitId=${unitId}&status=accepted&minAmount=${(0.1 + 0.2).toFixed(2)}&maxAmount=0.30&periodFrom=2026-11-01&sort=amountDesc`,
      {},
      env,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      page: 1,
      pageSize: 10,
      total: 1,
      items: [{ id: 'agreement-1' }],
    });
    expect(requests).toHaveLength(5);
    expect(requests[0]).toEqual({
      url: `${env.SUPABASE_URL}/rest/v1/rpc/list_payment_agreement_ids`,
      body: expect.objectContaining({
        target_condominium: condominiumId,
        target_unit: unitId,
        target_status: 'accepted',
        target_min_amount: '0.30',
        target_max_amount: '0.30',
        target_page: 1,
        target_page_size: 10,
        target_sort: 'amountDesc',
      }),
    });
    expect(requests.every((request) => !request.url.includes('offset='))).toBe(true);

    const invalid = await app().request(
      `/${condominiumId}/payment-agreements?minAmount=20&maxAmount=10`,
      {},
      env,
    );
    expect(invalid.status).toBe(400);
  });

  it('rejects malformed money filter values before making an upstream request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await app().request(
      `/${condominiumId}/payment-agreements?minAmount=0.30000000000000004`,
      {},
      env,
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

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
