import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminAuditRoutes } from './admin-audit-routes';

const condominiumId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const env = {
  SUPABASE_URL: 'https://example.test',
  SUPABASE_ANON_KEY: 'anon-key',
} as never;

function request(path: string) {
  return adminAuditRoutes.request(
    `http://local.test/${condominiumId}/audit-events${path}`,
    {},
    env,
  );
}

describe('administrator audit route behavior', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rejects invalid filters before calling the RPC', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await request('?actor=not-a-uuid&limit=101');

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid audit query' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps upstream authorization failures to 403 without exposing their details', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ message: 'not authorized for c1' }), { status: 401 }),
        ),
    );

    const response = await request('?module=payments&severity=warning');

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('returns a sanitized error for non-authorization RPC failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 'XX000', message: 'PostgREST internal detail' }), {
          status: 500,
        }),
      ),
    );

    const response = await request('?from=2026-10-01T00:00:00.000Z&to=2026-10-02T00:00:00.000Z');

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Audit log unavailable' });
  });
});
