import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from './index';

const source = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

const condominiumId = 'a4050000-0000-4000-8000-000000000010';
const paymentId = 'b5050000-0000-4000-8000-000000000020';
const receivableId = 'c6050000-0000-4000-8000-000000000030';
const callerToken = 'caller-scoped-jwt';
const environment = {
  SUPABASE_URL: 'https://supabase.test',
  SUPABASE_ANON_KEY: 'anon-key',
  APP_ENV: 'development',
} as never;

const mockAuthUser = (url: string) => {
  if (url.includes('/auth/v1/user')) {
    return new Response(JSON.stringify({ id: 'a4050000-0000-4000-8000-000000000012' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return null;
};

const request = (method: string, path: string, body?: unknown) => {
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${callerToken}`,
      'Content-Type': 'application/json',
    },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return app.fetch(new Request(`https://api.test${path}`, init), environment);
};

describe('resident payment allocation intent', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps proposal persistence separate from immutable approval allocations', async () => {
    const migration = await source(
      '../../../supabase/migrations/20261018130000_hab_pilot_payment_allocation_intents.sql',
    );
    expect(migration).toContain('create table if not exists public.payment_allocation_intents');
    expect(migration).toContain("p.status not in ('draft','correction_requested')");
    expect(migration).toContain('public.can_manage_payment_draft');
    expect(migration).toContain('unit_id=p.unit_id');
    expect(migration).toContain('item.currency_code <> p.original_currency_code');
    expect(migration).toContain('if used > p.original_amount then');
    expect(migration).toContain(
      'from public.receivable_ledger_entries where receivable_item_id=item.id',
    );
    expect(migration).not.toMatch(/insert into public\.receivable_ledger_entries/i);
    expect(migration).not.toContain('payment_allocations(');
  });

  it('accepts only validated intent payloads through the caller-scoped API route', async () => {
    const api = await source('./index.ts');
    expect(api).toContain('payments/:paymentId/allocation-intent');
    expect(api).toContain('paymentAllocationIntentSchema');
    expect(api).toContain("'save_payment_allocation_intent'");
    expect(api).toContain('proposals: rpcAllocations(p.allocations)');
  });

  it('exposes a caller-scoped proposal read path for review and correction', async () => {
    const [migration, api] = await Promise.all([
      source(
        '../../../supabase/migrations/20261018140000_hab_pilot_payment_allocation_intent_read.sql',
      ),
      source('./index.ts'),
    ]);
    expect(migration).toContain('create policy payment_allocation_intents_read');
    expect(migration).toContain('public.get_payment_allocation_intent');
    expect(migration).toContain('public.can_review_payments');
    expect(migration).toContain('public.can_manage_payment_draft');
    expect(api).toContain("app.get('/v1/condominiums/:id/payments/:paymentId/allocation-intent'");
    expect(api).toContain("'get_payment_allocation_intent'");
  });

  it('routes PUT allocation-intent to RPC with caller token and validated proposals', async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      requests.push({ url, init });
      const auth = mockAuthUser(url);
      if (auth) return auth;
      if (url.includes('/rest/v1/rpc/save_payment_allocation_intent'))
        return new Response(
          JSON.stringify({
            payment_id: paymentId,
            condominium_id: condominiumId,
            proposals: [
              {
                receivable_item_id: receivableId,
                payment_amount: '125.50',
                payment_currency_code: 'USD',
                receivable_amount: '125.50',
                receivable_currency_code: 'USD',
                receivable_per_payment_rate: '1',
              },
            ],
            updated_at: '2026-10-18T12:00:00.000Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    });

    const res = await request(
      'PUT',
      `/v1/condominiums/${condominiumId}/payments/${paymentId}/allocation-intent`,
      {
        allocations: [
          {
            receivableItemId: receivableId,
            paymentAmount: '125.50',
            receivableAmount: '125.50',
            paymentCurrencyCode: 'USD',
            receivableCurrencyCode: 'USD',
            receivablePerPaymentRate: '1',
          },
        ],
      },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { payment_id: string };
    expect(body.payment_id).toBe(paymentId);

    const rpcCall = requests.find(({ url }) => url.includes('/save_payment_allocation_intent'));
    expect(rpcCall).toBeDefined();
    expect(rpcCall?.init?.method).toBe('POST');
    const headers = new Headers(rpcCall?.init?.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${callerToken}`);
    expect(headers.get('apikey')).toBe('anon-key');

    const payload = JSON.parse(String(rpcCall?.init?.body));
    expect(payload.target).toBe(condominiumId);
    expect(payload.target_payment).toBe(paymentId);
    expect(payload.proposals).toHaveLength(1);
    expect(payload.proposals[0].receivable_item_id).toBe(receivableId);
  });

  it('rejects invalid allocation payload with 400 Bad Request without calling RPC', async () => {
    let rpcCalled = false;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      const auth = mockAuthUser(url);
      if (auth) return auth;
      if (url.includes('/rest/v1/rpc/save_payment_allocation_intent')) {
        rpcCalled = true;
      }
      return new Response(JSON.stringify({ error: 'Unexpected' }), { status: 500 });
    });

    // Missing allocations array
    const resEmpty = await request(
      'PUT',
      `/v1/condominiums/${condominiumId}/payments/${paymentId}/allocation-intent`,
      { allocations: [] },
    );
    expect(resEmpty.status).toBe(400);

    // Mismatched amounts in same currency
    const resMismatched = await request(
      'PUT',
      `/v1/condominiums/${condominiumId}/payments/${paymentId}/allocation-intent`,
      {
        allocations: [
          {
            receivableItemId: receivableId,
            paymentAmount: '100.00',
            receivableAmount: '150.00',
            paymentCurrencyCode: 'USD',
            receivableCurrencyCode: 'USD',
          },
        ],
      },
    );
    expect(resMismatched.status).toBe(400);

    // Invalid UUID
    const resBadId = await request(
      'PUT',
      `/v1/condominiums/invalid-uuid/payments/${paymentId}/allocation-intent`,
      {
        allocations: [
          {
            receivableItemId: receivableId,
            paymentAmount: '100.00',
            receivableAmount: '100.00',
            paymentCurrencyCode: 'USD',
            receivableCurrencyCode: 'USD',
          },
        ],
      },
    );
    expect(resBadId.status).toBe(400);

    expect(rpcCalled).toBe(false);
  });

  it('routes GET allocation-intent to RPC with caller token', async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      requests.push({ url, init });
      const auth = mockAuthUser(url);
      if (auth) return auth;
      if (url.includes('/rest/v1/rpc/get_payment_allocation_intent'))
        return new Response(
          JSON.stringify({
            payment_id: paymentId,
            condominium_id: condominiumId,
            proposals: [
              {
                receivable_item_id: receivableId,
                payment_amount: '125.50',
                payment_currency_code: 'USD',
              },
            ],
            updated_at: '2026-10-18T12:00:00.000Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    });

    const res = await request(
      'GET',
      `/v1/condominiums/${condominiumId}/payments/${paymentId}/allocation-intent`,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { payment_id: string; proposals: unknown[] };
    expect(body.payment_id).toBe(paymentId);
    expect(body.proposals).toHaveLength(1);

    const rpcCall = requests.find(({ url }) => url.includes('/get_payment_allocation_intent'));
    expect(rpcCall).toBeDefined();
    const headers = new Headers(rpcCall?.init?.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${callerToken}`);
    expect(headers.get('apikey')).toBe('anon-key');

    // When RPC returns 404
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      const auth = mockAuthUser(url);
      if (auth) return auth;
      return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 });
    });
    const notFoundRes = await request(
      'GET',
      `/v1/condominiums/${condominiumId}/payments/${paymentId}/allocation-intent`,
    );
    expect(notFoundRes.status).toBe(404);
  });
});
