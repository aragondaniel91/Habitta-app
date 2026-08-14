import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import type { NotificationBindings } from './notifications/types';

type Variables = { token: string; userId: string };
type AppEnvironment = { Bindings: NotificationBindings; Variables: Variables };
type AppContext = Context<AppEnvironment>;

const uuid = z.string().uuid();
const querySchema = z.object({
  module: z
    .enum(['payments', 'expenses', 'treasury', 'maintenance', 'governance', 'assemblies'])
    .optional(),
  actor: uuid.optional(),
  entityType: z.string().trim().min(1).max(80).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const rpc = (c: AppContext, name: string, payload: unknown) =>
  fetch(`${c.env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: c.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${c.get('token')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

export const adminAuditRoutes = new Hono<AppEnvironment>();

adminAuditRoutes.get('/:id/audit-events', async (c) => {
  const condominiumId = uuid.safeParse(c.req.param('id'));
  const query = querySchema.safeParse(c.req.query());
  if (!condominiumId.success || !query.success) {
    return c.json({ error: 'Invalid audit query' }, 400);
  }

  if (query.data.from && query.data.to && Date.parse(query.data.to) < Date.parse(query.data.from)) {
    return c.json({ error: 'Invalid audit date range' }, 400);
  }

  const response = await rpc(c, 'list_admin_audit_events', {
    target_condominium: condominiumId.data,
    filter_module: query.data.module ?? null,
    filter_actor: query.data.actor ?? null,
    filter_entity_type: query.data.entityType ?? null,
    from_at: query.data.from ?? null,
    to_at: query.data.to ?? null,
    result_limit: query.data.limit,
    result_offset: query.data.offset,
  });

  const value = (await response.json()) as unknown;
  if (response.ok) return c.json(value, 200);

  if (response.status === 401 || response.status === 403) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const error = value as { code?: string; message?: string };
  if (error.code === '42501' || error.message?.includes('not authorized')) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  return c.json({ error: error.message ?? 'Audit log unavailable' }, 400);
});
