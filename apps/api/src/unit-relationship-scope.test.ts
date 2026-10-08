import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from './index';

const CONDOMINIUM = '00000000-0000-4000-8000-000000000501';
const OTHER_CONDOMINIUM = '00000000-0000-4000-8000-000000000502';
const UNIT = '00000000-0000-4000-8000-000000000503';

const environment = {
  SUPABASE_URL: 'https://supabase.test',
  SUPABASE_ANON_KEY: 'anon',
  APP_ENV: 'development',
} as never;

const request = (method: string, path: string, body?: unknown) =>
  app.fetch(
    new Request(`https://api.test${path}`, {
      method,
      headers: {
        Authorization: 'Bearer token',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    environment,
  );

describe('unit relationship condominium scope', () => {
  afterEach(() => vi.restoreAllMocks());

  it('does not read a unit history outside the condominium in the URL', async () => {
    const upstreamUrls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      upstreamUrls.push(url);
      if (url.includes('/auth/v1/user'))
        return new Response(JSON.stringify({ id: '00000000-0000-4000-8000-000000000504' }));
      if (url.includes('/rest/v1/units?')) return new Response(JSON.stringify([]));
      return new Response(JSON.stringify([{ id: 'relationship-from-another-condominium' }]));
    });

    const response = await request('GET', `/v1/condominiums/${CONDOMINIUM}/units/${UNIT}/owners`);

    expect(response.status).toBe(404);
    expect(upstreamUrls.some((url) => url.includes('/rest/v1/unit_owners?'))).toBe(false);
    expect(upstreamUrls.some((url) => url.includes(`condominium_id=eq.${CONDOMINIUM}`))).toBe(true);
  });

  it('does not create a relationship through a different condominium context', async () => {
    const upstreamUrls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      upstreamUrls.push(url);
      if (url.includes('/auth/v1/user'))
        return new Response(JSON.stringify({ id: '00000000-0000-4000-8000-000000000504' }));
      if (url.includes('/rest/v1/units?')) return new Response(JSON.stringify([]));
      return new Response(JSON.stringify({ id: 'unexpected-write' }));
    });

    const response = await request(
      'POST',
      `/v1/condominiums/${OTHER_CONDOMINIUM}/units/${UNIT}/occupancies`,
      {
        personId: '00000000-0000-4000-8000-000000000505',
        occupancyType: 'tenant',
      },
    );

    expect(response.status).toBe(404);
    expect(upstreamUrls.some((url) => url.endsWith('/rest/v1/unit_occupancies'))).toBe(false);
  });
});
