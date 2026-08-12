const MAX_MESSAGE_LENGTH = 500;
const MAX_STACK_LENGTH = 2_000;
const MAX_PATH_LENGTH = 300;

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const URL_QUERY_PATTERN = /(https?:\/\/[^\s?#]+)(?:\?[^\s#]*)?(?:#[^\s]*)?/gi;

const truncate = (value: string, maxLength: number) =>
  value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;

export const sanitizeDiagnosticText = (value: unknown, maxLength = MAX_MESSAGE_LENGTH) => {
  if (typeof value !== 'string') return '';
  return truncate(
    value
      .replace(BEARER_PATTERN, 'Bearer [redacted]')
      .replace(JWT_PATTERN, '[redacted-token]')
      .replace(EMAIL_PATTERN, '[redacted-email]')
      .replace(URL_QUERY_PATTERN, '$1'),
    maxLength,
  );
};

export const sanitizePathname = (value: unknown) => {
  if (typeof value !== 'string' || !value.startsWith('/')) return '/';
  const withoutQuery = value.split(/[?#]/, 1)[0] ?? '/';
  return truncate(withoutQuery, MAX_PATH_LENGTH);
};

export type ClientErrorEvent = {
  kind: 'error' | 'unhandledrejection';
  message: string;
  stack?: string;
  path: string;
};

export const parseClientErrorEvent = (value: unknown): ClientErrorEvent | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (input.kind !== 'error' && input.kind !== 'unhandledrejection') return null;

  const message = sanitizeDiagnosticText(input.message);
  if (!message) return null;

  const stack = sanitizeDiagnosticText(input.stack, MAX_STACK_LENGTH);
  return {
    kind: input.kind,
    message,
    ...(stack ? { stack } : {}),
    path: sanitizePathname(input.path),
  };
};

export const workerErrorLog = (
  error: unknown,
  request: Request,
  requestId: string,
  env: { APP_ENV?: string; BUILD_COMMIT?: string; APP_VERSION?: string },
) => {
  const resolved = error instanceof Error ? error : new Error('Unknown error');
  return {
    event: 'worker_error',
    requestId,
    environment: env.APP_ENV ?? 'development',
    commit: env.BUILD_COMMIT ?? 'unknown',
    version: env.APP_VERSION ?? 'unknown',
    method: request.method,
    path: new URL(request.url).pathname,
    name: resolved.name,
    message: sanitizeDiagnosticText(resolved.message),
  };
};

export const clientErrorLog = (
  event: ClientErrorEvent,
  requestId: string,
  env: { APP_ENV?: string; BUILD_COMMIT?: string; APP_VERSION?: string },
) => ({
  event: 'client_error',
  requestId,
  environment: env.APP_ENV ?? 'development',
  commit: env.BUILD_COMMIT ?? 'unknown',
  version: env.APP_VERSION ?? 'unknown',
  kind: event.kind,
  message: event.message,
  ...(event.stack ? { stack: event.stack } : {}),
  path: event.path,
});
