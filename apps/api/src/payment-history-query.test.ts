import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPaymentHistoryFilters } from './payment-history-query';
import { registerFinancialListRoutes } from './financial-list-routes';

const condo = '42720000-0000-4000-8000-000000000001';
const unit = '42730000-0000-4000-8000-0000000000a1';
const method = '42730000-0000-4000-8000-0000000000b1';
const env = { SUPABASE_URL: 'https://supabase.test', SUPABASE_ANON_KEY: 'anon' };

const buildApp = () => {
  const upstream: { url: string; auth: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      upstream.push({
        url,
        auth: new Headers(init.headers).get('Authorization') ?? '',
      });
      return new Response('[]', {
        status: 200,
        headers: { 'content-range': '*/0' },
      });
    }),
  );
  const app = new Hono<{
    Bindings: { SUPABASE_URL: string; SUPABASE_ANON_KEY: string };
    Variables: { token: string; userId: string };
  }>();
  app.use('*', async (c, next) => {
    c.set('token', 'user-jwt');
    c.set('userId', 'user-1');
    await next();
  });
  registerFinancialListRoutes(app as never);
  return { app, upstream };
};

afterEach(() => vi.unstubAllGlobals());

describe('Global payment history filters', () => {
  it('constructs validated server filters on exact RLS-scoped counts', async () => {
    const { app, upstream } = buildApp();
    const q = new URLSearchParams({
      page: '2',
      pageSize: '10',
      unitId: unit,
      methodId: method,
      currencyCode: 'USD',
      statusGroup: 'pending',
      dateFrom: '2026-10-01',
      dateTo: '2026-10-21',
      search: 'Ana Perez',
      sortBy: 'amount',
      sortDir: 'desc',
    });
    const response = await app.request('/' + condo + '/payments?' + q.toString(), {}, env);
    expect(response.status).toBe(200);
    const json = (await response.json()) as { total: number; page: number; items: unknown[] };
    expect(json).toMatchObject({ total: 0, page: 2, items: [] });
    expect(upstream).toHaveLength(1);
    const url = decodeURIComponent(upstream[0]!.url);
    expect(url).toContain('condominium_id=eq.' + condo);
    expect(url).toContain('unit_id=eq.' + unit);
    expect(url).toContain('payment_method_id=eq.' + method);
    expect(url).toContain('original_currency_code=eq.USD');
    expect(url).toContain('status=in.(submitted,under_review)');
    expect(url).toContain('payment_date=gte.2026-10-01');
    expect(url).toContain('payment_date=lte.2026-10-21');
    expect(url).toContain('payer_name.ilike.*Ana Perez*');
    expect(url).toContain('order=original_amount.desc,id.desc');
    expect(url).toContain('limit=10&offset=10');
    expect(upstream[0]!.auth).toBe('Bearer user-jwt');
  });

  it('orders on joined unit code and method name rather than arbitrary UUID', () => {
    expect(buildPaymentHistoryFilters({ sortBy: 'unit', sortDir: 'asc' })).toMatchObject({
      ok: true,
      select: '*,units(code)',
      order: 'units(code).asc,id.asc',
    });
    expect(buildPaymentHistoryFilters({ sortBy: 'method', sortDir: 'desc' })).toMatchObject({
      ok: true,
      select: '*,condominium_payment_methods(display_name)',
      order: 'condominium_payment_methods(display_name).desc,id.desc',
    });
  });

  it('accepts banking reference separators without permitting PostgREST grammar injection', () => {
    const valid = buildPaymentHistoryFilters({ search: 'TRX/2026-04.15' });
    expect(valid).toMatchObject({ ok: true });
    if (valid.ok) expect(decodeURIComponent(valid.filter)).toContain('TRX/2026-04.15');
    expect(buildPaymentHistoryFilters({ search: 'TRX,or(status.eq.approved)' })).toMatchObject({
      ok: false,
    });
  });

  it('rejects invalid selectors before calling PostgREST', async () => {
    const { app, upstream } = buildApp();
    for (const q of [
      'currencyCode=USD%29%26or%3D',
      'sortBy=id%3Bdelete',
      'statusGroup=delete',
      'dateFrom=2026-11-21&dateTo=2026-10-01',
      'status=approved&statusGroup=pending',
      'search=%25%22%2C%29',
      'methodId=not-uuid',
      'sortDir=asc',
    ]) {
      const result = await app.request('/' + condo + '/payments?page=1&pageSize=10&' + q, {}, env);
      expect(result.status, q).toBe(400);
    }
    expect(upstream).toHaveLength(0);
  });

  it('keeps other financial collections unchanged even with payment-only query params', async () => {
    const { app, upstream } = buildApp();
    const response = await app.request(
      '/' + condo + '/charge-batches?page=1&pageSize=10&sortBy=amount&currencyCode=USD',
      {},
      env,
    );
    expect(response.status).toBe(200);
    expect(upstream[0]!.url).toContain('order=created_at.desc,id.desc');
    expect(upstream[0]!.url).not.toContain('original_currency_code=');
  });
});
