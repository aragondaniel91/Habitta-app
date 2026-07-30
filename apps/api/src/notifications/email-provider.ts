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
  | { ok: true; providerId: string | null }
  | {
      ok: false;
      errorCode: string;
      retryable: boolean;
      providerId?: string | null;
    };

const retryableStatus = (status: number) => status === 408 || status === 429 || status >= 500;
const safeProviderCode = (value?: string) =>
  value?.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || null;

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

type ZeptoMailResponse = {
  request_id?: string;
  code?: string;
  message?: string;
  error?: {
    request_id?: string;
    code?: string;
    message?: string;
  };
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
        Authorization: `zoho-enczapikey ${token}`,
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
    const result = (await response.json().catch(() => ({}))) as ZeptoMailResponse;
    const providerId = result.request_id ?? result.error?.request_id ?? null;
    if (response.ok) return { ok: true, providerId };

    const providerCode = safeProviderCode(result.error?.code ?? result.code);
    return {
      ok: false,
      errorCode: providerCode
        ? `zeptomail_${response.status}_${providerCode}`
        : `zeptomail_${response.status}`,
      retryable: retryableStatus(response.status),
      providerId,
    };
  } catch (error) {
    return {
      ok: false,
      errorCode:
        error instanceof DOMException && error.name === 'AbortError'
          ? 'zeptomail_timeout'
          : 'zeptomail_network_error',
      retryable: true,
    };
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
