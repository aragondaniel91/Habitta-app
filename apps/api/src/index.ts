import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { HealthResponse, MeResponse } from '@habitta/contracts';

type Bindings = { SUPABASE_URL: string; SUPABASE_ANON_KEY: string; APP_ENV: string };
type Variables = { userId: string };

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use(
  '*',
  cors({ origin: ['http://localhost:5173'], allowHeaders: ['Authorization', 'Content-Type'] }),
);

app.get('/health', (context) =>
  context.json<HealthResponse>({ status: 'ok', service: 'habitta-api' }),
);

app.use('/v1/*', async (context, next) => {
  const authorization = context.req.header('Authorization');
  if (!authorization?.startsWith('Bearer ')) return context.json({ error: 'Unauthorized' }, 401);

  const response = await fetch(`${context.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: context.env.SUPABASE_ANON_KEY, Authorization: authorization },
  });
  if (!response.ok) return context.json({ error: 'Unauthorized' }, 401);

  const user = (await response.json()) as { id: string };
  context.set('userId', user.id);
  await next();
});

app.get('/v1/me', (context) => {
  const response: MeResponse = { userId: context.get('userId'), tenant: null };
  return context.json(response);
});

export default app;
