import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from './index';

const condominiumId = '98620000-0000-0000-0000-000000000001';
const token = 'authenticated-caller-payment-metrics-token';
const environment = {
  SUPABASE_URL: 'https://supabase.test',
  SUPABASE_ANON_KEY: 'anon-key',
  APP_ENV: 'development',
} as never;
const endpoint = '/v1/condominiums/' + condominiumId + '/payments/summary';
const call = () =>
  app.fetch(
    new Request('https://api.test' + endpoint, {
      headers: { Authorization: 'Bearer ' + token },
    }),
    environment,
  );

afterEach(() => vi.restoreAllMocks());

describe('authoritative payment indicators API and SQL contracts', () => {
  it('sends only a tenant UUID to a caller-JWT scoped RPC, never service_role or all payment rows', async () => {
    const upstream: Array<{ url: string; init: RequestInit | undefined }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      upstream.push({ url, init });
      if (url.endsWith('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: '98610000-0000-0000-0000-000000000001' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify([
          {
            currency_code: 'USD',
            approved_amount: '125.50',
            reversed_amount: '7.25',
            pending_review_count: 4,
            own_attention_count: 2,
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        currency_code: 'USD',
        approved_amount: '125.50',
        reversed_amount: '7.25',
        pending_review_count: 4,
        own_attention_count: 2,
      },
    ]);
    const rpc = upstream.filter(({ url }) => url.includes('rpc/get_payment_metrics'));
    expect(rpc).toHaveLength(1);
    expect(rpc[0]!.init?.method).toBe('POST');
    expect(JSON.parse(String(rpc[0]!.init?.body))).toEqual({ target: condominiumId });
    expect(new Headers(rpc[0]!.init?.headers).get('authorization')).toBe('Bearer ' + token);
    expect(new Headers(rpc[0]!.init?.headers).get('apikey')).toBe('anon-key');
    expect(upstream.some(({ url }) => url.includes('/rest/v1/payments?'))).toBe(false);
  });

  it('fails closed without leaking PostgREST diagnostics', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input).endsWith('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: '98610000-0000-0000-0000-000000000001' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ message: 'sensitive PostgreSQL permission detail' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      });
    });
    const response = await call();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Payment indicators unavailable' });
  });

  it('uses a SECURITY INVOKER and source payments RLS; no ledger mutations or FX calculations', async () => {
    const migration = await readFile(
      new URL(
        '../../../supabase/migrations/20261020190000_hab_payment_metrics_authoritative.sql',
        import.meta.url,
      ),
      'utf8',
    );
    expect(migration).toContain('security invoker');
    expect(migration).toContain('set row_security = on');
    expect(migration).toContain('where p.condominium_id = target');
    expect(migration).toContain('group by p.original_currency_code');
    expect(migration).toContain('p.submitted_by_user_id = auth.uid()');
    expect(migration).toContain(
      'grant execute on function public.get_payment_metrics(uuid) to authenticated, service_role',
    );
    expect(migration).not.toMatch(
      /\b(insert|update|delete|truncate)\s+(?:into\s+|from\s+)?public\./i,
    );
  });
});
