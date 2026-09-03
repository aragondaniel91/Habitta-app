import { afterEach, describe, expect, it, vi } from 'vitest';
import { runWithBoundedConcurrency } from '../src/notifications/concurrency';
import { consumeNotificationQueue } from '../src/notifications/worker';
import type { NotificationBindings } from '../src/notifications/types';

const env = () =>
  ({
    APP_ENV: 'production',
    NOTIFICATIONS_EMAIL_MODE: 'live',
    SUPABASE_URL: 'https://supabase.test',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    NOTIFICATION_QUEUE: { send: vi.fn() },
    RESEND_API_KEY: 'resend',
    NOTIFICATIONS_FROM_EMAIL: 'no-reply@habitta.test',
    NOTIFICATIONS_FROM_NAME: 'Habitta',
    APP_BASE_URL: 'https://habitta.test',
  }) as unknown as NotificationBindings;

afterEach(() => vi.restoreAllMocks());

describe('bounded notification concurrency', () => {
  it('never exceeds the configured concurrency and lets independent peers finish', async () => {
    let active = 0;
    let maxActive = 0;
    const finished: number[] = [];

    await expect(
      runWithBoundedConcurrency([1, 2, 3, 4, 5, 6], 2, async (item) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        try {
          await new Promise((resolve) => setTimeout(resolve, item === 1 ? 5 : 1));
          if (item === 2) throw new Error('expected-item-failure');
          finished.push(item);
        } finally {
          active -= 1;
        }
      }),
    ).rejects.toThrow('expected-item-failure');

    expect(maxActive).toBe(2);
    expect(finished.sort((left, right) => left - right)).toEqual([1, 3, 4, 5, 6]);
  });

  it('rejects invalid concurrency instead of silently becoming unbounded', async () => {
    await expect(runWithBoundedConcurrency([1], 0, async () => undefined)).rejects.toThrow(
      'notification_concurrency_must_be_positive_integer',
    );
  });

  it('acks and retries queue messages independently inside the same batch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('claim_notification_delivery')) {
          const target = JSON.parse(String(init?.body)).target as string;
          if (target === 'retry-delivery') {
            return Response.json({
              id: target,
              recipient_email: 'user@test.dev',
              template_key: 'payment_approved',
              payload: { action_url: '/app/payments/p' },
              deduplication_key: 'retry-dedupe',
              attempts: 1,
            });
          }
          return Response.json(null);
        }
        if (url.includes('should_send_notification_delivery')) return Response.json(true);
        if (url.includes('finish_notification_delivery')) return Response.json(null);
        if (url.includes('resend.com')) throw new TypeError('temporary network failure');
        throw new Error(url);
      }),
    );

    const retryMessage = {
      body: { deliveryId: 'retry-delivery' },
      ack: vi.fn(),
      retry: vi.fn(),
    };
    const ignoredMessage = {
      body: { deliveryId: 'already-claimed' },
      ack: vi.fn(),
      retry: vi.fn(),
    };
    const batch = { messages: [retryMessage, ignoredMessage] } as unknown as Parameters<
      typeof consumeNotificationQueue
    >[0];

    await consumeNotificationQueue(batch, env());

    expect(retryMessage.retry).toHaveBeenCalledOnce();
    expect(retryMessage.ack).not.toHaveBeenCalled();
    expect(ignoredMessage.ack).toHaveBeenCalledOnce();
    expect(ignoredMessage.retry).not.toHaveBeenCalled();
  });
});
