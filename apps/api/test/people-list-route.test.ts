import { describe, expect, it, vi } from 'vitest';
import { app } from '../src/index';

const condominiumId = '11111111-1111-4111-8111-111111111111';
const environment = {
  SUPABASE_URL: 'https://supabase.example.test',
  SUPABASE_ANON_KEY: 'anon-key',
} as never;

describe('people list route', () => {
  it('uses the authenticated condominium-scoped REST path without a unitId parameter', async () => {
    const requests: string[] = [];
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      requests.push(url);
      if (url.includes('/auth/v1/user'))
        return new Response(JSON.stringify({ id: condominiumId }), { status: 200 });
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    try {
      const response = await app.request(
        `/v1/condominiums/${condominiumId}/people`,
        { headers: { Authorization: 'Bearer caller-token' } },
        environment,
      );
      expect(response.status).toBe(200);
      expect(
        requests.some((url) => url.includes(`people?condominium_id=eq.${condominiumId}`)),
      ).toBe(true);
    } finally {
      fetchMock.mockRestore();
    }
  });
});
