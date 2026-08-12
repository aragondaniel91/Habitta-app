import { Hono } from 'hono';
import { cors } from 'hono/cors';
import applicationHandler, { app as applicationApp } from './index';
import { isAllowedCorsOrigin, publicErrorForStatus, readPostgrestError } from './http-security';
import type { NotificationBindings, NotificationQueueMessage } from './notifications/types';

type Bindings = NotificationBindings;
type Variables = { token: string; userId: string };

export const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.onError((error, c) => {
  const requestId = crypto.randomUUID();
  console.error('Unhandled API error', {
    requestId,
    method: c.req.method,
    path: c.req.path,
    name: error.name,
    message: error.message,
  });
  return c.json({ error: 'Request failed', requestId }, 500);
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

  const upstreamError = await readPostgrestError(c.res);
  if (!upstreamError) return;

  const requestId = crypto.randomUUID();
  console.error('PostgREST request failed', {
    requestId,
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    code: upstreamError.code,
    message: upstreamError.message,
  });

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
    ],
  }),
);

app.route('/', applicationApp);

export default {
  fetch: app.fetch,
  scheduled: applicationHandler.scheduled,
  queue: applicationHandler.queue,
} satisfies ExportedHandler<Bindings, NotificationQueueMessage>;
