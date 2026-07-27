import { Hono } from 'hono';
import type { Context } from 'hono';
import { cors } from 'hono/cors';
import {
  buildingInputSchema,
  condominiumInputSchema,
  invitationInputSchema,
  occupancyInputSchema,
  organizationInputSchema,
  ownerInputSchema,
  personInputSchema,
  unitInputSchema,
  uuidSchema,
} from '@habitta/validation';

type Bindings = { SUPABASE_URL: string; SUPABASE_ANON_KEY: string };
type Variables = { token: string; userId: string };
type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;

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

app.use('/v1/*', async (c, next) => {
  const authorization = c.req.header('Authorization');
  if (!authorization?.startsWith('Bearer ')) return c.json({ error: 'Unauthorized' }, 401);

  const token = authorization.slice('Bearer '.length);
  if (!token) return c.json({ error: 'Unauthorized' }, 401);

  const response = await fetch(`${c.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: c.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return c.json({ error: 'Unauthorized' }, 401);

  c.set('token', token);
  c.set('userId', ((await response.json()) as { id: string }).id);
  await next();
});

const rest = (c: AppContext, path: string, init: RequestInit = {}) =>
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
const body = async (c: any, schema: any) => {
  const parsed = schema.safeParse(await c.req.json());
  return parsed.success ? parsed.data : c.json({ error: parsed.error.flatten() }, 400);
};

const list =
  (table: string, filter: string) =>
  async (c: AppContext) => {
    const condominiumId = c.req.param('id');
    const unitId = c.req.param('unitId');
    const resolvedFilter = filter
      .replace(':id', condominiumId ? uuidSchema.parse(condominiumId) : '')
      .replace(':unitId', unitId ? uuidSchema.parse(unitId) : '');
    const response = await rest(c, `${table}?${resolvedFilter}&select=*`);
    const value = await response.json();
    return c.json(value, response.ok ? 200 : 400);
  };

app.get('/v1/organizations', async (c) => {
  const response = await rest(c, 'organizations?select=*&order=created_at');
  return c.json(await response.json(), response.ok ? 200 : 400);
});

app.post('/v1/organizations', async (c) => {
  const parsed = await body(c, organizationInputSchema);
  if (parsed instanceof Response) return parsed;

  const response = await fetch(
    `${c.env.SUPABASE_URL}/rest/v1/rpc/create_organization_with_condominium`,
    {
      method: 'POST',
      headers: {
        apikey: c.env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${c.get('token')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        organization_name: parsed.name,
        condominium_name: parsed.condominiumName ?? null,
      }),
    },
  );
  return c.json(await response.json(), response.ok ? 201 : 400);
});

app.get('/v1/condominiums', async (c) => {
  const response = await rest(c, 'condominiums?select=*&order=name');
  return c.json(await response.json(), response.ok ? 200 : 400);
});

app.post('/v1/condominiums', async (c) => {
  const parsed = await body(c, condominiumInputSchema);
  if (parsed instanceof Response) return parsed;

  const response = await fetch(`${c.env.SUPABASE_URL}/rest/v1/rpc/create_condominium`, {
    method: 'POST',
    headers: {
      apikey: c.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${c.get('token')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      target_organization_id: parsed.organizationId,
      condominium_name: parsed.name,
    }),
  });
  return c.json(await response.json(), response.ok ? 201 : 400);
});

app.get('/v1/condominiums/:id', async (c) => {
  const response = await rest(
    c,
    `condominiums?id=eq.${uuidSchema.parse(c.req.param('id'))}&select=*`,
  );
  return c.json(await response.json(), response.ok ? 200 : 400);
});

app.get('/v1/condominiums/:id/buildings', async (c) => {
  const response = await rest(
    c,
    `buildings?condominium_id=eq.${uuidSchema.parse(c.req.param('id'))}&select=*&order=name`,
  );
  return c.json(await response.json(), response.ok ? 200 : 400);
});

app.post('/v1/condominiums/:id/buildings', async (c) => {
  const parsed = await body(c, buildingInputSchema);
  if (parsed instanceof Response) return parsed;

  const response = await rest(c, 'buildings', {
    method: 'POST',
    body: JSON.stringify({
      condominium_id: uuidSchema.parse(c.req.param('id')),
      name: parsed.name,
      created_by: c.get('userId'),
    }),
  });
  return c.json(await response.json(), response.ok ? 201 : 400);
});

app.get('/v1/condominiums/:id/units', async (c) => {
  const response = await rest(
    c,
    `units?condominium_id=eq.${uuidSchema.parse(c.req.param('id'))}&select=*&order=code`,
  );
  return c.json(await response.json(), response.ok ? 200 : 400);
});

app.post('/v1/condominiums/:id/units', async (c) => {
  const parsed = await body(c, unitInputSchema);
  if (parsed instanceof Response) return parsed;

  const response = await rest(c, 'units', {
    method: 'POST',
    body: JSON.stringify({
      condominium_id: uuidSchema.parse(c.req.param('id')),
      building_id: parsed.buildingId ?? null,
      code: parsed.code,
      type: parsed.type,
      floor: parsed.floor ?? null,
      ownership_percentage: parsed.ownershipPercentage ?? null,
      status: parsed.status,
      created_by: c.get('userId'),
    }),
  });
  return c.json(await response.json(), response.ok ? 201 : 400);
});

app.get('/v1/condominiums/:id/people', list('people', 'condominium_id=eq.:id'));

app.post('/v1/condominiums/:id/people', async (c) => {
  const parsed = await body(c, personInputSchema);
  if (parsed instanceof Response) return parsed;

  const response = await rest(c, 'people', {
    method: 'POST',
    body: JSON.stringify({
      condominium_id: uuidSchema.parse(c.req.param('id')),
      first_name: parsed.firstName,
      last_name: parsed.lastName,
      document_type: parsed.documentType ?? null,
      document_number: parsed.documentNumber ?? null,
      email: parsed.email ?? null,
      phone: parsed.phone ?? null,
      status: parsed.status,
      created_by: c.get('userId'),
    }),
  });
  return c.json(await response.json(), response.ok ? 201 : 400);
});

app.get('/v1/condominiums/:id/people/:personId', async (c) => {
  const response = await rest(
    c,
    `people?id=eq.${uuidSchema.parse(c.req.param('personId'))}&condominium_id=eq.${uuidSchema.parse(c.req.param('id'))}&select=*`,
  );
  return c.json(await response.json(), response.ok ? 200 : 400);
});

app.patch('/v1/condominiums/:id/people/:personId', async (c) => {
  const parsed = await body(c, personInputSchema.partial());
  if (parsed instanceof Response) return parsed;

  const response = await rest(
    c,
    `people?id=eq.${uuidSchema.parse(c.req.param('personId'))}&condominium_id=eq.${uuidSchema.parse(c.req.param('id'))}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        first_name: parsed.firstName,
        last_name: parsed.lastName,
        document_type: parsed.documentType,
        document_number: parsed.documentNumber,
        email: parsed.email,
        phone: parsed.phone,
        status: parsed.status,
      }),
    },
  );
  return c.json(await response.json(), response.ok ? 200 : 400);
});

