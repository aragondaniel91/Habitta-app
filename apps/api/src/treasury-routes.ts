import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import type { NotificationBindings } from './notifications/types';

type Variables = { token: string; userId: string };
type TreasuryEnvironment = { Bindings: NotificationBindings; Variables: Variables };
type TreasuryContext = Context<TreasuryEnvironment>;

const uuid = z.string().uuid();
const currency = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/)
  .transform((value) => value.toUpperCase());
const amount = z
  .string()
  .trim()
  .regex(/^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$/)
  .refine((value) => Number(value) > 0, 'Amount must be greater than zero');
const optionalText = (maximum: number) => z.string().trim().max(maximum).optional();
const idempotencyKey = z.string().trim().min(8).max(160);

const accountSchema = z.object({
  name: z.string().trim().min(2).max(120),
  accountType: z.enum(['bank', 'cash']),
  currencyCode: currency,
  bankName: optionalText(120),
  accountReference: optionalText(120),
  notes: optionalText(1000),
});

const movementSchema = z.object({
  accountId: uuid,
  direction: z.enum(['credit', 'debit']),
  movementKind: z.enum(['opening_balance', 'deposit', 'withdrawal', 'fee', 'adjustment']),
  amount,
  occurredOn: z.string().date(),
  description: z.string().trim().min(2).max(500),
  reference: optionalText(160),
  sourceType: z.enum(['manual', 'opening_balance', 'payment', 'expense']).default('manual'),
  sourceId: uuid.optional(),
  idempotencyKey,
});

const transferSchema = z.object({
  fromAccountId: uuid,
  toAccountId: uuid,
  amount,
  occurredOn: z.string().date(),
  description: z.string().trim().min(2).max(500),
  reference: optionalText(160),
  idempotencyKey,
});

const reversalSchema = z.object({
  reason: z.string().trim().min(2).max(500),
  idempotencyKey,
});

