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
  chargeConceptSchema,
  receivableSchema,
  batchSchema,
  openingBalancesSchema,
  reverseReceivableSchema,
  paymentMethodSchema,
  paymentDraftSchema,
  paymentUpdateSchema,
  paymentReasonSchema,
  approvePaymentSchema,
  notificationPreferencesSchema,
  notificationSettingsSchema,
  serviceRequestCategoryInputSchema,
  serviceRequestCategoryUpdateSchema,
  serviceRequestCreateSchema,
  serviceRequestUpdateSchema,
  serviceRequestCommentSchema,
  serviceRequestCancelSchema,
  serviceRequestListQuerySchema,
  announcementCreateSchema,
  announcementUpdateSchema,
  announcementListQuerySchema,
  announcementScheduleSchema,
  announcementActionSchema,
  uuidSchema,
} from '@habitta/validation';
import { consumeNotificationQueue, runScheduled } from './notifications/worker';
import type { NotificationBindings, NotificationQueueMessage } from './notifications/types';

type Bindings = NotificationBindings;
type Variables = { token: string; userId: string };
export const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
export const allowedCorsOrigins = (raw?: string) =>
  new Set(
    ['http://localhost:5173', ...(raw ?? '').split(',')]
      .map((origin) => origin.trim())
      .filter(Boolean)
      .flatMap((origin) => {
        try {
          return [new URL(origin).origin];
        } catch {
          return [];
        }
      }),
  );
app.onError((error, c) =>
  c.json(
    { error: error.name === 'ZodError' ? 'Invalid identifier' : 'Request failed' },
    error.name === 'ZodError' ? 400 : 500,
  ),
);
app.use(
  '*',
  cors({
    origin: (origin, c) =>
      allowedCorsOrigins(c.env?.CORS_ALLOWED_ORIGINS).has(origin) ? origin : undefined,
    allowHeaders: ['Authorization', 'Content-Type', 'X-Filename'],
  }),
);
app.get('/health', (c) =>
  c.json({
    status: 'ok' as const,
    environment: c.env?.APP_ENV ?? 'development',
    commit: c.env?.BUILD_COMMIT ?? 'unknown',
    version: c.env?.APP_VERSION ?? 'unknown',
    buildTimestamp: c.env?.BUILD_TIMESTAMP ?? 'unknown',
    notificationsEmailMode: c.env?.NOTIFICATIONS_EMAIL_MODE ?? 'disabled',
  }),
);
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
const financeList =
  (table: string, order = 'created_at.desc') =>
  async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
    const id = uuidSchema.parse(c.req.param('id'));
    const r = await rest(c, `${table}?condominium_id=eq.${id}&select=*&order=${order}`);
    return c.json(await r.json(), r.ok ? 200 : 400);
  };