app.get(
  '/v1/condominiums/:id/units/:unitId/owners',
  list('unit_owners', 'unit_id=eq.:unitId'),
);

app.post('/v1/condominiums/:id/units/:unitId/owners', async (c) => {
  const parsed = await body(c, ownerInputSchema);
  if (parsed instanceof Response) return parsed;

  const response = await rest(c, 'unit_owners', {
    method: 'POST',
    body: JSON.stringify({
      unit_id: uuidSchema.parse(c.req.param('unitId')),
      person_id: parsed.personId,
      ownership_percentage: parsed.ownershipPercentage ?? null,
      is_primary_contact: parsed.isPrimaryContact,
      starts_at: parsed.startsAt ?? undefined,
      created_by: c.get('userId'),
    }),
  });
  return c.json(await response.json(), response.ok ? 201 : 400);
});

app.get(
  '/v1/condominiums/:id/units/:unitId/occupancies',
  list('unit_occupancies', 'unit_id=eq.:unitId'),
);

app.post('/v1/condominiums/:id/units/:unitId/occupancies', async (c) => {
  const parsed = await body(c, occupancyInputSchema);
  if (parsed instanceof Response) return parsed;

  const response = await rest(c, 'unit_occupancies', {
    method: 'POST',
    body: JSON.stringify({
      unit_id: uuidSchema.parse(c.req.param('unitId')),
      person_id: parsed.personId,
      occupancy_type: parsed.occupancyType,
      is_primary_contact: parsed.isPrimaryContact,
      starts_at: parsed.startsAt ?? undefined,
      ends_at: parsed.endsAt ?? undefined,
      created_by: c.get('userId'),
    }),
  });
  return c.json(await response.json(), response.ok ? 201 : 400);
});

app.post('/v1/condominiums/:id/invitations', async (c) => {
  const parsed = await body(c, invitationInputSchema);
  if (parsed instanceof Response) return parsed;

  const token = crypto.randomUUID().replaceAll('-', '');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const tokenHash = [...new Uint8Array(hash)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');

  const response = await rest(c, 'invitations', {
    method: 'POST',
    body: JSON.stringify({
      condominium_id: uuidSchema.parse(c.req.param('id')),
      person_id: parsed.personId,
      unit_id: parsed.unitId ?? null,
      email: parsed.email,
      intended_role: parsed.intendedRole,
      token_hash: tokenHash,
      expires_at: parsed.expiresAt ?? new Date(Date.now() + 604800000).toISOString(),
      invited_by: c.get('userId'),
    }),
  });
  const result = await response.json();
  return c.json(
    {
      invitation: result,
      developmentUrl: c.env.SUPABASE_URL.includes('localhost') ? `/invite/${token}` : undefined,
    },
    response.ok ? 201 : 400,
  );
});

app.post('/v1/invitations/:token/accept', async (c) => {
  const response = await fetch(`${c.env.SUPABASE_URL}/rest/v1/rpc/accept_invitation`, {
    method: 'POST',
    headers: {
      apikey: c.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${c.get('token')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw_token: c.req.param('token') }),
  });
  return c.json(await response.json(), response.ok ? 200 : 400);
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

  const unitsResponse = await rest(
    c,
    `units?condominium_id=eq.${uuidSchema.parse(c.req.param('id'))}&select=code`,
  );
  if (!unitsResponse.ok) return c.json({ error: 'Unable to validate units' }, 400);

  const units = (await unitsResponse.json()) as { code: string }[];
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

app.post('/v1/condominiums/:id/people/import/commit', async (c) =>
  c.json({ error: 'Use validated preview rows to commit imports' }, 501),
);

export default app;
