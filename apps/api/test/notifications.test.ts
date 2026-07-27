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
  it.each([
    [
      '/v1/notification-preferences',
      {
        condominiumId: '00000000-0000-0000-0000-000000000001',
        notificationType: 'payment_approved',
        emailEnabled: false,
        inAppEnabled: true,
      },
      'update_my_notification_preferences',
    ],
    [
      '/v1/condominiums/00000000-0000-0000-0000-000000000001/notification-settings',
      {
        emailEnabled: true,
        dueSoonEnabled: true,
        dueSoonDays: 3,
        overdueEnabled: true,
        timezone: 'America/Caracas',
      },
      'update_condominium_notification_settings',
    ],
  ])('supports PATCH %s', async (path, payload, rpcName) => {
    const calls: Request[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      calls.push(new Request(input, init));
      return new Response('{}', { status: 200 });
    };
    const response = await app.request(
      path,
      {
        method: 'PATCH',
        headers: { Authorization: 'Bearer jwt', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      { SUPABASE_URL: 'http://localhost', SUPABASE_ANON_KEY: 'anon' },
    );
    globalThis.fetch = original;
    expect(response.status).toBe(200);
    expect(calls.some((call) => call.url.includes(rpcName))).toBe(true);
  });
  it('returns the unread total and condominium grouping without delivery data', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (input) =>
      String(input).includes('/auth/')
        ? Response.json({ id: 'u' })
        : Response.json({
            total: 3,
            groupedByCondominium: [{ condominiumId: 'c', unreadCount: 3 }],
          });
    const response = await app.request(
      '/v1/notifications/unread-count',
      { headers: { Authorization: 'Bearer jwt' } },
      { SUPABASE_URL: 'http://localhost', SUPABASE_ANON_KEY: 'anon' },
    );
    globalThis.fetch = original;
    await expect(response.json()).resolves.toEqual({
      total: 3,
      groupedByCondominium: [{ condominiumId: 'c', unreadCount: 3 }],
    });
  });
});
