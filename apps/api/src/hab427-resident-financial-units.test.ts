import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerFinancialListRoutes } from './financial-list-routes';

// HAB-427: an owner of several units filters the financial lists server-side.
//
// The filter is asserted against the URL that actually reaches PostgREST rather than against the
// source text, because the failure worth catching is a filter that *replaces* the condominium
// filter instead of narrowing it -- which reads as a working feature right up until someone passes
// a unit id from another condominium. Row-level security would still refuse those rows, but the
// route would be asking for them, and the exact counts it reports would be built on that question.

const condominium = '42720000-0000-4000-8000-000000000001';
const unit = '42730000-0000-4000-8000-0000000000a1';

const requests: string[] = [];

const buildApp = (page: unknown[], total = page.length) => {
  requests.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      requests.push(url);
      return new Response(JSON.stringify(page), {
        status: 200,
        headers: { 'content-range': `0-${Math.max(page.length - 1, 0)}/${total}` },
      });
    }),
  );

  const app = new Hono<{
    Bindings: { SUPABASE_URL: string; SUPABASE_ANON_KEY: string };
    Variables: { token: string; userId: string };
  }>();
  app.use('*', async (c, next) => {
    c.set('token', 'resident-token');
    c.set('userId', 'resident');
    await next();
  });
  registerFinancialListRoutes(app as never);
  return app;
};

const env = { SUPABASE_URL: 'https://supabase.test', SUPABASE_ANON_KEY: 'anon-key' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HAB-427 unit-scoped financial lists', () => {
  it('narrows receivables to one unit without ever dropping the condominium filter', async () => {
    const app = buildApp([{ id: 'r1' }]);
    const response = await app.request(
      `/${condominium}/receivables?page=1&pageSize=10&unitId=${unit}`,
      {},
      env,
    );

    expect(response.status).toBe(200);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain(`condominium_id=eq.${condominium}`);
    expect(requests[0]).toContain(`unit_id=eq.${unit}`);
  });

  it('applies the same narrowing on the complete-read path, not only the paginated one', async () => {
    // Without an explicit page the route walks the whole list. That loop builds its own URL, so a
    // filter added to only one of the two branches would silently return every unit here.
    const app = buildApp([{ id: 'r1' }]);
    const response = await app.request(`/${condominium}/receivables?unitId=${unit}`, {}, env);

    expect(response.status).toBe(200);
    expect(requests[0]).toContain(`condominium_id=eq.${condominium}`);
    expect(requests[0]).toContain(`unit_id=eq.${unit}`);
  });

  it('scopes the payment history the same way', async () => {
    const app = buildApp([{ id: 'p1' }]);
    await app.request(`/${condominium}/payments?page=1&pageSize=10&unitId=${unit}`, {}, env);

    expect(requests[0]).toContain('payments?');
    expect(requests[0]).toContain(`condominium_id=eq.${condominium}`);
    expect(requests[0]).toContain(`unit_id=eq.${unit}`);
  });

  it('asks for every unit when no unit is selected', async () => {
    const app = buildApp([{ id: 'r1' }]);
    await app.request(`/${condominium}/receivables?page=1&pageSize=10`, {}, env);

    expect(requests[0]).toContain(`condominium_id=eq.${condominium}`);
    expect(requests[0]).not.toContain('unit_id=eq.');
  });

  it('refuses a unit id that is not a uuid instead of forwarding it', async () => {
    const app = buildApp([]);
    const response = await app.request(
      `/${condominium}/receivables?page=1&pageSize=10&unitId=' or true--`,
      {},
      env,
    );

    expect(response.status).toBe(400);
    expect(requests).toHaveLength(0);
  });

  it('ignores the parameter on lists that are not per-unit', async () => {
    // Charge concepts and payment methods belong to the condominium, not to a unit; those tables
    // have no unit_id at all, and forwarding the filter would turn a stray query parameter into a
    // PostgREST error.
    const app = buildApp([{ id: 'c1' }]);
    await app.request(`/${condominium}/charge-concepts?page=1&pageSize=10&unitId=${unit}`, {}, env);

    expect(requests[0]).toContain(`condominium_id=eq.${condominium}`);
    expect(requests[0]).not.toContain('unit_id=eq.');
  });
});

const index = readFileSync(fileURLToPath(new URL('./index.ts', import.meta.url)), 'utf8');

describe('HAB-427 resident financial units route', () => {
  it('forwards the condominium to the read-only RPC and nothing else', () => {
    expect(index).toContain("app.get('/v1/condominiums/:id/resident-financial-units'");
    expect(index).toContain("rest(c, 'rpc/get_resident_financial_units'");
    expect(index).toMatch(
      /rpc\/get_resident_financial_units[\s\S]{0,220}target: uuidSchema\.parse\(c\.req\.param\('id'\)\)/,
    );
  });

  it('answers on the caller’s own authority', () => {
    // `rest` sends the request with the caller's bearer token. The route must not reach for the
    // service role or decide membership from the JWT itself: the RPC is the only thing entitled to
    // say which units come back, and a bypass here would hand it a caller it cannot check.
    const route = index.slice(
      index.indexOf("app.get('/v1/condominiums/:id/resident-financial-units'"),
    );
    const body = route.slice(0, route.indexOf('});') + 3);
    expect(body).not.toContain('SERVICE_ROLE');
    expect(body).not.toContain('condominium_memberships');
    expect(body).toContain('rest(c,');
  });
});
