import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from './index';

const condo = '22222222-2222-4222-8222-222222222221';
const payments = Array.from({ length: 10 }, (_, i) => ({
  id: `88888888-8888-4888-8888-${String(i + 1).padStart(12, '0')}`,
  condominium_id: condo,
  status: i % 2 === 0 ? 'submitted' : 'under_review',
}));
const env = { SUPABASE_URL: 'https://supabase.test', SUPABASE_ANON_KEY: 'anon' };

function setup(allowed: boolean, includeContentRange = true) {
  const calls: { url: string; authorization: string; body?: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const url = String(input);
      const headers = new Headers(init.headers);
      calls.push({
        url,
        authorization: headers.get('Authorization') ?? '',
        body: typeof init.body === 'string' ? init.body : undefined,
      });
      if (url.endsWith('/auth/v1/user')) {
        return Response.json({ id: 'admin-user' });
      }
      if (url.endsWith('/rpc/can_review_payments')) {
        return Response.json(allowed);
      }
      if (url.endsWith('/rpc/can_approve_payment')) {
        const paymentId = JSON.parse(String(init.body)).target_payment as string;
        return Response.json(paymentId.endsWith('000000000002'));
      }
      if (url.includes('/rest/v1/payment_allocations?')) {
        return Response.json([]);
      }
      if (url.includes('/rest/v1/payments?')) {
        return Response.json(payments, {
          headers: includeContentRange ? { 'content-range': '0-9/48' } : {},
        });
      }
      throw new Error('Unexpected upstream URL: ' + url);
    }),
  );
  return calls;
}

async function request(query = 'page=2&pageSize=10&currencyCode=USD') {
  return app.request(
    '/v1/condominiums/' + condo + '/payments/review-queue?' + query,
    {
      headers: { Authorization: 'Bearer reviewer-jwt' },
    },
    env as never,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('Review queue: security, count and per-payment permissions', () => {
  it('returns exact global count with only the requested page and individual capabilities', async () => {
    const calls = setup(true);
    const response = await request();
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      items: Array<{ id: string; can_approve: boolean }>;
      total: number;
      page: number;
      totalPages: number;
      hasNextPage: boolean;
    };
    expect(data).toMatchObject({ total: 48, page: 2, totalPages: 5, hasNextPage: true });
    expect(data.items).toHaveLength(10);
    expect(data.items[0]?.can_approve).toBe(false);
    expect(data.items[1]?.can_approve).toBe(true);
    const list = calls.find((call) => call.url.includes('/rest/v1/payments?'));
    expect(list?.url).toContain('condominium_id=eq.' + condo);
    expect(list?.url).toContain('status=in.(submitted,under_review)');
    expect(list?.url).toContain('original_currency_code=eq.USD');
    expect(list?.url).toContain('limit=10&offset=10');
    expect(list?.authorization).toBe('Bearer reviewer-jwt');
    expect(calls.filter((call) => call.url.endsWith('/rpc/can_approve_payment'))).toHaveLength(10);
  });

  it('refuses denied reviewer without querying payments or capabilities', async () => {
    const calls = setup(false);
    const response = await request();
    expect(response.status).toBe(403);
    expect(calls.some((call) => call.url.includes('/rest/v1/payments?'))).toBe(false);
    expect(calls.some((call) => call.url.endsWith('/rpc/can_approve_payment'))).toBe(false);
  });

  it('does not silently invent totals when Content-Range is missing', async () => {
    setup(true, false);
    const response = await request();
    expect(response.status).toBe(502);
  });

  it('rejects unsafe/unreviewable filters before querying payments', async () => {
    const calls = setup(true);
    const response = await request('page=1&pageSize=10&status=reversed');
    expect(response.status).toBe(400);
    expect(calls.some((call) => call.url.includes('/rest/v1/payments?'))).toBe(false);
  });

  it('rejects requests without a bearer token before any upstream call', async () => {
    const calls = setup(true);
    const response = await app.request(
      '/v1/condominiums/' + condo + '/payments/review-queue?page=1',
    );
    expect(response.status).toBe(401);
    expect(calls).toHaveLength(0);
  });
});
