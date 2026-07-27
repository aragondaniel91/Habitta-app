import { Hono } from 'hono';
import type { Context } from 'hono';
import { cors } from 'hono/cors';
import {
  buildingInputSchema,
  condominiumInputSchema,
  organizationInputSchema,
  unitInputSchema,
  uuidSchema,
} from '@habitta/validation';

type Bindings = { SUPABASE_URL: string; SUPABASE_ANON_KEY: string };
type Variables = { token: string; userId: string };
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
app.onError((error, c) =>
  c.json(
    { error: error.name === 'ZodError' ? 'Invalid identifier' : 'Request failed' },
    error.name === 'ZodError' ? 400 : 500,
  ),
);
app.use(
  '*',
  cors({ origin: ['http://localhost:5173'], allowHeaders: ['Authorization', 'Content-Type'] }),
);
app.get('/health', (c) => c.json({ status: 'ok' as const, service: 'habitta-api' as const }));
app.use('/v1/*', async (c, n) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  const r = await fetch(`${c.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: c.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return c.json({ error: 'Unauthorized' }, 401);
  c.set('token', token);
  c.set('userId', ((await r.json()) as { id: string }).id);
  await n();
});
const rest = (
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  path: string,
  init: RequestInit = {},
) =>
  fetch(`${c.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: c.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${c.get('token')}`,
      Prefer: 'return=representation',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
// Zod schemas are intentionally supplied by each route; this keeps the response helper generic.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const body = async (c: any, s: any) => {
  const p = s.safeParse(await c.req.json());
  return p.success ? p.data : c.json({ error: p.error.flatten() }, 400);
};
app.get('/v1/organizations', async (c) =>
  c.json(await (await rest(c, 'organizations?select=*&order=created_at')).json()),
);
app.post('/v1/organizations', async (c) => {
  const p = await body(c, organizationInputSchema);
  if (p instanceof Response) return p;
  const r = await fetch(`${c.env.SUPABASE_URL}/rest/v1/rpc/create_organization_with_condominium`, {
    method: 'POST',
    headers: {
      apikey: c.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${c.get('token')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      organization_name: p.name,
      condominium_name: p.condominiumName ?? null,
    }),
  });
  return c.json(await r.json(), r.ok ? 201 : 400);
});
app.get('/v1/condominiums', async (c) =>
  c.json(await (await rest(c, 'condominiums?select=*&order=name')).json()),
);
app.post('/v1/condominiums', async (c) => {
  const p = await body(c, condominiumInputSchema);
  if (p instanceof Response) return p;
  const r = await fetch(`${c.env.SUPABASE_URL}/rest/v1/rpc/create_condominium`, {
    method: 'POST',
    headers: {
      apikey: c.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${c.get('token')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      target_organization_id: p.organizationId,
      condominium_name: p.name,
    }),
  });
  const result = await r.json();
  return c.json(result, r.ok ? 201 : 400);
});
app.get('/v1/condominiums/:id', async (c) =>
  c.json(
    await (
      await rest(c, `condominiums?id=eq.${uuidSchema.parse(c.req.param('id'))}&select=*`)
    ).json(),
  ),
);
app.get('/v1/condominiums/:id/buildings', async (c) =>
  c.json(
    await (
      await rest(
        c,
        `buildings?condominium_id=eq.${uuidSchema.parse(c.req.param('id'))}&select=*&order=name`,
      )
    ).json(),
  ),
);
app.post('/v1/condominiums/:id/buildings', async (c) => {
  const p = await body(c, buildingInputSchema);
  if (p instanceof Response) return p;
  const r = await rest(c, 'buildings', {
    method: 'POST',
    body: JSON.stringify({
      condominium_id: uuidSchema.parse(c.req.param('id')),
      name: p.name,
      created_by: c.get('userId'),
    }),
  });
  return c.json(await r.json(), r.ok ? 201 : 400);
});
app.get('/v1/condominiums/:id/units', async (c) =>
  c.json(
    await (
      await rest(
        c,
        `units?condominium_id=eq.${uuidSchema.parse(c.req.param('id'))}&select=*&order=code`,
      )
    ).json(),
  ),
);
app.post('/v1/condominiums/:id/units', async (c) => {
  const p = await body(c, unitInputSchema);
  if (p instanceof Response) return p;
  const r = await rest(c, 'units', {
    method: 'POST',
    body: JSON.stringify({
      condominium_id: uuidSchema.parse(c.req.param('id')),
      building_id: p.buildingId ?? null,
      code: p.code,
      type: p.type,
      floor: p.floor ?? null,
      ownership_percentage: p.ownershipPercentage ?? null,
      status: p.status,
      created_by: c.get('userId'),
    }),
  });
  return c.json(await r.json(), r.ok ? 201 : 400);
});
export default app;
