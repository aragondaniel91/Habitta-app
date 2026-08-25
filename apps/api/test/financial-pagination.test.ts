import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/index';

const condo = '00000000-0000-0000-0000-000000000101';
const otherCondo = '00000000-0000-0000-0000-000000000202';
const token = { Authorization: 'Bearer test' };
const env = {
  SUPABASE_URL: 'https://supabase.test',
  SUPABASE_ANON_KEY: 'anon',
};
const auth = () => Response.json({ id: '00000000-0000-0000-0000-000000000303' }, { status: 200 });

afterEach(() => vi.restoreAllMocks());

describe('HAB-321 financial list pagination', () => {
  it.each([
    ['charge-concepts', 'charge_concepts', 'created_at.desc,id.desc'],
    ['receivables', 'receivable_balances', 'issue_date.desc,id.desc'],
    ['charge-batches', 'charge_batches', 'created_at.desc,id.desc'],
    ['payment-methods', 'condominium_payment_methods', 'display_name.asc,id.asc'],
    ['payments', 'payments', 'created_at.desc,id.desc'],
  ])('paginates %s with stable tenant-scoped ordering', async (endpoint, table, order) => {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, init });
        if (url.includes('/auth/v1/user')) return auth();
        return Response.json([{ id: 'row-1' }, { id: 'row-2' }], {
          headers: { 'Content-Range': '0-1/3' },
        });
      }),
    );

    const response = await app.request(
      `/v1/condominiums/${condo}/${endpoint}?page=1&pageSize=2`,
      { headers: token },
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [{ id: 'row-1' }, { id: 'row-2' }],
      page: 1,
      pageSize: 2,
      total: 3,
      totalPages: 2,
      hasNextPage: true,
      hasPreviousPage: false,
    });
    const dataCall = calls.find((call) => call.url.includes(`/rest/v1/${table}?`));
    expect(dataCall?.url).toContain(`condominium_id=eq.${condo}`);
    expect(dataCall?.url).not.toContain(otherCondo);
    expect(dataCall?.url).toContain(`order=${order}`);
    expect(dataCall?.url).toContain('limit=2');
    expect(dataCall?.url).toContain('offset=0');
    expect(new Headers(dataCall?.init?.headers).get('Prefer')).toBe('count=exact');
  });

  it('returns deterministic next-page metadata and offset', async () => {
    let dataUrl = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/auth/v1/user')) return auth();
        dataUrl = url;
        return Response.json([{ id: 'row-3' }], {
          headers: { 'Content-Range': '2-2/3' },
        });
      }),
    );

    const response = await app.request(
      `/v1/condominiums/${condo}/payments?page=2&pageSize=2`,
      { headers: token },
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      page: 2,
      pageSize: 2,
      total: 3,
      totalPages: 2,
      hasNextPage: false,
      hasPreviousPage: true,
    });
    expect(dataUrl).toContain('offset=2');
  });

  it('preserves complete array reads for existing consumers without silent truncation', async () => {
    const dataCalls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/auth/v1/user')) return auth();
        dataCalls.push(url);
        if (url.includes('offset=0')) {
          return Response.json(
            Array.from({ length: 500 }, (_, index) => ({ id: `row-${index + 1}` })),
            { headers: { 'Content-Range': '0-499/501' } },
          );
        }
        return Response.json([{ id: 'row-501' }], {
          headers: { 'Content-Range': '500-500/501' },
        });
      }),
    );

    const response = await app.request(
      `/v1/condominiums/${condo}/payments`,
      { headers: token },
      env,
    );

    expect(response.status).toBe(200);
    expect((await response.json()) as unknown[]).toHaveLength(501);
    expect(dataCalls).toHaveLength(2);
    expect(dataCalls[0]).toContain(`condominium_id=eq.${condo}`);
    expect(dataCalls[0]).toContain('limit=500&offset=0');
    expect(dataCalls[1]).toContain('limit=500&offset=500');
  });

  it.each([
    ['page=0&pageSize=50'],
    ['page=1&pageSize=0'],
    ['page=1&pageSize=101'],
    ['page=nope&pageSize=50'],
  ])('rejects invalid pagination bounds: %s', async (query) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => auth()),
    );
    const response = await app.request(
      `/v1/condominiums/${condo}/payments?${query}`,
      { headers: token },
      env,
    );
    expect(response.status).toBe(400);
  });

  it('fails closed if exact pagination metadata is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) =>
        String(input).includes('/auth/v1/user') ? auth() : Response.json([]),
      ),
    );
    const response = await app.request(
      `/v1/condominiums/${condo}/payments?page=1&pageSize=50`,
      { headers: token },
      env,
    );
    expect(response.status).toBe(502);
  });
});
