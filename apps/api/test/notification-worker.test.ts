import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  enqueuePendingNotifications,
  processNotificationDelivery,
} from '../src/notifications/worker';
import type { NotificationBindings } from '../src/notifications/types';

const env = (send = vi.fn()) =>
  ({
    APP_ENV: 'production',
    NOTIFICATIONS_EMAIL_MODE: 'live',
    SUPABASE_URL: 'https://supabase.test',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    NOTIFICATION_QUEUE: { send },
    RESEND_API_KEY: 'resend',
    NOTIFICATIONS_FROM_EMAIL: 'no-reply@habitta.test',
    NOTIFICATIONS_FROM_NAME: 'Habitta',
    APP_BASE_URL: 'https://habitta.test',
  }) as unknown as NotificationBindings;
afterEach(() => vi.restoreAllMocks());

describe('notification queue scheduling', () => {
  it('queues each claimed delivery once with only deliveryId', async () => {
    const send = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('claim_notification_events')) return Response.json([{ id: 'event' }]);
        if (url.includes('process_notification_event')) return Response.json(true);
        if (url.includes('claim_due_notification_deliveries'))
          return Response.json([{ id: 'delivery' }]);
        throw new Error(url);
      }),
    );
    await enqueuePendingNotifications(env(send));
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith({ deliveryId: 'delivery' });
    expect(Object.keys(send.mock.calls[0]![0])).toEqual(['deliveryId']);
  });
});

describe('Resend delivery', () => {
  const run = async (status: number, response: object = {}) => {
    const finishes: Record<string, unknown>[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('claim_notification_delivery'))
        return Response.json({
          id: 'd',
          recipient_email: 'user@test.dev',
          template_key: 'payment_approved',
          payload: { action_url: '/app/payments/p' },
          deduplication_key: 'dedupe',
          attempts: 1,
        });
      if (url.includes('should_send_notification_delivery')) return Response.json(true);
      if (url.includes('finish_notification_delivery')) {
        finishes.push(JSON.parse(String(init?.body)));
        return Response.json(null);
      }
      if (url.includes('resend.com')) return Response.json(response, { status });
      throw new Error(url);
    });
    vi.stubGlobal('fetch', fetchMock);
    const outcome = await processNotificationDelivery({ deliveryId: 'd' }, env());
    return { outcome, fetchMock, finishes };
  };
  it('sends HTML/text with an idempotency key and stores only provider id', async () => {
    const result = await run(200, { id: 'provider' });
    const resend = result.fetchMock.mock.calls.find((call) =>
      String(call[0]).includes('resend.com'),
    )!;
    expect(new Headers(resend[1]?.headers).get('Idempotency-Key')).toBe('dedupe');
    expect(JSON.parse(String(resend[1]?.body))).toMatchObject({
      text: expect.any(String),
      html: expect.any(String),
    });
    expect(result.finishes[0]).toMatchObject({ provider_id: 'provider', error_code: null });
  });
  it.each([
    [429, 'retry', true],
    [500, 'retry', true],
    [400, 'dead', false],
  ] as const)('classifies HTTP %s', async (status, outcome, retryable) => {
    const result = await run(status);
    expect(result.outcome).toBe(outcome);
    expect(result.finishes[0]).toMatchObject({ retryable });
  });
  it('retries temporary network failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('claim_notification_delivery'))
          return Response.json({
            id: 'd',
            recipient_email: 'u@test.dev',
            template_key: 'payment_approved',
            payload: { action_url: '/app/x' },
            deduplication_key: 'k',
            attempts: 4,
          });
        if (url.includes('should_send_notification_delivery')) return Response.json(true);
        if (url.includes('finish_notification_delivery')) return Response.json(null);
        throw new TypeError('network');
      }),
    );
    expect(await processNotificationDelivery({ deliveryId: 'd' }, env())).toBe('retry');
  });
  it('skips a claimed delivery when current email preferences were disabled', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('claim_notification_delivery'))
        return Response.json({
          id: 'd',
          recipient_email: 'u@test.dev',
          template_key: 'payment_approved',
          payload: { action_url: '/app/x' },
          deduplication_key: 'k',
          attempts: 1,
        });
      if (url.includes('should_send_notification_delivery')) return Response.json(false);
      if (url.includes('skip_notification_delivery')) {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          target: 'd',
          reason: 'email_disabled_at_delivery',
        });
        return Response.json(null);
      }
      if (url.includes('resend.com')) throw new Error('Resend should not be called');
      throw new Error(url);
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await processNotificationDelivery({ deliveryId: 'd' }, env())).toBe('skipped');
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('resend.com'))).toBe(false);
  });
  it('does not call Resend for sent, skipped or dead deliveries', async () => {
    const fetchMock = vi.fn(async () => Response.json(null));
    vi.stubGlobal('fetch', fetchMock);
    expect(await processNotificationDelivery({ deliveryId: 'd' }, env())).toBe('ignored');
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it('marks disabled email delivery as skipped before contacting Resend', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('claim_notification_delivery'))
        return Response.json({
          id: 'd',
          recipient_email: 'user@test.dev',
          template_key: 'payment_approved',
          payload: { action_url: '/app/x' },
          deduplication_key: 'k',
          attempts: 1,
        });
      if (url.includes('should_send_notification_delivery')) return Response.json(true);
      if (url.includes('skip_notification_delivery')) {
        expect(JSON.parse(String(init?.body))).toMatchObject({ reason: 'email_delivery_disabled' });
        return Response.json(null);
      }
      throw new Error('Resend should not be called');
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(
      await processNotificationDelivery(
        { deliveryId: 'd' },
        { ...env(), NOTIFICATIONS_EMAIL_MODE: 'disabled' },
      ),
    ).toBe('skipped');
  });
  it('redirects sandbox delivery and prefixes the subject without exposing the original recipient', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes('claim_notification_delivery'))
        return Response.json({
          id: 'd',
          recipient_email: 'original@example.test',
          template_key: 'payment_approved',
          payload: { action_url: '/app/x' },
          deduplication_key: 'k',
          attempts: 1,
        });
      if (url.includes('should_send_notification_delivery')) return Response.json(true);
      if (url.includes('finish_notification_delivery')) return Response.json(null);
      if (url.includes('resend.com')) return Response.json({ id: 'provider' });
      throw new Error(url);
    });
    vi.stubGlobal('fetch', fetchMock);
    await processNotificationDelivery(
      { deliveryId: 'd' },
      {
        ...env(),
        APP_ENV: 'development',
        NOTIFICATIONS_EMAIL_MODE: 'sandbox',
        NOTIFICATIONS_SANDBOX_EMAIL: 'sandbox@habitta.test',
      },
    );
    const resend = fetchMock.mock.calls.find((call) => String(call[0]).includes('resend.com'))!;
    const payload = JSON.parse(String(resend[1]?.body));
    expect(payload.to).toEqual(['sandbox@habitta.test']);
    expect(payload.subject).toMatch(/^\[HABITTA DEV\]/);
    expect(JSON.stringify(payload)).not.toContain('original@example.test');
  });
});
