import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  sendNotificationEmail,
  zeptoMailAuthorizationValue,
} from '../src/notifications/email-provider';
import type { NotificationBindings } from '../src/notifications/types';

const message = {
  fromEmail: 'notifications@mihabitta.com',
  fromName: 'Habitta',
  to: 'recipient@example.com',
  subject: 'Habitta notification',
  html: '<p>Hello</p>',
  text: 'Hello',
  deduplicationKey: 'delivery-123',
};

const env = (values: Partial<NotificationBindings>) => values as NotificationBindings;

afterEach(() => vi.unstubAllGlobals());

describe('transactional email providers', () => {
  it('normalizes token-only and copied ZeptoMail authorization values', () => {
    expect(zeptoMailAuthorizationValue('zepto-token')).toBe('Zoho-enczapikey zepto-token');
    expect(zeptoMailAuthorizationValue('Zoho-enczapikey zepto-token')).toBe(
      'Zoho-enczapikey zepto-token',
    );
    expect(zeptoMailAuthorizationValue('zoho-enczapikey   zepto-token')).toBe(
      'Zoho-enczapikey zepto-token',
    );
    expect(zeptoMailAuthorizationValue('   ')).toBeNull();
  });

  it('sends the ZeptoMail payload and returns its request id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ request_id: 'zepto-request-1' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendNotificationEmail(
      env({ ZEPTOMAIL_SEND_TOKEN: 'Zoho-enczapikey zepto-token' }),
      'zeptomail',
      message,
      new AbortController().signal,
    );

    expect(result).toEqual({ ok: true, providerId: 'zepto-request-1' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.zeptomail.com/v1.1/email');
    expect(new Headers(init.headers).get('Authorization')).toBe('Zoho-enczapikey zepto-token');
    expect(JSON.parse(String(init.body))).toEqual({
      from: { address: 'notifications@mihabitta.com', name: 'Habitta' },
      to: [{ email_address: { address: 'recipient@example.com' } }],
      subject: 'Habitta notification',
      htmlbody: '<p>Hello</p>',
      textbody: 'Hello',
      client_reference: 'delivery-123',
      track_clicks: false,
      track_opens: false,
    });
  });

  it('marks a ZeptoMail rate-limit response as retryable with safe provider diagnostics', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'rate_limit' } }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    await expect(
      sendNotificationEmail(
        env({ ZEPTOMAIL_SEND_TOKEN: 'zepto-token' }),
        'zeptomail',
        message,
        new AbortController().signal,
      ),
    ).resolves.toEqual({
      ok: false,
      errorCode: 'zeptomail_429_rate_limit',
      retryable: true,
      providerId: null,
    });
  });

  it('preserves Resend idempotency support for rollback', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'resend-message-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendNotificationEmail(
      env({ RESEND_API_KEY: 'resend-token' }),
      'resend',
      message,
      new AbortController().signal,
    );

    expect(result).toEqual({ ok: true, providerId: 'resend-message-1' });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe('delivery-123');
  });
});