const reconciliationSchema = z
  .object({
    accountId: uuid,
    periodStart: z.string().date(),
    periodEnd: z.string().date(),
    statementOpeningBalance: z
      .string()
      .trim()
      .regex(/^-?(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$/),
    statementClosingBalance: z
      .string()
      .trim()
      .regex(/^-?(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$/),
    notes: optionalText(2000),
  })
  .refine((value) => value.periodEnd >= value.periodStart, {
    path: ['periodEnd'],
    message: 'Period end must not precede period start',
  });

const body = async <T>(c: TreasuryContext, schema: z.ZodType<T>) => {
  const parsed = schema.safeParse(await c.req.json());
  return parsed.success ? parsed.data : c.json({ error: parsed.error.flatten() }, 400);
};

const rest = (c: TreasuryContext, path: string, init: RequestInit = {}) =>
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

const rpc = (c: TreasuryContext, name: string, payload: unknown) =>
  rest(c, `rpc/${name}`, { method: 'POST', body: JSON.stringify(payload) });

const responseJson = async (
  c: TreasuryContext,
  response: Response,
  successStatus: 200 | 201 = 200,
) => {
  const value = (await response.json()) as { code?: string; message?: string };
  if (response.ok) return c.json(value, successStatus);
  const status: 400 | 403 | 404 | 409 =
    response.status === 401 || response.status === 403 || value.code === '42501'
      ? 403
      : value.code === '23505'
        ? 409
        : response.status === 404
          ? 404
          : 400;
  return c.json(
    {
      error:
        status === 403
          ? 'Forbidden'
          : status === 404
            ? 'Not found'
            : status === 409
              ? 'Request conflict'
              : (value.message ?? 'Invalid treasury request'),
    },
    status,
  );
};

const cleanQueryText = (value: string | undefined) =>
  value ? encodeURIComponent(value.trim()) : undefined;

export const treasuryRoutes = new Hono<TreasuryEnvironment>();

treasuryRoutes.get('/:id/treasury/accounts', async (c) => {
  const response = await rpc(c, 'get_treasury_accounts', {
    target_condominium: uuid.parse(c.req.param('id')),
  });
  return responseJson(c, response);
});

treasuryRoutes.post('/:id/treasury/accounts', async (c) => {
  const parsed = await body(c, accountSchema);
  if (parsed instanceof Response) return parsed;
  const response = await rpc(c, 'create_treasury_account', {
    target_condominium: uuid.parse(c.req.param('id')),
    account_name: parsed.name,
    account_kind: parsed.accountType,
    account_currency: parsed.currencyCode,
    financial_institution: parsed.bankName ?? null,
    reference_value: parsed.accountReference ?? null,
    account_notes: parsed.notes ?? null,
  });
  return responseJson(c, response, 201);
});

treasuryRoutes.get('/:id/treasury/movements', async (c) => {
  const condominiumId = uuid.parse(c.req.param('id'));
  const accountId = c.req.query('accountId');
  const from = c.req.query('from');
  const to = c.req.query('to');
  if (accountId && !uuid.safeParse(accountId).success)
    return c.json({ error: 'Invalid account identifier' }, 400);
  if (from && !z.string().date().safeParse(from).success)
    return c.json({ error: 'Invalid start date' }, 400);
  if (to && !z.string().date().safeParse(to).success)
    return c.json({ error: 'Invalid end date' }, 400);

  const filters = [`condominium_id=eq.${condominiumId}`];
  if (accountId) filters.push(`account_id=eq.${accountId}`);
  if (from) filters.push(`occurred_on=gte.${cleanQueryText(from)}`);
  if (to) filters.push(`occurred_on=lte.${cleanQueryText(to)}`);
  const response = await rest(
    c,
    `treasury_movements?${filters.join('&')}&select=*&order=occurred_on.desc,created_at.desc,id.desc&limit=500`,
  );
  return responseJson(c, response);
});

treasuryRoutes.post('/:id/treasury/movements', async (c) => {
  const parsed = await body(c, movementSchema);
  if (parsed instanceof Response) return parsed;
  const response = await rpc(c, 'record_treasury_movement', {
    target_condominium: uuid.parse(c.req.param('id')),
    target_account: parsed.accountId,
    movement_direction: parsed.direction,
    movement_type: parsed.movementKind,
    movement_amount: parsed.amount,
    movement_date: parsed.occurredOn,
    movement_description: parsed.description,
    movement_reference: parsed.reference ?? null,
    movement_source: parsed.sourceType,
    source_record: parsed.sourceId ?? null,
    request_key: parsed.idempotencyKey,
  });
  return responseJson(c, response, 201);
});

treasuryRoutes.post('/:id/treasury/transfers', async (c) => {
  const parsed = await body(c, transferSchema);
  if (parsed instanceof Response) return parsed;
  const response = await rpc(c, 'create_treasury_transfer', {
    target_condominium: uuid.parse(c.req.param('id')),
    source_account: parsed.fromAccountId,
    destination_account: parsed.toAccountId,
    transfer_amount: parsed.amount,
    transfer_date: parsed.occurredOn,
    transfer_description: parsed.description,
    transfer_reference: parsed.reference ?? null,
    request_key: parsed.idempotencyKey,
  });
  return responseJson(c, response, 201);
});

treasuryRoutes.post('/:id/treasury/movements/:movementId/reverse', async (c) => {
  const parsed = await body(c, reversalSchema);
  if (parsed instanceof Response) return parsed;
  const response = await rpc(c, 'reverse_treasury_movement', {
    target_condominium: uuid.parse(c.req.param('id')),
    target_movement: uuid.parse(c.req.param('movementId')),
    reversal_reason: parsed.reason,
    request_key: parsed.idempotencyKey,
  });
  return responseJson(c, response, 201);
});

treasuryRoutes.get('/:id/treasury/reconciliations', async (c) => {
  const condominiumId = uuid.parse(c.req.param('id'));
  const accountId = c.req.query('accountId');
  if (accountId && !uuid.safeParse(accountId).success)
    return c.json({ error: 'Invalid account identifier' }, 400);
  const filters = [`condominium_id=eq.${condominiumId}`];
  if (accountId) filters.push(`account_id=eq.${accountId}`);
  const response = await rest(
    c,
    `treasury_reconciliations?${filters.join('&')}&select=*&order=period_end.desc,created_at.desc`,
  );
  return responseJson(c, response);
});

treasuryRoutes.post('/:id/treasury/reconciliations', async (c) => {
  const parsed = await body(c, reconciliationSchema);
  if (parsed instanceof Response) return parsed;
  const response = await rpc(c, 'create_treasury_reconciliation', {
    target_condominium: uuid.parse(c.req.param('id')),
    target_account: parsed.accountId,
    starts_on: parsed.periodStart,
    ends_on: parsed.periodEnd,
    statement_opening: parsed.statementOpeningBalance,
    statement_closing: parsed.statementClosingBalance,
    reconciliation_notes: parsed.notes ?? null,
  });
  return responseJson(c, response, 201);
});

treasuryRoutes.post('/:id/treasury/reconciliations/:reconciliationId/movements', async (c) => {
  const parsed = await body(c, z.object({ movementId: uuid }));
  if (parsed instanceof Response) return parsed;
  const response = await rpc(c, 'match_treasury_movement', {
    target_condominium: uuid.parse(c.req.param('id')),
    target_reconciliation: uuid.parse(c.req.param('reconciliationId')),
    target_movement: parsed.movementId,
  });
  return responseJson(c, response, 201);
});

treasuryRoutes.post('/:id/treasury/reconciliations/:reconciliationId/close', async (c) => {
  const response = await rpc(c, 'close_treasury_reconciliation', {
    target_condominium: uuid.parse(c.req.param('id')),
    target_reconciliation: uuid.parse(c.req.param('reconciliationId')),
  });
  return responseJson(c, response);
});
