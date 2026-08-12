import { apiBaseUrl } from './api';

const MAX_MESSAGE_LENGTH = 500;
const MAX_STACK_LENGTH = 2_000;

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const URL_QUERY_PATTERN = /(https?:\/\/[^\s?#]+)(?:\?[^\s#]*)?(?:#[^\s]*)?/gi;

const sanitize = (value: unknown, maxLength: number) => {
  if (typeof value !== 'string') return '';
  const redacted = value
    .replace(BEARER_PATTERN, 'Bearer [redacted]')
    .replace(JWT_PATTERN, '[redacted-token]')
    .replace(EMAIL_PATTERN, '[redacted-email]')
    .replace(URL_QUERY_PATTERN, '$1');
  return redacted.length > maxLength ? `${redacted.slice(0, maxLength)}…` : redacted;
};

const pathname = () => `${window.location.pathname}`.slice(0, 300);

const report = (payload: {
  kind: 'error' | 'unhandledrejection';
  message: string;
  stack?: string;
}) => {
  const message = sanitize(payload.message, MAX_MESSAGE_LENGTH);
  if (!message) return;

  const body = JSON.stringify({
    kind: payload.kind,
    message,
    ...(payload.stack ? { stack: sanitize(payload.stack, MAX_STACK_LENGTH) } : {}),
    path: pathname(),
  });

  void fetch(`${apiBaseUrl}/telemetry/client-error`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => undefined);
};

export const installClientObservability = () => {
  window.addEventListener('error', (event) => {
    report({
      kind: 'error',
      message: event.message || event.error?.name || 'Unhandled browser error',
      stack: event.error instanceof Error ? event.error.stack : undefined,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    report({
      kind: 'unhandledrejection',
      message: reason instanceof Error ? reason.message : String(reason ?? 'Unhandled rejection'),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
};
