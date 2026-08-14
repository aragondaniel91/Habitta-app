const MAX_MESSAGE_LENGTH = 500;
const MAX_STACK_LENGTH = 2_000;
const MAX_PATH_LENGTH = 300;

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const URL_QUERY_PATTERN = /(https?:\/\/[^\s?#]+)(?:\?[^\s#]*)?(?:#[^\s]*)?/gi;
const CRITICAL_FINANCIAL_PATH = /^\/v1\/condominiums\/[^/]+\/(payments|treasury|expenses)(?:\/|$)/i;

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

export const criticalFinancialRoute = (value: unknown) => {
  const path = sanitizePathname(value);
  const match = CRITICAL_FINANCIAL_PATH.exec(path);
  return match?.[1]?.toLowerCase() ?? null;
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

type ObservabilityEnv = { APP_ENV?: string; BUILD_COMMIT?: string; APP_VERSION?: string };

const errorDiagnostics = (error: unknown) => {
  const resolved = error instanceof Error ? error : new Error('Unknown error');
  const stack = sanitizeDiagnosticText(resolved.stack, MAX_STACK_LENGTH);
  return {
    name: sanitizeDiagnosticText(resolved.name, 120) || 'Error',
    message: sanitizeDiagnosticText(resolved.message),
    ...(stack ? { stack } : {}),
  };
};

export const workerErrorLog = (
  error: unknown,
  request: Request,
  requestId: string,
  env: ObservabilityEnv,
) => ({
  event: 'worker_error',
  requestId,
  environment: env.APP_ENV ?? 'development',
  commit: env.BUILD_COMMIT ?? 'unknown',
  version: env.APP_VERSION ?? 'unknown',
  method: request.method,
  path: sanitizePathname(new URL(request.url).pathname),
  ...errorDiagnostics(error),
});

export const financial5xxLog = (
  request: Request,
  requestId: string,
  env: ObservabilityEnv,
  status: number,
  error?: unknown,
) => {
  const route = criticalFinancialRoute(new URL(request.url).pathname);
  if (!route || status < 500 || status > 599) return null;

  return {
    event: 'critical_financial_5xx',
    requestId,
    environment: env.APP_ENV ?? 'development',
    commit: env.BUILD_COMMIT ?? 'unknown',
    version: env.APP_VERSION ?? 'unknown',
    method: request.method,
    route,
    status,
    ...(error === undefined ? {} : errorDiagnostics(error)),
  };
};

export const clientErrorLog = (
  event: ClientErrorEvent,
  requestId: string,
  env: ObservabilityEnv,
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
