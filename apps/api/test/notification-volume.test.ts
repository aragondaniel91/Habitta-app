import { afterEach, describe, expect, it, vi } from 'vitest';
import { enqueuePendingNotifications } from '../src/notifications/worker';
import type { NotificationBindings } from '../src/notifications/types';

const env = (send = vi.fn()) =>
  ({
    APP_ENV: 'production',
    NOTIFICATIONS_EMAIL_MODE: 'live',
    SUPABASE_URL: 'https://supabase.test',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    NOTIFICATION_QUEUE: { send },
    NOTIFICATIONS_EMAIL_PROVIDER: 'zeptomail',
    ZEPTOMAIL_SEND_TOKEN: 'test',
    NOTIFICATIONS_FROM_EMAIL: 'no-reply@habitta.test',
    NOTIFICATIONS_FROM_NAME: 'Habitta',
    APP_BASE_URL: 'https://habitta.test',
  }) as unknown as NotificationBindings;

afterEach(() => vi.restoreAllMocks());

describe('notification scheduler volume budget', () => {
  it('requests no more than 25 email deliveries for one scheduler cycle', async () => {
    const send = vi.fn();
    let deliveryClaimPayload: Record<string, unknown> | undefined;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('claim_notification_events')) return Response.json([]);
        if (url.includes('claim_due_notification_deliveries')) {
          deliveryClaimPayload = JSON.parse(String(init?.body));
          return Response.json([]);
        }
        throw new Error(url);
      }),
    );

    await enqueuePendingNotifications(env(send));

    expect(deliveryClaimPayload).toEqual({ limit_count: 25 });
    expect(send).not.toHaveBeenCalled();
  });
});
