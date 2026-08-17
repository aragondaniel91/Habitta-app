import { Hono } from 'hono';
import { cors } from 'hono/cors';
import applicationHandler, { app as applicationApp } from './index';
import {
  isAllowedCorsOrigin,
  publicErrorForStatus,
  readPostgrestError,
  withinRateLimit,
} from './http-security';
import {
  clientErrorLog,
  financial5xxLog,
  parseClientErrorEvent,
  workerErrorLog,
} from './observability';
import type { NotificationBindings, NotificationQueueMessage } from './notifications/types';
import { requestRateLimitScope } from './request-rate-limit';

type Bindings = NotificationBindings;
type Variables = { token: string; userId: string; requestId: string };

const requestIds = new WeakMap<Request, string>();
const capturedApplicationErrors = new WeakSet<Request>();

const logFinancial5xx = (
  request: Request,
  requestId: string,
  env: Bindings,
  status: number,
  error?: unknown,
) => {
  const event = financial5xxLog(request, requestId, env, status, error);
  if (event) console.error(event);
};

// The application app historically had its own generic onError handler. Override it at the
// composition boundary so thrown errors are captured before they are converted into safe JSON.
// The outer request-id middleware registers the same Request object in a WeakMap, which lets the
// inner handler preserve correlation without trusting a caller-provided header.
applicationApp.onError((error, c) => {
  const requestId = requestIds.get(c.req.raw) ?? crypto.randomUUID();
  const status = error.name === 'ZodError' ? 400 : 500;

  if (status >= 500) {
    capturedApplicationErrors.add(c.req.raw);
    console.error(workerErrorLog(error, c.req.raw, requestId, c.env));
    logFinancial5xx(c.req.raw, requestId, c.env, status, error);
  }

  return c.json({ error: status === 400 ? 'Invalid identifier' : 'Request failed' }, status);
});

export const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.onError((error, c) => {
  const requestId = c.get('requestId') || crypto.randomUUID();
  console.error(workerErrorLog(error, c.req.raw, requestId, c.env));
  logFinancial5xx(c.req.raw, requestId, c.env, 500, error);
  c.header('Cache-Control', 'no-store');
  c.header('X-Request-Id', requestId);
  return c.json({ error: 'Request failed', requestId }, 500);
});

// Establish one server-owned correlation ID for the full request lifecycle. Do not accept a
// caller-provided ID: untrusted high-cardinality values make production diagnostics noisy.
app.use('*', async (c, next) => {
  const requestId = crypto.randomUUID();
  c.set('requestId', requestId);
  requestIds.set(c.req.raw, requestId);
  c.header('X-Request-Id', requestId);
  await next();
  c.header('X-Request-Id', requestId);
});

// One place decides which origins are allowed. Deciding it here and again inside the application
// invited the two answers to drift, and they had: the inner copy always trusted localhost, even in
// production. The guard rejects outright and the middleware below writes the headers.
app.use('*', async (c, next) => {
  const origin = c.req.header('Origin');
  if (!isAllowedCorsOrigin(origin, c.env?.CORS_ALLOWED_ORIGINS, c.env?.APP_ENV)) {
    return c.json({ error: 'Origin not allowed' }, 403);
  }

  await next();

  const requestId = c.get('requestId');
  const upstreamError = await readPostgrestError(c.res);
  if (upstreamError) {
    console.error({
      event: 'postgrest_error',
      requestId,
      environment: c.env?.APP_ENV ?? 'development',
      commit: c.env?.BUILD_COMMIT ?? 'unknown',
      version: c.env?.APP_VERSION ?? 'unknown',
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      code: upstreamError.code,
    });
    if (c.res.status >= 500) logFinancial5xx(c.req.raw, requestId, c.env, c.res.status);
  } else if (c.res.status >= 500) {
    console.error({
      event: 'application_5xx',
      requestId,
      environment: c.env?.APP_ENV ?? 'development',
      commit: c.env?.BUILD_COMMIT ?? 'unknown',
      version: c.env?.APP_VERSION ?? 'unknown',
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
    });
    if (!capturedApplicationErrors.has(c.req.raw)) {
      logFinancial5xx(c.req.raw, requestId, c.env, c.res.status);
    }
  } else {
    return;
  }

  const headers = new Headers(c.res.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('Content-Type', 'application/json; charset=UTF-8');
  headers.set('X-Request-Id', requestId);
  headers.delete('Content-Length');

  c.res = new Response(JSON.stringify({ error: publicErrorForStatus(c.res.status), requestId }), {
    status: c.res.status,
    statusText: c.res.statusText,
    headers,
  });
});

app.use(
  '*',
  cors({
    origin: (origin, c) =>
      isAllowedCorsOrigin(origin, c.env?.CORS_ALLOWED_ORIGINS, c.env?.APP_ENV) ? origin : undefined,
    allowHeaders: [
      'Authorization',
      'Content-Type',
      'X-Filename',
      'X-Document-Type',
      'X-Visibility',
      'X-Comment-Id',
      'X-Quote-Id',
      'X-Change-Note',
    ],
  }),
);

// High-risk writes are limited at the outer Worker boundary so every current and future handler
// under these route families gets the same protection. Keys never include a raw bearer token.
app.use('/v1/*', async (c, next) => {
  const scope = await requestRateLimitScope(c.req.raw);
  if (!scope) return next();

  const limiter =
    scope.kind === 'organization-signup'
      ? c.env.ORGANIZATION_SIGNUP_LIMIT
      : c.env.FINANCIAL_WRITE_LIMIT;

  if (!(await withinRateLimit(limiter, scope.key))) {
    return c.json({ error: 'Too many requests', requestId: c.get('requestId') }, 429);
  }

  return next();
});

// Public by design so errors on login/signup can still be seen. The origin guard above, strict
// payload contract, body-size cap and Cloudflare limiter keep it from becoming a generic log sink.
app.post('/telemetry/client-error', async (c) => {
  const requestId = c.get('requestId');
  const contentType = c.req.header('Content-Type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return c.json({ error: 'Unsupported media type', requestId }, 415);
  }

  const declaredLength = Number(c.req.header('Content-Length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > 4096) {
    return c.json({ error: 'Payload too large', requestId }, 413);
  }

  const callerKey = c.req.header('CF-Connecting-IP') ?? 'unknown';
  if (!(await withinRateLimit(c.env.TELEMETRY_LIMIT, callerKey))) {
    return c.json({ error: 'Too many requests', requestId }, 429);
  }

  let raw: unknown;
  try {
    const text = await c.req.text();
    if (new TextEncoder().encode(text).byteLength > 4096) {
      return c.json({ error: 'Payload too large', requestId }, 413);
    }
    raw = JSON.parse(text) as unknown;
  } catch {
    return c.json({ error: 'Invalid request', requestId }, 400);
  }

  const event = parseClientErrorEvent(raw);
  if (!event) return c.json({ error: 'Invalid request', requestId }, 400);

  console.error(clientErrorLog(event, requestId, c.env));
  c.header('Cache-Control', 'no-store');
  return c.json({ accepted: true, requestId }, 202);
});

app.route('/', applicationApp);

export default {
  fetch: app.fetch,
  scheduled: applicationHandler.scheduled,
  queue: applicationHandler.queue,
} satisfies ExportedHandler<Bindings, NotificationQueueMessage>;
