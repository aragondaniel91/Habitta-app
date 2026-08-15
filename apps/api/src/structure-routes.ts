import { Hono } from 'hono';
import { z } from 'zod';
import { buildingInputSchema, uuidSchema } from '@habitta/validation';
import type { NotificationBindings } from './notifications/types';

type Variables = { token: string; userId: string };
type StructureEnvironment = { Bindings: NotificationBindings; Variables: Variables };
type ValidationFailure = { formErrors: string[]; fieldErrors: Record<string, string[]> };
type PostgrestError = { code?: string; message?: string };

const unitTypeSchema = z.enum(['apartment', 'house', 'commercial', 'parking', 'storage']);
const unitStatusSchema = z.enum(['active', 'inactive']);

const buildingUpdateSchema = buildingInputSchema
  .partial()
  .refine((value) => value.name !== undefined, {
    message: 'At least one field is required',
  });

const unitCreateSchema = z.object({
  buildingId: uuidSchema.nullable().optional(),
  code: z.string().trim().min(1).max(40),
  type: unitTypeSchema,
  floor: z.string().trim().max(20).nullable().optional(),
  ownershipPercentage: z.number().positive().max(100).nullable().optional(),
  status: unitStatusSchema.default('active'),
});

const unitUpdateSchema = z
  .object({
    buildingId: uuidSchema.nullable().optional(),
    code: z.string().trim().min(1).max(40).optional(),
    type: unitTypeSchema.optional(),
    floor: z.string().trim().max(20).nullable().optional(),
    ownershipPercentage: z.number().positive().max(100).nullable().optional(),
    status: unitStatusSchema.optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: 'At least one field is required',
  });

const parseJsonBody = async <T extends z.ZodTypeAny>(request: Request, schema: T) => {
  const result = schema.safeParse(await request.json());
  return result.success ? result.data : result.error.flatten();
};

const isValidationError = (value: unknown): value is ValidationFailure =>
  Boolean(value && typeof value === 'object' && 'fieldErrors' in value);

const isPostgrestError = (value: unknown): value is PostgrestError =>
  Boolean(value && typeof value === 'object');

const isUnitCodeConflict = (value: unknown) =>
  isPostgrestError(value) && value.code === '23505';

const supabaseHeaders = (env: NotificationBindings, token: string, representation = false) => ({
  apikey: env.SUPABASE_ANON_KEY,
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  ...(representation ? { Prefer: 'return=representation' } : {}),
});

const condominiumId = (raw: string) => uuidSchema.safeParse(raw);

export const structureRoutes = new Hono<StructureEnvironment>();

structureRoutes.get('/:condominiumId/buildings', async (c) => {
  const parsedId = condominiumId(c.req.param('condominiumId'));
  if (!parsedId.success) return c.json({ error: 'Invalid condominium identifier' }, 400);

  const response = await fetch(
    `${c.env.SUPABASE_URL}/rest/v1/buildings?condominium_id=eq.${parsedId.data}&select=*&order=name.asc`,
    { headers: supabaseHeaders(c.env, c.get('token')) },
  );
  return c.json(await response.json(), response.ok ? 200 : 400);
});

structureRoutes.post('/:condominiumId/buildings', async (c) => {
  const parsedId = condominiumId(c.req.param('condominiumId'));
  if (!parsedId.success) return c.json({ error: 'Invalid condominium identifier' }, 400);
  const parsed = await parseJsonBody(c.req.raw, buildingInputSchema);
  if (isValidationError(parsed)) return c.json({ error: parsed }, 400);

  const response = await fetch(`${c.env.SUPABASE_URL}/rest/v1/buildings`, {
    method: 'POST',
    headers: supabaseHeaders(c.env, c.get('token'), true),
    body: JSON.stringify({
      condominium_id: parsedId.data,
      name: parsed.name,
      created_by: c.get('userId'),
    }),
  });
  return c.json(await response.json(), response.ok ? 201 : 400);
});

