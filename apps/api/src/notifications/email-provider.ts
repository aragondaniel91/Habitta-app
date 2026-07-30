import type { NotificationsEmailProvider } from '../config/notifications-env';
import type { NotificationBindings } from './types';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const ZEPTOMAIL_ENDPOINT = 'https://api.zeptomail.com/v1.1/email';

type EmailMessage = {
  fromEmail: string;
  fromName: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  deduplicationKey: string;
};

export type EmailProviderResult =
  { ok: true; providerId: string | null } | { ok: false; errorCode: string; retryable: boolean };

const retryableStatus = (status: number) => status === 408 || status === 429 || status >= 500;

const sendWithResend = async (
  env: NotificationBindings,
  message: EmailMessage,
  signal: AbortSignal,
): Promise<EmailProviderResult> => {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) return { ok: false, errorCode: 'resend_key_missing', retryable: false };

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': message.deduplicationKey,
      },
      body: JSON.stringify({
        from: `${message.fromName} <${message.fromEmail}>`,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });
    const result = (await response.json().catch(() => ({}))) as { id?: string };
    if (response.ok) return { ok: true, providerId: result.id ?? null };
    return {
      ok: false,
      errorCode: `resend_${response.status}`,
      retryable: retryableStatus(response.status),
    };
  } catch {
    return { ok: false, errorCode: 'resend_network_error', retryable: true };
  }
};

const sendWithZeptoMail = async (
  env: NotificationBindings,
  message: EmailMessage,
  signal: AbortSignal,
): Promise<EmailProviderResult> => {
  const token = env.ZEPTOMAIL_SEND_TOKEN?.trim();
  if (!token) return { ok: false, errorCode: 'zeptomail_token_missing', retryable: false };

  try {
    const response = await fetch(ZEPTOMAIL_ENDPOINT, {
      method: 'POST',
      signal,
      headers: {
        Accept: 'application/json',
        Authorization: `Zoho-enczapikey ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: { address: message.fromEmail, name: message.fromName },
        to: [{ email_address: { address: message.to } }],
        subject: message.subject,
        htmlbody: message.html,
        textbody: message.text,
        client_reference: message.deduplicationKey,
        track_clicks: false,
        track_opens: false,
      }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      request_id?: string;
      error?: { request_id?: string };
    };
    if (response.ok)
      return { ok: true, providerId: result.request_id ?? result.error?.request_id ?? null };
    return {
      ok: false,
      errorCode: `zeptomail_${response.status}`,
      retryable: retryableStatus(response.status),
    };
  } catch {
    return { ok: false, errorCode: 'zeptomail_network_error', retryable: true };
  }
};

export const sendNotificationEmail = (
  env: NotificationBindings,
  provider: NotificationsEmailProvider,
  message: EmailMessage,
  signal: AbortSignal,
): Promise<EmailProviderResult> =>
  provider === 'zeptomail'
    ? sendWithZeptoMail(env, message, signal)
    : sendWithResend(env, message, signal);
