import { Hono } from 'hono';
import type { Context } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import {
  buildingInputSchema,
  condominiumInputSchema,
  organizationInputSchema,
  unitInputSchema,
  personInputSchema,
  ownerInputSchema,
  occupancyInputSchema,
  invitationInputSchema,
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
const list =
  (table: string, filter: string) =>
  async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
    const resolved = filter
      .replace(':unitId', uuidSchema.parse(c.req.param('unitId')))
      .replace(':id', uuidSchema.parse(c.req.param('id')));
    const r = await rest(c, `${table}?${resolved}&select=*`);
    const value = await r.json();
    return c.json(value, r.ok ? 200 : 400);
  };
app.get('/v1/condominiums/:id/people', list('people', 'condominium_id=eq.:id'));
app.post('/v1/condominiums/:id/people', async (c) => {
  const p = await body(c, personInputSchema);
  if (p instanceof Response) return p;
  const r = await rest(c, 'people', {
    method: 'POST',
    body: JSON.stringify({
      condominium_id: uuidSchema.parse(c.req.param('id')),
      first_name: p.firstName,
      last_name: p.lastName,
      email: p.email ?? null,
      phone: p.phone ?? null,
      status: p.status,
      created_by: c.get('userId'),
    }),
  });
  return c.json(await r.json(), r.ok ? 201 : 400);
});
app.get('/v1/condominiums/:id/people/:personId', async (c) => {
  const r = await rest(
    c,
    `people?id=eq.${uuidSchema.parse(c.req.param('personId'))}&condominium_id=eq.${uuidSchema.parse(c.req.param('id'))}&select=*`,
  );
  return c.json(await r.json(), r.ok ? 200 : 400);
});
app.patch('/v1/condominiums/:id/people/:personId', async (c) => {
  const p = await body(c, personInputSchema.partial());
  if (p instanceof Response) return p;
  const r = await rest(
    c,
    `people?id=eq.${uuidSchema.parse(c.req.param('personId'))}&condominium_id=eq.${uuidSchema.parse(c.req.param('id'))}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        first_name: p.firstName,
        last_name: p.lastName,
        email: p.email,
        phone: p.phone,
        status: p.status,
      }),
    },
  );
  return c.json(await r.json(), r.ok ? 200 : 400);
});
app.get('/v1/condominiums/:id/units/:unitId/owners', list('unit_owners', 'unit_id=eq.:unitId'));
app.post('/v1/condominiums/:id/units/:unitId/owners', async (c) => {
  const p = await body(c, ownerInputSchema);
  if (p instanceof Response) return p;
  const r = await rest(c, 'unit_owners', {
    method: 'POST',
    body: JSON.stringify({
      unit_id: uuidSchema.parse(c.req.param('unitId')),
      person_id: p.personId,
      ownership_percentage: p.ownershipPercentage ?? null,
      is_primary_contact: p.isPrimaryContact,
      starts_at: p.startsAt ?? undefined,
      created_by: c.get('userId'),
    }),
  });
  return c.json(await r.json(), r.ok ? 201 : 400);
});
app.get(
  '/v1/condominiums/:id/units/:unitId/occupancies',
  list('unit_occupancies', 'unit_id=eq.:unitId'),
);
app.post('/v1/condominiums/:id/units/:unitId/occupancies', async (c) => {
  const p = await body(c, occupancyInputSchema);
  if (p instanceof Response) return p;
  const r = await rest(c, 'unit_occupancies', {
    method: 'POST',
    body: JSON.stringify({
      unit_id: uuidSchema.parse(c.req.param('unitId')),
      person_id: p.personId,
      occupancy_type: p.occupancyType,
      is_primary_contact: p.isPrimaryContact,
      starts_at: p.startsAt ?? undefined,
      created_by: c.get('userId'),
    }),
  });
  return c.json(await r.json(), r.ok ? 201 : 400);
});
const assignmentPatchSchema = z.object({
  isPrimaryContact: z.boolean().optional(),
  ownershipPercentage: z.number().positive().max(100).optional(),
  endsAt: z.string().date().optional(),
});
async function patchAssignment(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  table: 'unit_owners' | 'unit_occupancies',
  owner: boolean,
) {
  const p = await body(c, assignmentPatchSchema);
  if (p instanceof Response) return p;
  const assignmentId = uuidSchema.parse(c.req.param('assignmentId'));
  const condominiumId = uuidSchema.parse(c.req.param('id'));
  const check = await rest(
    c,
    `${table}?id=eq.${assignmentId}&select=unit_id,starts_at,units!inner(condominium_id)`,
  );
  const rows = (await check.json()) as {
    unit_id: string;
    starts_at: string;
    units: { condominium_id: string };
  }[];
  if (!check.ok || !rows[0] || rows[0].units.condominium_id !== condominiumId)
    return c.json({ error: 'Assignment not found' }, 404);
  if (p.endsAt && p.endsAt < rows[0].starts_at)
    return c.json({ error: 'ends_at must not precede starts_at' }, 400);
  const r = await rest(c, `${table}?id=eq.${assignmentId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      is_primary_contact: p.isPrimaryContact,
      ends_at: p.endsAt,
      ...(owner ? { ownership_percentage: p.ownershipPercentage } : {}),
    }),
  });
  return c.json(await r.json(), r.ok ? 200 : 400);
}
app.patch('/v1/condominiums/:id/unit-owners/:assignmentId', (c) =>
  patchAssignment(c, 'unit_owners', true),
);
app.patch('/v1/condominiums/:id/unit-occupancies/:assignmentId', (c) =>
  patchAssignment(c, 'unit_occupancies', false),
);
app.post('/v1/condominiums/:id/invitations', async (c) => {
  const p = await body(c, invitationInputSchema);
  if (p instanceof Response) return p;
  const token = crypto.randomUUID().replaceAll('-', '');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const tokenHash = [...new Uint8Array(hash)].map((x) => x.toString(16).padStart(2, '0')).join('');
  const r = await rest(c, 'invitations', {
    method: 'POST',
    body: JSON.stringify({
      condominium_id: uuidSchema.parse(c.req.param('id')),
      person_id: p.personId,
      unit_id: p.unitId ?? null,
      email: p.email,
      intended_role: p.intendedRole,
      token_hash: tokenHash,
      expires_at: p.expiresAt ?? new Date(Date.now() + 604800000).toISOString(),
      invited_by: c.get('userId'),
    }),
  });
  const result = await r.json();
  return c.json(
    {
      invitation: result,
      developmentUrl: c.env.SUPABASE_URL.includes('localhost') ? `/invite/${token}` : undefined,
    },
    r.ok ? 201 : 400,
  );
});
app.post('/v1/invitations/:token/accept', async (c) => {
  const r = await fetch(`${c.env.SUPABASE_URL}/rest/v1/rpc/accept_invitation`, {
    method: 'POST',
    headers: {
      apikey: c.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${c.get('token')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw_token: c.req.param('token') }),
  });
  return c.json(await r.json(), r.ok ? 200 : 400);
});
app.post('/v1/condominiums/:id/people/import/preview', async (c) => {
  const { csv } = (await c.req.json()) as { csv: string };
  const [header, ...rows] = csv
    .trim()
    .split(/\r?\n/)
    .map((row) => row.split(',').map((cell) => cell.trim()));
  const expected = [
    'unit_code',
    'first_name',
    'last_name',
    'email',
    'phone',
    'relationship',
    'ownership_percentage',
  ];
  if (!header || expected.some((value, index) => header[index] !== value))
    return c.json({ error: 'Invalid CSV headers' }, 400);
  const units = (await (
    await rest(c, `units?condominium_id=eq.${uuidSchema.parse(c.req.param('id'))}&select=code`)
  ).json()) as { code: string }[];
  const known = new Set(units.map((unit) => unit.code));
  const seen = new Set<string>();
  const valid: unknown[] = [];
  const errors: unknown[] = [];
  rows.forEach((row, index) => {
    const email = row[3]?.toLowerCase();
    const issue = !known.has(row[0] ?? '')
      ? 'Unknown unit'
      : !row[1] || !row[2]
        ? 'Missing name'
        : email && seen.has(email)
          ? 'Duplicate email'
          : undefined;
    if (issue) errors.push({ row: index + 2, error: issue });
    else {
      if (email) seen.add(email);
      valid.push(row);
    }
  });
  return c.json({ valid, errors });
});
app.post('/v1/condominiums/:id/people/import/commit', async (c) => {
  const payload = (await c.req.json()) as { rows: unknown[]; idempotencyKey: string };
  if (!Array.isArray(payload.rows) || !payload.idempotencyKey)
    return c.json({ error: 'rows and idempotencyKey are required' }, 400);
  const r = await fetch(`${c.env.SUPABASE_URL}/rest/v1/rpc/import_people_csv`, {
    method: 'POST',
    headers: {
      apikey: c.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${c.get('token')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      target: uuidSchema.parse(c.req.param('id')),
      rows: payload.rows,
      key: payload.idempotencyKey,
    }),
  });
  return c.json(await r.json(), r.ok ? 200 : 400);
});
export default app;
