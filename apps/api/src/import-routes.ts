import { Hono } from 'hono';
import { z } from 'zod';
import { uuidSchema } from '@habitta/validation';
import type { NotificationBindings } from './notifications/types';

type Variables = { token: string; userId: string };
type ImportEnvironment = { Bindings: NotificationBindings; Variables: Variables };

const unitRowSchema = z.object({
  building_name: z.string(),
  unit_code: z.string(),
  unit_type: z.string(),
  floor: z.string(),
  ownership_percentage: z.string(),
  status: z.string(),
});

const previewSchema = z.object({ rows: z.array(unitRowSchema).min(1).max(1000) });
const commitSchema = previewSchema.extend({
  idempotencyKey: z.string().trim().min(1).max(200),
  filename: z.string().trim().max(255).optional(),
});

const headers = (env: NotificationBindings, token: string) => ({
  apikey: env.SUPABASE_ANON_KEY,
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

const callRpc = (
  env: NotificationBindings,
  token: string,
  name: string,
  payload: Record<string, unknown>,
) =>
  fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: headers(env, token),
    body: JSON.stringify(payload),
  });

export const importRoutes = new Hono<ImportEnvironment>();

importRoutes.post('/:condominiumId/imports/units/preview', async (c) => {
  const condominiumId = uuidSchema.safeParse(c.req.param('condominiumId'));
  if (!condominiumId.success) return c.json({ error: 'Invalid condominium identifier' }, 400);
  const parsed = previewSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const response = await callRpc(c.env, c.get('token'), 'preview_structure_import', {
    target: condominiumId.data,
    rows: parsed.data.rows,
  });
  return c.json(await response.json(), response.ok ? 200 : response.status === 403 ? 403 : 400);
});

importRoutes.post('/:condominiumId/imports/units/commit', async (c) => {
  const condominiumId = uuidSchema.safeParse(c.req.param('condominiumId'));
  if (!condominiumId.success) return c.json({ error: 'Invalid condominium identifier' }, 400);
  const parsed = commitSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const response = await callRpc(c.env, c.get('token'), 'import_structure_csv', {
    target: condominiumId.data,
    rows: parsed.data.rows,
    key: parsed.data.idempotencyKey,
    import_filename: parsed.data.filename ?? null,
  });
  return c.json(await response.json(), response.ok ? 201 : response.status === 403 ? 403 : 400);
});
