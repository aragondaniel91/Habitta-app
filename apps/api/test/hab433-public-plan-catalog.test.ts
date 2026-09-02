import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/security-entry';
import type { NotificationBindings } from '../src/notifications/types';

const environment = {
  APP_ENV: 'production',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'public-anon-key',
  CORS_ALLOWED_ORIGINS: 'https://app.mihabitta.com',
} as unknown as NotificationBindings;

const catalogue = [
  {
    code: 'esencial',
    name: 'Habitta Esencial',
    catalog_monthly_usd: 29,
    catalog_annual_usd: 290,
    default_unit_limit: 30,
    sort_order: 1,
    capabilities: [
      { code: 'finance.payments', domain: 'finance', name: 'Pagos' },
      { code: 'people.directory', domain: 'people', name: 'Directorio de personas' },
    ],
  },
];

const request = (origin = 'https://mihabitta.com') =>
  app.request(
    'https://api.example.test/public/v1/plans',
    { headers: { Origin: origin } },
    environment,
  );

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('HAB-433 public plan catalogue API', () => {
  it('serves the public RPC without a user bearer token and uses only the anon key', async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.url = String(input);
        seen.init = init;
        return new Response(JSON.stringify(catalogue), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );

    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://mihabitta.com');
    expect(response.headers.get('Cache-Control')).toContain('max-age=300');
    await expect(response.json()).resolves.toEqual({ currency: 'USD', plans: catalogue });

    expect(seen.url).toBe('https://example.supabase.co/rest/v1/rpc/get_public_plan_catalog');
    expect(seen.init?.method).toBe('POST');
    const headers = new Headers(seen.init?.headers);
    expect(headers.get('apikey')).toBe('public-anon-key');
    expect(headers.get('Authorization')).toBe('Bearer public-anon-key');
  });

  it('admits mihabitta.com only on the public catalogue path, not globally', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const health = await app.request(
      'https://api.example.test/health',
      { headers: { Origin: 'https://mihabitta.com' } },
      environment,
    );
    expect(health.status).toBe(403);

    const authenticatedSurface = await app.request(
      'https://api.example.test/v1/organizations',
      { headers: { Origin: 'https://mihabitta.com' } },
      environment,
    );
    expect(authenticatedSurface.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps the public catalogue closed to every other unapproved origin', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const response = await request('https://evil.example');
    expect(response.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fails safely when PostgREST is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ message: 'internal details' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const response = await request();
    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = (await response.json()) as { error: string };
    expect(body.error).not.toContain('internal details');
  });

  it('rejects malformed upstream catalogue data instead of inventing prices', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify([{ ...catalogue[0], catalog_monthly_usd: null }]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    const response = await request();
    expect(response.status).toBe(502);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