app.get('/v1/condominiums/:id/charge-concepts', financeList('charge_concepts'));
app.post('/v1/condominiums/:id/charge-concepts', async (c) => {
  const p = await body(c, chargeConceptSchema);
  if (p instanceof Response) return p;
  const r = await rest(c, 'charge_concepts', {
    method: 'POST',
    body: JSON.stringify({
      condominium_id: uuidSchema.parse(c.req.param('id')),
      code: p.code,
      name: p.name,
      description: p.description,
      category: p.category,
      default_currency_code: p.defaultCurrencyCode,
      default_amount: p.defaultAmount,
      is_active: p.isActive ?? true,
      created_by: c.get('userId'),
    }),
  });
  return c.json(await r.json(), r.ok ? 201 : 403);
});
app.patch('/v1/condominiums/:id/charge-concepts/:conceptId', async (c) => {
  const p = await body(c, chargeConceptSchema.partial());
  if (p instanceof Response) return p;
  const r = await rest(
    c,
    `charge_concepts?id=eq.${uuidSchema.parse(c.req.param('conceptId'))}&condominium_id=eq.${uuidSchema.parse(c.req.param('id'))}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        code: p.code,
        name: p.name,
        description: p.description,
        category: p.category,
        default_currency_code: p.defaultCurrencyCode,
        default_amount: p.defaultAmount,
        is_active: p.isActive,
      }),
    },
  );
  return c.json(await r.json(), r.ok ? 200 : 403);
});
app.get('/v1/condominiums/:id/receivables', financeList('receivable_balances', 'issue_date.desc'));
app.post('/v1/condominiums/:id/receivables', async (c) => {
  const p = await body(c, receivableSchema);
  if (p instanceof Response) return p;
  const r = await rest(c, 'rpc/create_receivable_item', {
    method: 'POST',
    body: JSON.stringify({
      target: uuidSchema.parse(c.req.param('id')),
      target_unit: p.unitId,
      target_concept: p.conceptId ?? null,
      item_description: p.description,
      item_amount: p.amount,
      item_currency: p.currencyCode,
      item_issue: p.issueDate,
      item_due: p.dueDate ?? null,
    }),
  });
  return c.json(await r.json(), r.ok ? 201 : 403);
});
app.post('/v1/condominiums/:id/receivables/:receivableId/reverse', async (c) => {
  const p = await body(c, reverseReceivableSchema);
  if (p instanceof Response) return p;
  const r = await rest(c, 'rpc/reverse_receivable_item', {
    method: 'POST',
    body: JSON.stringify({
      target: uuidSchema.parse(c.req.param('id')),
      target_item: uuidSchema.parse(c.req.param('receivableId')),
      reason: p.reason,
    }),
  });
  return c.json(await r.json(), r.ok ? 200 : 403);
});
app.get('/v1/condominiums/:id/charge-batches', financeList('charge_batches'));
app.post('/v1/condominiums/:id/charge-batches/preview', async (c) => {
  const p = await body(c, batchSchema);
  if (p instanceof Response) return p;
  const r = await rest(c, 'rpc/preview_charge_batch', {
    method: 'POST',
    body: JSON.stringify({
      target: uuidSchema.parse(c.req.param('id')),
      target_concept: p.conceptId,
      batch_currency: p.currencyCode,
      issue_on: p.issueDate,
      due_on: p.dueDate,
      method: p.distributionMethod,
      rows: p.rows.map((x: { unitId: string; amount?: string }) => ({
        unit_id: x.unitId,
        amount: x.amount,
      })),
      fixed_amount: p.fixedAmount ?? null,
    }),
  });
  return c.json(await r.json(), r.ok ? 200 : 400);
});
app.post('/v1/condominiums/:id/charge-batches/commit', async (c) => {
  const p = await body(c, batchSchema);
  if (p instanceof Response) return p;
  const r = await rest(c, 'rpc/post_charge_batch', {
    method: 'POST',
    body: JSON.stringify({
      target: uuidSchema.parse(c.req.param('id')),
      target_concept: p.conceptId,
      batch_name: p.name,
      batch_currency: p.currencyCode,
      issue_on: p.issueDate,
      due_on: p.dueDate,
      method: p.distributionMethod,
      rows: p.rows.map((x: { unitId: string; amount?: string }) => ({
        unit_id: x.unitId,
        amount: x.amount,
      })),
      key: p.idempotencyKey,
      fixed_amount: p.fixedAmount ?? null,
    }),
  });
  return c.json(await r.json(), r.ok ? 201 : 403);
});
app.post('/v1/condominiums/:id/opening-balances/preview', async (c) => {
  const p = await body(c, openingBalancesSchema);
  if (p instanceof Response) return p;
  const r = await rest(c, 'rpc/preview_opening_balances', {
    method: 'POST',
    body: JSON.stringify({ target: uuidSchema.parse(c.req.param('id')), rows: p.rows }),
  });
  return c.json(await r.json(), r.ok ? 200 : 400);
});
app.post('/v1/condominiums/:id/opening-balances/commit', async (c) => {
  const p = await body(c, openingBalancesSchema);
  if (p instanceof Response) return p;
  const r = await rest(c, 'rpc/import_opening_balances', {
    method: 'POST',
    body: JSON.stringify({
      target: uuidSchema.parse(c.req.param('id')),
      rows: p.rows,
      key: p.idempotencyKey,
      import_filename: p.filename ?? null,
    }),
  });
  return c.json(await r.json(), r.ok ? 201 : 403);
});
app.get('/v1/condominiums/:id/units/:unitId/statement', async (c) => {
  const id = uuidSchema.parse(c.req.param('id')),
    unit = uuidSchema.parse(c.req.param('unitId'));
  const r = await rest(c, 'rpc/get_unit_statement', {
    method: 'POST',
    body: JSON.stringify({ target: id, target_unit: unit }),
  });
  return c.json(await r.json(), r.ok ? 200 : 400);
});
app.get('/v1/condominiums/:id/receivables/summary', async (c) => {
  const r = await rest(c, 'rpc/get_receivables_summary', {
    method: 'POST',
    body: JSON.stringify({ target: uuidSchema.parse(c.req.param('id')) }),
  });
  return c.json(await r.json(), r.ok ? 200 : 403);
});
app.get('/v1/condominiums/:id/receivables/aging', async (c) => {
  const r = await rest(c, 'rpc/get_receivables_aging', {
    method: 'POST',
    body: JSON.stringify({ target: uuidSchema.parse(c.req.param('id')) }),
  });
  return c.json(await r.json(), r.ok ? 200 : 403);
});
app.get('/v1/condominiums/:id/receivables/:receivableId', async (c) => {
  const r = await rest(
    c,
    `receivable_balances?id=eq.${uuidSchema.parse(c.req.param('receivableId'))}&condominium_id=eq.${uuidSchema.parse(c.req.param('id'))}&select=*`,
  );
  return c.json(await r.json(), r.ok ? 200 : 400);
});
const rpc = (
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  name: string,
  payload: unknown,
) => rest(c, `rpc/${name}`, { method: 'POST', body: JSON.stringify(payload) });
const rpcAllocations = (
  allocations: {
    receivableItemId: string;
    paymentAmount: string;
    receivableAmount: string;
    paymentCurrencyCode: string;
    receivableCurrencyCode: string;
    receivablePerPaymentRate?: string;
    fxRateSource?: string;
    fxRateAt?: string;
  }[],
) =>
  allocations.map((allocation) => ({
    receivable_item_id: allocation.receivableItemId,
    payment_amount: allocation.paymentAmount,
    receivable_amount: allocation.receivableAmount,
    payment_currency_code: allocation.paymentCurrencyCode,
    receivable_currency_code: allocation.receivableCurrencyCode,
    receivable_per_payment_rate: allocation.receivablePerPaymentRate ?? null,
    fx_rate_source: allocation.fxRateSource ?? null,
    fx_rate_at: allocation.fxRateAt ?? null,
  }));
const responseJson = async (
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  response: Response,
  successStatus: 200 | 201 = 200,
  failureStatus: 400 | 403 | 404 | 409 = 409,
) => {
  const value = (await response.json()) as { code?: string };
  if (response.ok) return c.json(value, successStatus);
  const status: 400 | 403 | 404 | 409 =
    response.status === 401 || response.status === 403 || value.code === '42501'
      ? 403
      : value.code === '23505'
        ? 409
        : failureStatus;
  return c.json({ error: status === 403 ? 'Forbidden' : 'Request conflict' }, status);
};

app.get('/v1/condominiums/:id/announcements', async (c) => {
  const query = announcementListQuerySchema.safeParse({
    status: c.req.query('status') || undefined,
    priority: c.req.query('priority') || undefined,
    audience: c.req.query('audience') || undefined,
  });
  if (!query.success) return c.json({ error: query.error.flatten() }, 400);
  const id = uuidSchema.parse(c.req.param('id'));
  const filters = [
    `condominium_id=eq.${id}`,
    query.data.status ? `status=eq.${query.data.status}` : '',
    query.data.priority ? `priority=eq.${query.data.priority}` : '',
    query.data.audience ? `audience=eq.${query.data.audience}` : '',
  ].filter(Boolean);
  const r = await rest(c, `announcements?${filters.join('&')}&select=*&order=updated_at.desc`);
  return c.json(await r.json(), r.ok ? 200 : 403);
});
app.post('/v1/condominiums/:id/announcements', async (c) => {
  const p = await body(c, announcementCreateSchema);
  if (p instanceof Response) return p;
  const r = await rpc(c, 'create_announcement', {
    target_condominium: uuidSchema.parse(c.req.param('id')),
    announcement_title: p.title,
    announcement_summary: p.summary,
    announcement_body: p.body,
    announcement_priority: p.priority,
    announcement_audience: p.audience,
    target_building: p.buildingId ?? null,
    target_unit: p.unitId ?? null,
    acknowledgement_required: p.requiresAcknowledgement,
    expires_on: p.expiresAt ?? null,
  });
  return responseJson(c, r, 201, 409);
});
app.get('/v1/condominiums/:id/announcements/:announcementId', async (c) => {
  const id = uuidSchema.parse(c.req.param('id'));
  const announcementId = uuidSchema.parse(c.req.param('announcementId'));
  const r = await rest(c, `announcements?id=eq.${announcementId}&condominium_id=eq.${id}&select=*`);
  if (!r.ok) return c.json({ error: 'Announcement failed' }, r.status === 403 ? 403 : 404);
  const rows = (await r.json()) as unknown[];
  return rows.length ? c.json(rows[0]) : c.json({ error: 'Announcement not found' }, 404);
});
app.patch('/v1/condominiums/:id/announcements/:announcementId', async (c) => {
  const p = await body(c, announcementUpdateSchema);
  if (p instanceof Response) return p;
  const r = await rpc(c, 'update_announcement', {
    target_condominium: uuidSchema.parse(c.req.param('id')),
    target_announcement: uuidSchema.parse(c.req.param('announcementId')),
    next_title: p.title ?? null,
    next_summary: p.summary ?? null,
    next_body: p.body ?? null,
    next_priority: p.priority ?? null,
    next_audience: p.audience ?? null,
    target_building: p.buildingId ?? null,
    target_unit: p.unitId ?? null,
    next_requires_acknowledgement: p.requiresAcknowledgement ?? null,
    expires_on: p.expiresAt ?? null,
    clear_expires: p.clearExpires ?? false,
    expected_version: p.expectedVersion ?? null,
  });
  return responseJson(c, r, 200, 409);
});
app.post('/v1/condominiums/:id/announcements/:announcementId/schedule', async (c) => {
  const p = await body(c, announcementScheduleSchema);
  if (p instanceof Response) return p;
  const r = await rpc(c, 'schedule_announcement', {
    target_condominium: uuidSchema.parse(c.req.param('id')),
    target_announcement: uuidSchema.parse(c.req.param('announcementId')),
    publish_on: p.publishAt,
    expected_version: p.expectedVersion ?? null,
  });
  return responseJson(c, r, 200, 409);
});
app.post('/v1/condominiums/:id/announcements/:announcementId/unschedule', async (c) => {
  const p = await body(c, announcementActionSchema);
  if (p instanceof Response) return p;
  const r = await rpc(c, 'unschedule_announcement', {
    target_condominium: uuidSchema.parse(c.req.param('id')),
    target_announcement: uuidSchema.parse(c.req.param('announcementId')),
    expected_version: p.expectedVersion ?? null,
  });
  return responseJson(c, r, 200, 409);
});
app.post('/v1/condominiums/:id/announcements/:announcementId/publish', async (c) => {
  const p = await body(c, announcementActionSchema);
  if (p instanceof Response) return p;
  const r = await rpc(c, 'publish_announcement', {
    target_condominium: uuidSchema.parse(c.req.param('id')),
    target_announcement: uuidSchema.parse(c.req.param('announcementId')),
    expected_version: p.expectedVersion ?? null,
  });
  return responseJson(c, r, 200, 409);
});
app.post('/v1/condominiums/:id/announcements/:announcementId/archive', async (c) => {
  const p = await body(c, announcementActionSchema);
  if (p instanceof Response) return p;
  const r = await rpc(c, 'archive_announcement', {
    target_condominium: uuidSchema.parse(c.req.param('id')),
    target_announcement: uuidSchema.parse(c.req.param('announcementId')),
    expected_version: p.expectedVersion ?? null,
  });
  return responseJson(c, r, 200, 409);
});
app.post('/v1/condominiums/:id/announcements/:announcementId/read', async (c) => {
  const r = await rpc(c, 'mark_announcement_read', {
    target_condominium: uuidSchema.parse(c.req.param('id')),
    target_announcement: uuidSchema.parse(c.req.param('announcementId')),
  });
  return responseJson(c, r, 200, 404);
});
app.post('/v1/condominiums/:id/announcements/:announcementId/acknowledge', async (c) => {
  const r = await rpc(c, 'acknowledge_announcement', {
    target_condominium: uuidSchema.parse(c.req.param('id')),
    target_announcement: uuidSchema.parse(c.req.param('announcementId')),
  });
  return responseJson(c, r, 200, 409);
});
app.get('/v1/condominiums/:id/announcements/:announcementId/recipients', async (c) => {
  const id = uuidSchema.parse(c.req.param('id'));
  const announcementId = uuidSchema.parse(c.req.param('announcementId'));
  const r = await rest(
    c,
    `announcement_recipients?condominium_id=eq.${id}&announcement_id=eq.${announcementId}&select=*&order=created_at.asc,user_id.asc`,
  );
  return c.json(await r.json(), r.ok ? 200 : 403);
});
app.get('/v1/condominiums/:id/announcements/:announcementId/events', async (c) => {
  const id = uuidSchema.parse(c.req.param('id'));
  const announcementId = uuidSchema.parse(c.req.param('announcementId'));
  const r = await rest(
    c,
    `announcement_events?condominium_id=eq.${id}&announcement_id=eq.${announcementId}&select=*&order=created_at.asc,id.asc`,
  );
  return c.json(await r.json(), r.ok ? 200 : 403);
});
app.get('/v1/condominiums/:id/announcements/:announcementId/attachments', async (c) => {
  const id = uuidSchema.parse(c.req.param('id'));
  const announcementId = uuidSchema.parse(c.req.param('announcementId'));
  const r = await rest(
    c,
    `announcement_attachments?condominium_id=eq.${id}&announcement_id=eq.${announcementId}&select=*&order=created_at.asc,id.asc`,
  );
  return c.json(await r.json(), r.ok ? 200 : 403);
});

app.get('/v1/condominiums/:id/request-categories', async (c) => {
  const id = uuidSchema.parse(c.req.param('id'));
  const r = await rest(
    c,
    `service_request_categories?condominium_id=eq.${id}&select=*&order=sort_order.asc,name.asc`,
  );
  return c.json(await r.json(), r.ok ? 200 : 403);
});
app.post('/v1/condominiums/:id/request-categories', async (c) => {
  const p = await body(c, serviceRequestCategoryInputSchema);
  if (p instanceof Response) return p;
  const r = await rest(c, 'service_request_categories', {
    method: 'POST',
    body: JSON.stringify({
      condominium_id: uuidSchema.parse(c.req.param('id')),
      code: p.code,
      name: p.name,
      description: p.description ?? null,
      sort_order: p.sortOrder,
      is_active: p.isActive,
      created_by: c.get('userId'),
    }),
  });
  return responseJson(c, r, 201, 409);
});
app.patch('/v1/condominiums/:id/request-categories/:categoryId', async (c) => {
  const p = await body(c, serviceRequestCategoryUpdateSchema);
  if (p instanceof Response) return p;
  const r = await rest(
    c,
    `service_request_categories?id=eq.${uuidSchema.parse(c.req.param('categoryId'))}&condominium_id=eq.${uuidSchema.parse(c.req.param('id'))}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        name: p.name,
        description: p.description,
        sort_order: p.sortOrder,
        is_active: p.isActive,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  return responseJson(c, r, 200, 409);
});
app.get('/v1/condominiums/:id/requests', async (c) => {
  const query = serviceRequestListQuerySchema.safeParse({
    status: c.req.query('status') || undefined,
    priority: c.req.query('priority') || undefined,
    unitId: c.req.query('unitId') || undefined,
    categoryId: c.req.query('categoryId') || undefined,
    assignedToUserId: c.req.query('assignedToUserId') || undefined,
  });
  if (!query.success) return c.json({ error: query.error.flatten() }, 400);
  const id = uuidSchema.parse(c.req.param('id'));
  const filters = [
    `condominium_id=eq.${id}`,
    query.data.status ? `status=eq.${query.data.status}` : '',
    query.data.priority ? `priority=eq.${query.data.priority}` : '',
    query.data.unitId ? `unit_id=eq.${query.data.unitId}` : '',
    query.data.categoryId ? `category_id=eq.${query.data.categoryId}` : '',
    query.data.assignedToUserId ? `assigned_to_user_id=eq.${query.data.assignedToUserId}` : '',
  ].filter(Boolean);
  const r = await rest(c, `service_requests?${filters.join('&')}&select=*&order=updated_at.desc`);
  return c.json(await r.json(), r.ok ? 200 : 403);
});
app.post('/v1/condominiums/:id/requests', async (c) => {
  const p = await body(c, serviceRequestCreateSchema);
  if (p instanceof Response) return p;
  const r = await rpc(c, 'create_service_request', {
    target_condominium: uuidSchema.parse(c.req.param('id')),
    target_unit: p.unitId ?? null,
    target_category: p.categoryId,
    request_title: p.title,
    request_description: p.description,
    request_priority: p.priority,
    target_requester: p.requesterPersonId ?? null,
  });
  return responseJson(c, r, 201, 409);
});
app.get('/v1/condominiums/:id/requests/:requestId', async (c) => {
  const r = await rest(
    c,
    `service_requests?id=eq.${uuidSchema.parse(c.req.param('requestId'))}&condominium_id=eq.${uuidSchema.parse(c.req.param('id'))}&select=*`,
  );
  if (!r.ok) return c.json({ error: 'Request failed' }, r.status === 403 ? 403 : 404);
  const rows = (await r.json()) as unknown[];
  return rows.length ? c.json(rows[0]) : c.json({ error: 'Service request not found' }, 404);
});
app.patch('/v1/condominiums/:id/requests/:requestId', async (c) => {
  const p = await body(c, serviceRequestUpdateSchema);
  if (p instanceof Response) return p;
  const r = await rpc(c, 'update_service_request', {
    target_condominium: uuidSchema.parse(c.req.param('id')),
    target_request: uuidSchema.parse(c.req.param('requestId')),
    next_status: p.status ?? null,
    next_priority: p.priority ?? null,
    target_category: p.categoryId ?? null,
    target_assignee: p.assignedToUserId ?? null,
    clear_assignee: p.clearAssignee ?? false,
    due_on: p.dueAt ?? null,
    clear_due: p.clearDue ?? false,
    resolution: p.resolution ?? null,
    expected_version: p.expectedVersion ?? null,
  });
  return responseJson(c, r, 200, 409);
});
app.post('/v1/condominiums/:id/requests/:requestId/cancel', async (c) => {
  const p = await body(c, serviceRequestCancelSchema);
  if (p instanceof Response) return p;
  const r = await rpc(c, 'cancel_service_request', {
    target_condominium: uuidSchema.parse(c.req.param('id')),
    target_request: uuidSchema.parse(c.req.param('requestId')),
    reason: p.reason,
  });
  return responseJson(c, r, 200, 409);
});
app.get('/v1/condominiums/:id/requests/:requestId/comments', async (c) => {
  const id = uuidSchema.parse(c.req.param('id'));
  const requestId = uuidSchema.parse(c.req.param('requestId'));
  const r = await rest(
    c,
    `service_request_comments?condominium_id=eq.${id}&request_id=eq.${requestId}&select=*&order=created_at.asc,id.asc`,
  );
  return c.json(await r.json(), r.ok ? 200 : 403);
});
app.post('/v1/condominiums/:id/requests/:requestId/comments', async (c) => {
  const p = await body(c, serviceRequestCommentSchema);
  if (p instanceof Response) return p;
  const r = await rpc(c, 'add_service_request_comment', {
    target_condominium: uuidSchema.parse(c.req.param('id')),
    target_request: uuidSchema.parse(c.req.param('requestId')),
    comment_body: p.body,
    comment_visibility: p.visibility,
  });
  return responseJson(c, r, 201, 409);
});
app.get('/v1/condominiums/:id/requests/:requestId/events', async (c) => {
  const id = uuidSchema.parse(c.req.param('id'));
  const requestId = uuidSchema.parse(c.req.param('requestId'));
  const r = await rest(
    c,
    `service_request_events?condominium_id=eq.${id}&request_id=eq.${requestId}&select=*&order=created_at.asc,id.asc`,
  );
  return c.json(await r.json(), r.ok ? 200 : 403);
});
app.get('/v1/condominiums/:id/requests/:requestId/attachments', async (c) => {
  const id = uuidSchema.parse(c.req.param('id'));
  const requestId = uuidSchema.parse(c.req.param('requestId'));
  const r = await rest(
    c,
    `service_request_attachments?condominium_id=eq.${id}&request_id=eq.${requestId}&select=*&order=created_at.asc,id.asc`,
  );
  return c.json(await r.json(), r.ok ? 200 : 403);
});
app.get(
  '/v1/condominiums/:id/payment-methods',
  financeList('condominium_payment_methods', 'display_name.asc'),
);
app.post('/v1/condominiums/:id/payment-methods', async (c) => {
  const p = await body(c, paymentMethodSchema);
  if (p instanceof Response) return p;
  const r = await rest(c, 'condominium_payment_methods', {
    method: 'POST',
    body: JSON.stringify({
      condominium_id: uuidSchema.parse(c.req.param('id')),
      method_type: p.methodType,
      display_name: p.displayName,
      currency_code: p.currencyCode,
      account_holder: p.accountHolder,
      bank_name: p.bankName,
      account_identifier_masked: p.accountIdentifierMasked,
      phone_masked: p.phoneMasked,
      email_masked: p.emailMasked,
      instructions: p.instructions,
      requires_reference: p.requiresReference ?? false,
      requires_proof: p.requiresProof ?? false,
      is_active: p.isActive ?? true,
      created_by: c.get('userId'),
    }),
  });
  return c.json(await r.json(), r.ok ? 201 : 403);
});
app.patch('/v1/condominiums/:id/payment-methods/:methodId', async (c) => {
  const p = await body(c, paymentMethodSchema.partial());
  if (p instanceof Response) return p;
  const r = await rest(
    c,
    `condominium_payment_methods?id=eq.${uuidSchema.parse(c.req.param('methodId'))}&condominium_id=eq.${uuidSchema.parse(c.req.param('id'))}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        method_type: p.methodType,
        display_name: p.displayName,
        currency_code: p.currencyCode,
        instructions: p.instructions,
        requires_reference: p.requiresReference,
        requires_proof: p.requiresProof,
        is_active: p.isActive,
      }),
    },
  );
  return c.json(await r.json(), r.ok ? 200 : 403);
});
app.get('/v1/condominiums/:id/payments/review-queue', async (c) => {
  const allowed = await rpc(c, 'can_review_payments', {
    target: uuidSchema.parse(c.req.param('id')),
  });
  if (!allowed.ok || (await allowed.json()) !== true) return c.json({ error: 'Forbidden' }, 403);
  const r = await rest(
    c,
    `payments?condominium_id=eq.${uuidSchema.parse(c.req.param('id'))}&status=in.(submitted,under_review)&select=*&order=submitted_at.asc`,
  );
  return c.json(await r.json(), r.ok ? 200 : 403);
});
app.get('/v1/condominiums/:id/payments', financeList('payments', 'created_at.desc'));
app.post('/v1/condominiums/:id/payments', async (c) => {
  const p = await body(c, paymentDraftSchema);
  if (p instanceof Response) return p;
  const r = await rpc(c, 'create_payment_draft', {
    target: uuidSchema.parse(c.req.param('id')),
    target_unit: p.unitId,
    target_method: p.paymentMethodId,
    submitted_for: p.submittedForPersonId ?? null,
    payment_on: p.paymentDate,
    amount: p.originalAmount,
    currency: p.originalCurrencyCode,
    payer: p.payerName,
    reference_value: p.reference ?? null,
    notes_value: p.notes ?? null,
    key: p.idempotencyKey,
  });
  return responseJson(c, r, 201, 409);
});
app.get('/v1/condominiums/:id/payments/:paymentId', async (c) => {
  const r = await rest(
    c,
    `payments?id=eq.${uuidSchema.parse(c.req.param('paymentId'))}&condominium_id=eq.${uuidSchema.parse(c.req.param('id'))}&select=*`,
  );
  if (!r.ok) return c.json({ error: 'Request failed' }, r.status === 403 ? 403 : 404);
  const rows = (await r.json()) as unknown[];
  return rows.length ? c.json(rows[0]) : c.json({ error: 'Payment not found' }, 404);
});
app.patch('/v1/condominiums/:id/payments/:paymentId', async (c) => {
  const p = await body(c, paymentUpdateSchema);
  if (p instanceof Response) return p;
  const r = await rpc(c, 'update_payment_draft', {
    target: uuidSchema.parse(c.req.param('id')),
    target_payment: uuidSchema.parse(c.req.param('paymentId')),
    target_method: p.paymentMethodId,
    payment_on: p.paymentDate,
    amount: p.originalAmount,
    currency: p.originalCurrencyCode,
    payer: p.payerName,
    reference_value: p.reference ?? null,
    notes_value: p.notes ?? null,
  });
  return c.json(await r.json(), r.ok ? 200 : 409);
});
app.post('/v1/condominiums/:id/payments/:paymentId/submit', async (c) => {
  const r = await rpc(c, 'submit_payment', {
    target: uuidSchema.parse(c.req.param('id')),
    target_payment: uuidSchema.parse(c.req.param('paymentId')),
  });
  return c.json(await r.json(), r.ok ? 200 : 409);
});
const paymentTransition =
  (state: 'under_review' | 'correction_requested' | 'rejected') =>
  async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
    const p = state === 'under_review' ? {} : await body(c, paymentReasonSchema);
    if (p instanceof Response) return p;
    const r = await rpc(c, 'payment_transition', {
      target: uuidSchema.parse(c.req.param('id')),
      target_payment: uuidSchema.parse(c.req.param('paymentId')),
      next_status: state,
      reason: 'reason' in p ? p.reason : null,
    });
    return c.json(await r.json(), r.ok ? 200 : 409);
  };
app.post(
  '/v1/condominiums/:id/payments/:paymentId/start-review',
  paymentTransition('under_review'),
);
app.post(
  '/v1/condominiums/:id/payments/:paymentId/request-correction',
  paymentTransition('correction_requested'),
);
app.post('/v1/condominiums/:id/payments/:paymentId/reject', paymentTransition('rejected'));
app.post('/v1/condominiums/:id/payments/:paymentId/approve', async (c) => {
  const p = await body(c, approvePaymentSchema);
  if (p instanceof Response) return p;
  const r = await rpc(c, 'approve_payment', {
    target: uuidSchema.parse(c.req.param('id')),
    target_payment: uuidSchema.parse(c.req.param('paymentId')),
    allocations: rpcAllocations(p.allocations),
  });
  return c.json(await r.json(), r.ok ? 200 : 409);
});
app.post('/v1/condominiums/:id/payments/:paymentId/reverse', async (c) => {
  const p = await body(c, paymentReasonSchema);
  if (p instanceof Response) return p;
  const r = await rpc(c, 'reverse_payment', {
    target: uuidSchema.parse(c.req.param('id')),
    target_payment: uuidSchema.parse(c.req.param('paymentId')),
    reason: p.reason,
  });
  return c.json(await r.json(), r.ok ? 200 : 409);
});
app.post('/v1/condominiums/:id/payments/:paymentId/allocation-preview', async (c) => {
  const p = await body(c, approvePaymentSchema);
  if (p instanceof Response) return p;
  const r = await rpc(c, 'preview_payment_allocation', {
    target: uuidSchema.parse(c.req.param('id')),
    target_payment: uuidSchema.parse(c.req.param('paymentId')),
    allocations: rpcAllocations(p.allocations),
  });
  return responseJson(c, r, 200, 409);
});
app.get('/v1/condominiums/:id/payments/:paymentId/receipt', async (c) => {
  const r = await rest(
    c,
    `payment_receipts?payment_id=eq.${uuidSchema.parse(c.req.param('paymentId'))}&condominium_id=eq.${uuidSchema.parse(c.req.param('id'))}&select=*`,
  );
  if (!r.ok) return c.json({ error: 'Request failed' }, r.status === 403 ? 403 : 404);
  const rows = (await r.json()) as unknown[];
  return rows.length ? c.json(rows[0]) : c.json({ error: 'Receipt not found' }, 404);
});
const safeName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'proof';
app.put('/v1/condominiums/:id/payments/:paymentId/proof', async (c) => {
  const type = c.req.header('Content-Type') ?? '';
  if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(type))
    return c.json({ error: 'Unsupported proof type' }, 415);
  const bytes = await c.req.raw.arrayBuffer();
  if (bytes.byteLength === 0) return c.json({ error: 'Proof is empty' }, 400);
  if (bytes.byteLength > 10485760) return c.json({ error: 'Proof exceeds 10 MB' }, 413);
  const id = uuidSchema.parse(c.req.param('id')),
    payment = uuidSchema.parse(c.req.param('paymentId')),
    hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join(''),
    proofId = crypto.randomUUID(),
    key = `payments/${proofId}`;
  const allowed = await rpc(c, 'can_upload_payment_proof', {
    target: id,
    target_payment: payment,
  });
  if (!allowed.ok || (await allowed.json()) !== true) return c.json({ error: 'Forbidden' }, 403);
  await c.env.PAYMENT_PROOFS.put(key, bytes, { httpMetadata: { contentType: type } });
  const r = await rpc(c, 'record_payment_proof', {
    target: id,
    target_payment: payment,
    target_proof: proofId,
    key_value: key,
    filename: safeName(c.req.header('X-Filename') ?? 'proof'),
    mime: type,
    bytes: bytes.byteLength,
    hash,
  });
  if (!r.ok) {
    await c.env.PAYMENT_PROOFS.delete(key);
    return c.json({ error: 'Proof metadata could not be saved' }, 403);
  }
  return c.json({ id: ((await r.json()) as { id: string }).id }, 201);
});
app.get('/v1/condominiums/:id/payments/:paymentId/proof', async (c) => {
  const id = uuidSchema.parse(c.req.param('id')),
    payment = uuidSchema.parse(c.req.param('paymentId'));
  const r = await rest(
    c,
    `payment_proofs?condominium_id=eq.${id}&payment_id=eq.${payment}&superseded_at=is.null&select=id,original_filename,content_type`,
  );
  const rows = (await r.json()) as {
    id: string;
    original_filename: string;
    content_type: string;
  }[];
  if (!r.ok || !rows[0]) return c.json({ error: 'Proof not found' }, 404);
  const object = await c.env.PAYMENT_PROOFS.get(`payments/${rows[0].id}`);
  if (!object) return c.json({ error: 'Proof unavailable' }, 404);
  return new Response(object.body, {
    headers: {
      'Content-Type': rows[0].content_type,
      'Content-Disposition': `attachment; filename="${safeName(rows[0].original_filename)}"`,
    },
  });
});

app.get('/v1/notifications', async (c) => {
  const condominiumId = c.req.query('condominiumId');
  const unreadOnly = c.req.query('unreadOnly') === 'true';
  const cursorAt = c.req.query('cursorAt') ?? null;
  if (condominiumId) uuidSchema.parse(condominiumId);
  const r = await rpc(c, 'get_my_notifications', {
    target_condominium: condominiumId ?? null,
    unread_only: unreadOnly,
    limit_count: c.req.query('limit') ?? '30',
    cursor_at: cursorAt,
  });
  return responseJson(c, r, 200, 403);
});
app.get('/v1/notifications/unread-count', async (c) => {
  const r = await rpc(c, 'get_my_unread_notification_count', {});
  return responseJson(c, r, 200, 403);
});
app.post('/v1/notifications/read-all', async (c) => {
  const condominiumId = c.req.query('condominiumId');
  if (condominiumId) uuidSchema.parse(condominiumId);
  const r = await rpc(c, 'mark_all_notifications_read', {
    target_condominium: condominiumId ?? null,
  });
  return responseJson(c, r, 200, 403);
});
app.post('/v1/notifications/:id/read', async (c) => {
  const r = await rpc(c, 'mark_notification_read', { target: uuidSchema.parse(c.req.param('id')) });
  return responseJson(c, r, 200, 404);
});
app.post('/v1/notifications/:id/archive', async (c) => {
  const r = await rpc(c, 'archive_notification', { target: uuidSchema.parse(c.req.param('id')) });
  return responseJson(c, r, 200, 404);
});
app.get('/v1/notification-preferences', async (c) => {
  const condominiumId = c.req.query('condominiumId');
  if (condominiumId) uuidSchema.parse(condominiumId);
  const r = await rpc(c, 'get_my_notification_preferences', {
    target_condominium: condominiumId ?? null,
  });
  return responseJson(c, r, 200, 403);
});
app.put('/v1/notification-preferences/:condominiumId', async (c) => {
  const p = await body(c, notificationPreferencesSchema);
  if (p instanceof Response) return p;
  const r = await rpc(c, 'update_my_notification_preferences', {
    target_condominium: uuidSchema.parse(c.req.param('condominiumId')),
    target_type: p.notificationType,
    target_email_enabled: p.emailEnabled,
    target_in_app_enabled: p.inAppEnabled,
  });
  return responseJson(c, r, 200, 403);
});
app.patch('/v1/notification-preferences', async (c) => {
  const parsed = notificationPreferencesSchema
    .extend({ condominiumId: uuidSchema })
    .safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const r = await rpc(c, 'update_my_notification_preferences', {
    target_condominium: parsed.data.condominiumId,
    target_type: parsed.data.notificationType,
    target_email_enabled: parsed.data.emailEnabled,
    target_in_app_enabled: parsed.data.inAppEnabled,
  });
  return responseJson(c, r, 200, 403);
});
app.get('/v1/condominiums/:id/notification-settings', async (c) => {
  const r = await rpc(c, 'get_condominium_notification_settings', {
    target_condominium: uuidSchema.parse(c.req.param('id')),
  });
  return responseJson(c, r, 200, 403);
});
app.put('/v1/condominiums/:id/notification-settings', async (c) => {
  const p = await body(c, notificationSettingsSchema);
  if (p instanceof Response) return p;
  const r = await rpc(c, 'update_condominium_notification_settings', {
    target_condominium: uuidSchema.parse(c.req.param('id')),
    target_email_enabled: p.emailEnabled,
    target_due_soon_enabled: p.dueSoonEnabled,
    target_due_soon_days: p.dueSoonDays,
    target_overdue_enabled: p.overdueEnabled,
    target_timezone: p.timezone,
  });
  return responseJson(c, r, 200, 403);
});
app.patch('/v1/condominiums/:id/notification-settings', async (c) => {
  const p = await body(c, notificationSettingsSchema);
  if (p instanceof Response) return p;
  const r = await rpc(c, 'update_condominium_notification_settings', {
    target_condominium: uuidSchema.parse(c.req.param('id')),
    target_email_enabled: p.emailEnabled,
    target_due_soon_enabled: p.dueSoonEnabled,
    target_due_soon_days: p.dueSoonDays,
    target_overdue_enabled: p.overdueEnabled,
    target_timezone: p.timezone,
  });
  return responseJson(c, r, 200, 403);
});
export default {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runScheduled(env));
  },
  async queue(batch, env) {
    await consumeNotificationQueue(batch, env);
  },
} satisfies ExportedHandler<Bindings, NotificationQueueMessage>;
