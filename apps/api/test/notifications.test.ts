import { describe, expect, it } from 'vitest';
import { app } from '../src/index';

describe('notification API', () => {
  it('preserves the authenticated JWT for notification RPCs', async () => {
    const calls: Request[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      calls.push(new Request(input, init));
      return new Response('[]', { status: 200 });
    };
    const response = await app.request(
      '/v1/notifications',
      { headers: { Authorization: 'Bearer user-jwt' } },
      { SUPABASE_URL: 'http://localhost', SUPABASE_ANON_KEY: 'anon' },
    );
    globalThis.fetch = original;
    expect(response.status).toBe(200);
    const rpc = calls.find((call) => call.url.includes('get_my_notifications'))!;
    expect(rpc.headers.get('Authorization')).toBe('Bearer user-jwt');
    await expect(rpc.json()).resolves.toMatchObject({
      target_condominium: null,
      unread_only: false,
    });
  });
});
