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
  uuidSchema,
} from '@habitta/validation';

type Bindings = { SUPABASE_URL: string; SUPABASE_ANON_KEY: string; PAYMENT_PROOFS: R2Bucket };
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
    payment_on: p.paymentDate,
    amount: p.originalAmount,
    currency: p.originalCurrencyCode,
    payer: p.payerName,
    reference_value: p.reference ?? null,
    notes_value: p.notes ?? null,
    key: p.idempotencyKey,
  });
  return c.json(await r.json(), r.ok ? 201 : 403);
});
app.get('/v1/condominiums/:id/payments/:paymentId', async (c) => {
  const r = await rest(
    c,
    `payments?id=eq.${uuidSchema.parse(c.req.param('paymentId'))}&condominium_id=eq.${uuidSchema.parse(c.req.param('id'))}&select=*`,
  );
  return c.json(await r.json(), r.ok ? 200 : 404);
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
    allocations: p.allocations.map(
      (a: {
        receivableItemId: string;
        paymentAmount: string;
        receivableAmount: string;
        paymentCurrencyCode: string;
        receivableCurrencyCode: string;
        receivablePerPaymentRate?: string;
        fxRateSource?: string;
        fxRateAt?: string;
      }) => ({
        receivable_item_id: a.receivableItemId,
        payment_amount: a.paymentAmount,
        receivable_amount: a.receivableAmount,
        payment_currency_code: a.paymentCurrencyCode,
        receivable_currency_code: a.receivableCurrencyCode,
        receivable_per_payment_rate: a.receivablePerPaymentRate ?? null,
        fx_rate_source: a.fxRateSource ?? null,
        fx_rate_at: a.fxRateAt ?? null,
      }),
    ),
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
  return c.json({
    allocations: p.allocations,
    warning: 'Review duplicate payment details before approval',
  });
});
app.get('/v1/condominiums/:id/payments/:paymentId/receipt', async (c) => {
  const r = await rest(
    c,
    `payment_receipts?payment_id=eq.${uuidSchema.parse(c.req.param('paymentId'))}&condominium_id=eq.${uuidSchema.parse(c.req.param('id'))}&select=*`,
  );
  return c.json(await r.json(), r.ok ? 200 : 404);
});
const safeName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'proof';
app.put('/v1/condominiums/:id/payments/:paymentId/proof', async (c) => {
  const type = c.req.header('Content-Type') ?? '';
  if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(type))
    return c.json({ error: 'Unsupported proof type' }, 415);
  const bytes = await c.req.raw.arrayBuffer();
  if (bytes.byteLength > 10485760) return c.json({ error: 'Proof exceeds 10 MB' }, 413);
  const id = uuidSchema.parse(c.req.param('id')),
    payment = uuidSchema.parse(c.req.param('paymentId')),
    hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join(''),
    key = `payments/${crypto.randomUUID()}`;
  await c.env.PAYMENT_PROOFS.put(key, bytes, { httpMetadata: { contentType: type } });
  const r = await rpc(c, 'record_payment_proof', {
    target: id,
    target_payment: payment,
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
    `payment_proofs?condominium_id=eq.${id}&payment_id=eq.${payment}&superseded_at=is.null&select=object_key,original_filename,content_type`,
  );
  const rows = (await r.json()) as {
    object_key: string;
    original_filename: string;
    content_type: string;
  }[];
  if (!r.ok || !rows[0]) return c.json({ error: 'Proof not found' }, 404);
  const object = await c.env.PAYMENT_PROOFS.get(rows[0].object_key);
  if (!object) return c.json({ error: 'Proof unavailable' }, 404);
  return new Response(object.body, {
    headers: {
      'Content-Type': rows[0].content_type,
      'Content-Disposition': `attachment; filename="${safeName(rows[0].original_filename)}"`,
    },
  });
});
export default app;