structureRoutes.patch('/:condominiumId/buildings/:buildingId', async (c) => {
  const parsedCondominiumId = condominiumId(c.req.param('condominiumId'));
  const parsedBuildingId = uuidSchema.safeParse(c.req.param('buildingId'));
  if (!parsedCondominiumId.success || !parsedBuildingId.success)
    return c.json({ error: 'Invalid structure identifier' }, 400);
  const parsed = await parseJsonBody(c.req.raw, buildingUpdateSchema);
  if (isValidationError(parsed)) return c.json({ error: parsed }, 400);

  const response = await fetch(
    `${c.env.SUPABASE_URL}/rest/v1/buildings?id=eq.${parsedBuildingId.data}&condominium_id=eq.${parsedCondominiumId.data}`,
    {
      method: 'PATCH',
      headers: supabaseHeaders(c.env, c.get('token'), true),
      body: JSON.stringify({ name: parsed.name, updated_at: new Date().toISOString() }),
    },
  );
  const result = await response.json();
  if (response.ok && Array.isArray(result) && result.length === 0)
    return c.json({ error: 'Building not found' }, 404);
  return c.json(result, response.ok ? 200 : 400);
});

structureRoutes.get('/:condominiumId/units', async (c) => {
  const parsedId = condominiumId(c.req.param('condominiumId'));
  if (!parsedId.success) return c.json({ error: 'Invalid condominium identifier' }, 400);

  const response = await fetch(
    `${c.env.SUPABASE_URL}/rest/v1/units?condominium_id=eq.${parsedId.data}&select=*&order=code.asc`,
    { headers: supabaseHeaders(c.env, c.get('token')) },
  );
  return c.json(await response.json(), response.ok ? 200 : 400);
});

structureRoutes.post('/:condominiumId/units', async (c) => {
  const parsedId = condominiumId(c.req.param('condominiumId'));
  if (!parsedId.success) return c.json({ error: 'Invalid condominium identifier' }, 400);
  const parsed = await parseJsonBody(c.req.raw, unitCreateSchema);
  if (isValidationError(parsed)) return c.json({ error: parsed }, 400);

  const response = await fetch(`${c.env.SUPABASE_URL}/rest/v1/units`, {
    method: 'POST',
    headers: supabaseHeaders(c.env, c.get('token'), true),
    body: JSON.stringify({
      condominium_id: parsedId.data,
      building_id: parsed.buildingId ?? null,
      code: parsed.code,
      type: parsed.type,
      floor: parsed.floor || null,
      ownership_percentage: parsed.ownershipPercentage ?? null,
      status: parsed.status,
      created_by: c.get('userId'),
    }),
  });
  const result = await response.json();
  if (isUnitCodeConflict(result)) {
    return c.json(
      {
        error: 'unit_code_conflict',
        publicMessage: 'Ya existe una unidad con ese código en este condominio.',
      },
      409,
    );
  }
  if (!response.ok && response.status === 403)
    return c.json({ error: 'Unit write forbidden' }, 403);
  return c.json(result, response.ok ? 201 : 400);
});

structureRoutes.patch('/:condominiumId/units/:unitId', async (c) => {
  const parsedCondominiumId = condominiumId(c.req.param('condominiumId'));
  const parsedUnitId = uuidSchema.safeParse(c.req.param('unitId'));
  if (!parsedCondominiumId.success || !parsedUnitId.success)
    return c.json({ error: 'Invalid structure identifier' }, 400);
  const parsed = await parseJsonBody(c.req.raw, unitUpdateSchema);
  if (isValidationError(parsed)) return c.json({ error: parsed }, 400);

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.buildingId !== undefined) updates.building_id = parsed.buildingId;
  if (parsed.code !== undefined) updates.code = parsed.code;
  if (parsed.type !== undefined) updates.type = parsed.type;
  if (parsed.floor !== undefined) updates.floor = parsed.floor || null;
  if (parsed.ownershipPercentage !== undefined)
    updates.ownership_percentage = parsed.ownershipPercentage;
  if (parsed.status !== undefined) updates.status = parsed.status;

  const response = await fetch(
    `${c.env.SUPABASE_URL}/rest/v1/units?id=eq.${parsedUnitId.data}&condominium_id=eq.${parsedCondominiumId.data}`,
    {
      method: 'PATCH',
      headers: supabaseHeaders(c.env, c.get('token'), true),
      body: JSON.stringify(updates),
    },
  );
  const result = await response.json();
  if (isUnitCodeConflict(result)) {
    return c.json(
      {
        error: 'unit_code_conflict',
        publicMessage: 'Ya existe una unidad con ese código en este condominio.',
      },
      409,
    );
  }
  if (!response.ok && response.status === 403)
    return c.json({ error: 'Unit write forbidden' }, 403);
  if (response.ok && Array.isArray(result) && result.length === 0)
    return c.json({ error: 'Unit not found' }, 404);
  return c.json(result, response.ok ? 200 : 400);
});
