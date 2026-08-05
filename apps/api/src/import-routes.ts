import { Hono } from 'hono';
import { z } from 'zod';
import { uuidSchema } from '@habitta/validation';
import type { NotificationBindings } from './notifications/types';

type Variables = { token: string; userId: string };
type ImportEnvironment = { Bindings: NotificationBindings; Variables: Variables };
type RemoteIssue = { row: number; error: string };

const unitRowSchema = z.object({
  building_name: z.string(),
  unit_code: z.string(),
  unit_type: z.string(),
  floor: z.string(),
  ownership_percentage: z.string(),
  status: z.string(),
});

const peopleRowSchema = z.object({
  unit_code: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  email: z.string(),
  phone: z.string(),
  relationship: z.string(),
  ownership_percentage: z.string(),
});

const unitPreviewSchema = z.object({ rows: z.array(unitRowSchema).min(1).max(1000) });
const unitCommitSchema = unitPreviewSchema.extend({
  idempotencyKey: z.string().trim().min(1).max(200),
  filename: z.string().trim().max(255).optional(),
});
const peoplePreviewSchema = z.object({ rows: z.array(peopleRowSchema).min(1).max(1000) });

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
  const parsed = unitPreviewSchema.safeParse(await c.req.json());
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
  const parsed = unitCommitSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const response = await callRpc(c.env, c.get('token'), 'import_structure_csv', {
    target: condominiumId.data,
    rows: parsed.data.rows,
    key: parsed.data.idempotencyKey,
    import_filename: parsed.data.filename ?? null,
  });
  return c.json(await response.json(), response.ok ? 201 : response.status === 403 ? 403 : 400);
});

importRoutes.post('/:condominiumId/imports/people/preview', async (c) => {
  const condominiumId = uuidSchema.safeParse(c.req.param('condominiumId'));
  if (!condominiumId.success) return c.json({ error: 'Invalid condominium identifier' }, 400);
  const parsed = peoplePreviewSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const unitsResponse = await fetch(
    `${c.env.SUPABASE_URL}/rest/v1/units?condominium_id=eq.${condominiumId.data}&select=code`,
    { headers: headers(c.env, c.get('token')) },
  );
  if (!unitsResponse.ok) return c.json({ error: 'Unable to validate units' }, 400);

  const knownUnits = new Set(
    ((await unitsResponse.json()) as { code: string }[]).map((unit) =>
      unit.code.toLocaleLowerCase('en-US'),
    ),
  );
  const seenEmails = new Set<string>();
  const valid: { row: number; data: z.infer<typeof peopleRowSchema> }[] = [];
  const errors: RemoteIssue[] = [];

  parsed.data.rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const unitCode = row.unit_code.trim();
    const relationship = row.relationship.trim();
    const ownership = row.ownership_percentage.trim();
    const email = row.email.trim().toLocaleLowerCase('en-US');
    let issue = '';

    if (!knownUnits.has(unitCode.toLocaleLowerCase('en-US'))) issue = 'Unknown unit';
    else if (!row.first_name.trim() || !row.last_name.trim()) issue = 'Missing name';
    else if (
      !['owner', 'owner_occupant', 'tenant', 'family_member', 'authorized_occupant'].includes(
        relationship,
      )
    )
      issue = 'Invalid relationship';
    else if (email && !/^\S+@\S+\.\S+$/.test(email)) issue = 'Invalid email';
    else if (email && seenEmails.has(email)) issue = 'Duplicate email';
    else if (
      ownership &&
      (!/^(100(?:\.0+)?|(?:[0-9]|[1-9][0-9])(?:\.\d+)?)$/.test(ownership) ||
        Number(ownership) <= 0)
    )
      issue = 'Invalid ownership percentage';
    else if (ownership && !['owner', 'owner_occupant'].includes(relationship))
      issue = 'Ownership percentage only applies to owners';

    if (issue) errors.push({ row: rowNumber, error: issue });
    else {
      if (email) seenEmails.add(email);
      valid.push({ row: rowNumber, data: row });
    }
  });

  return c.json({ valid, errors, valid_count: valid.length, error_count: errors.length });
});
