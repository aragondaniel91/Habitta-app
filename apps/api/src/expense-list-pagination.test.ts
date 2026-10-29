import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { operationsRoutes } from './operations-routes-base';

const condominiumId = '60000000-0000-4000-8000-000000000001';
const env = { SUPABASE_URL: 'https://supabase.test', SUPABASE_ANON_KEY: 'anon' };

function buildApp() {
  const upstream: Array<{ url: string; headers: Headers }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      upstream.push({ url, headers: new Headers(init.headers) });
      return new Response(JSON.stringify([{ id: 'expense-2' }]), {
        headers: { 'content-range': '10-10/121', 'content-type': 'application/json' },
      });
    }),
  );
  const app = new Hono<{
    Bindings: { SUPABASE_URL: string; SUPABASE_ANON_KEY: string };
    Variables: { token: string; userId: string };
  }>();
  app.use('*', async (c, next) => {
    c.set('token', 'caller-jwt');
    c.set('userId', 'user-1');
    await next();
  });
  app.route('/', operationsRoutes as never);
  return { app, upstream };
}

afterEach(() => vi.unstubAllGlobals());

describe('expense list pagination', () => {
  it('uses a bounded, deterministically ordered tenant query and returns exact paging metadata', async () => {
    const { app, upstream } = buildApp();
    const response = await app.request(
      `/${condominiumId}/expenses?page=2&pageSize=10&status=approved&currency=usd`,
      {},
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      items: [{ id: 'expense-2' }],
      page: 2,
      pageSize: 10,
      total: 121,
      totalPages: 13,
      hasNextPage: true,
      hasPreviousPage: true,
    });
    expect(upstream).toHaveLength(1);
    expect(decodeURIComponent(upstream[0]!.url)).toContain(
      `condominium_id=eq.${condominiumId}&status=eq.approved&currency_code=eq.USD`,
    );
    expect(upstream[0]!.url).toContain('limit=10&offset=10');
    expect(decodeURIComponent(upstream[0]!.url)).toContain(
      'order=expense_date.desc,created_at.desc,id.desc',
    );
    expect(upstream[0]!.headers.get('Authorization')).toBe('Bearer caller-jwt');
    expect(upstream[0]!.headers.get('Prefer')).toBe('count=exact');
  });

  it('bounds an opted-in page at 50 and keeps exact totals', async () => {
    const { app, upstream } = buildApp();
    const response = await app.request(`/${condominiumId}/expenses?page=1`, {}, env);
    expect(response.status).toBe(200);
    expect(upstream).toHaveLength(1);
    expect(upstream[0]!.url).toContain('limit=50&offset=0');
    expect(upstream[0]!.headers.get('Prefer')).toBe('count=exact');
  });

  it('keeps the legacy array contract for maintenance consumers without pagination parameters', async () => {
    const { app, upstream } = buildApp();
    const response = await app.request(`/${condominiumId}/expenses`, {}, env);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([{ id: 'expense-2' }]);
    expect(upstream).toHaveLength(1);
    expect(upstream[0]!.url).not.toContain('limit=');
    expect(upstream[0]!.headers.get('Prefer')).not.toContain('count=exact');
  });

  it('searches all tenant expenses before paging with quoted PostgREST predicates', async () => {
    const { app, upstream } = buildApp();
    const response = await app.request(
      `/${condominiumId}/expenses?page=1&pageSize=10&search=${encodeURIComponent('Factura A,1')}`,
      {},
      env,
    );
    expect(response.status).toBe(200);
    expect(upstream).toHaveLength(1);
    const upstreamQuery = new URL(upstream[0]!.url).searchParams;
    expect(upstreamQuery.get('condominium_id')).toBe(`eq.${condominiumId}`);
    expect(upstreamQuery.get('or')).toBe(
      '(description.ilike."%Factura A,1%",invoice_number.ilike."%Factura A,1%",payment_reference.ilike."%Factura A,1%")',
    );
    expect(upstreamQuery.get('limit')).toBe('10');
    expect(upstreamQuery.get('offset')).toBe('0');
  });
});
