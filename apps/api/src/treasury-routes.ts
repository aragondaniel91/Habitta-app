import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import {
  treasuryAccountSchema,
  treasuryMatchSchema,
  treasuryMovementSchema,
  treasuryReconciliationSchema,
  treasuryReversalSchema,
  treasuryTransferSchema,
  uuidSchema,
} from '@habitta/validation';
import type { NotificationBindings } from './notifications/types';

type Variables = { token: string; userId: string };
type AppEnvironment = { Bindings: NotificationBindings; Variables: Variables };
type AppContext = Context<AppEnvironment>;

const body = async <T>(c: AppContext, schema: z.ZodType<T>) => {
  const parsed = schema.safeParse(await c.req.json());
  return parsed.success ? parsed.data : c.json({ error: parsed.error.flatten() }, 400);
};

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

const rpc = (c: AppContext, name: string, payload: unknown) =>
  rest(c, `rpc/${name}`, { method: 'POST', body: JSON.stringify(payload) });

const responseJson = async (c: AppContext, response: Response, successStatus: 200 | 201 = 200) => {
  const value = (await response.json()) as { code?: string; message?: string };
  if (response.ok) return c.json(value, successStatus);
  const denied =
    response.status === 401 ||
    response.status === 403 ||
    value.code === '42501' ||
    (value.code === 'P0001' && /denied/i.test(value.message ?? ''));
  const status: 400 | 403 | 404 | 409 = denied
    ? 403
    : value.code === '23505'
      ? 409
      : response.status === 404
        ? 404
        : 400;
  return c.json({ error: status === 403 ? 'Forbidden' : 'Request failed' }, status);
};

const condominiumId = (c: AppContext) => uuidSchema.parse(c.req.param('id'));
const financialAccountSelectionSchema = z.object({ accountId: uuidSchema });
const overdraftAuthorizationSchema = z.object({
  accountId: uuidSchema,
  amount: z.coerce.number().positive(),
  requestKey: z.string().trim().min(8).max(160),
  reason: z.string().trim().min(5).max(500),
  operation: z.enum(['movement', 'transfer']),
});

const listJson = async (c: AppContext, response: Response) => {
  const value = await response.json();
  if (response.ok) return c.json(value, 200);
  const code = (value as { code?: string }).code;
  const status = response.status === 401 || response.status === 403 || code === '42501' ? 403 : 400;
  return c.json({ error: status === 403 ? 'Forbidden' : 'Request failed' }, status);
};

export const treasuryRoutes = new Hono<AppEnvironment>();

treasuryRoutes.get('/:id/treasury/accounts', async (c) => {
  const response = await rpc(c, 'get_treasury_accounts', {
    target_condominium: condominiumId(c),
  });
  return responseJson(c, response);
});

treasuryRoutes.post('/:id/treasury/accounts', async (c) => {
  const payload = await body(c, treasuryAccountSchema);
  if (payload instanceof Response) return payload;
  const response = await rpc(c, 'create_treasury_account', {
    target_condominium: condominiumId(c),
    account_name: payload.name,
    account_kind: payload.accountType,
    account_currency: payload.currencyCode,
    financial_institution: payload.bankName ?? null,
    reference_value: payload.accountReference ?? null,
    account_notes: payload.notes ?? null,
  });
  return responseJson(c, response, 201);
});

treasuryRoutes.post('/:id/treasury/payments/:paymentId/account', async (c) => {
  const payload = await body(c, financialAccountSelectionSchema);
  if (payload instanceof Response) return payload;
  const response = await rpc(c, 'select_payment_treasury_account', {
    target_condominium: condominiumId(c),
    target_payment: uuidSchema.parse(c.req.param('paymentId')),
    target_account: payload.accountId,
  });
  return responseJson(c, response);
});

treasuryRoutes.post('/:id/treasury/expenses/:expenseId/account', async (c) => {
  const payload = await body(c, financialAccountSelectionSchema);
  if (payload instanceof Response) return payload;
  const response = await rpc(c, 'select_expense_treasury_account', {
    target_condominium: condominiumId(c),
    target_expense: uuidSchema.parse(c.req.param('expenseId')),
    target_account: payload.accountId,
  });
  return responseJson(c, response);
});

// HAB-126: an intentional overdraft is authorized separately and tied to the exact immutable
// movement request. Transfers create their outgoing movement with the ':out' suffix.
treasuryRoutes.post('/:id/treasury/overdraft-authorizations', async (c) => {
  const payload = await body(c, overdraftAuthorizationSchema);
  if (payload instanceof Response) return payload;
  const movementRequestKey =
    payload.operation === 'transfer' ? `${payload.requestKey}:out` : payload.requestKey;
  const response = await rpc(c, 'authorize_treasury_overdraft', {
    target_condominium: condominiumId(c),
    target_account: payload.accountId,
    debit_amount: payload.amount,
    movement_request_key: movementRequestKey,
    authorization_reason: payload.reason,
  });
  return responseJson(c, response, 201);
});

treasuryRoutes.get('/:id/treasury/movements', async (c) => {
  const query = z
    .object({ accountId: uuidSchema.optional(), limit: z.coerce.number().int().min(1).max(200) })
    .safeParse({
      accountId: c.req.query('accountId') || undefined,
      limit: c.req.query('limit') || 100,
    });
  if (!query.success) return c.json({ error: query.error.flatten() }, 400);

  const filters = [
    `condominium_id=eq.${condominiumId(c)}`,
    query.data.accountId ? `account_id=eq.${query.data.accountId}` : '',
    'select=*',
    'order=occurred_on.desc,created_at.desc',
    `limit=${query.data.limit}`,
  ].filter(Boolean);
  const response = await rest(c, `treasury_movements?${filters.join('&')}`);
  return listJson(c, response);
});

treasuryRoutes.post('/:id/treasury/movements', async (c) => {
  const payload = await body(c, treasuryMovementSchema);
  if (payload instanceof Response) return payload;
  const response = await rpc(c, 'record_treasury_movement', {
    target_condominium: condominiumId(c),
    target_account: payload.accountId,
    movement_direction: payload.direction,
    movement_type: payload.movementKind,
    movement_amount: payload.amount,
    movement_date: payload.occurredOn,
    movement_description: payload.description,
    movement_reference: payload.reference ?? null,
    movement_source: payload.movementKind === 'opening_balance' ? 'opening_balance' : 'manual',
    source_record: null,
    request_key: payload.idempotencyKey,
  });
  return responseJson(c, response, 201);
});

treasuryRoutes.post('/:id/treasury/movements/:movementId/reverse', async (c) => {
  const payload = await body(c, treasuryReversalSchema);
  if (payload instanceof Response) return payload;
  const response = await rpc(c, 'reverse_treasury_movement', {
    target_condominium: condominiumId(c),
    target_movement: uuidSchema.parse(c.req.param('movementId')),
    reversal_reason: payload.reason,
    request_key: payload.idempotencyKey,
  });
  return responseJson(c, response, 201);
});

treasuryRoutes.get('/:id/treasury/transfers', async (c) => {
  const response = await rest(
    c,
    `treasury_transfers?condominium_id=eq.${condominiumId(c)}&select=*&order=occurred_on.desc,created_at.desc`,
  );
  return listJson(c, response);
});

treasuryRoutes.post('/:id/treasury/transfers', async (c) => {
  const payload = await body(c, treasuryTransferSchema);
  if (payload instanceof Response) return payload;
  const response = await rpc(c, 'create_treasury_transfer', {
    target_condominium: condominiumId(c),
    source_account: payload.fromAccountId,
    destination_account: payload.toAccountId,
    transfer_amount: payload.amount,
    transfer_date: payload.occurredOn,
    transfer_description: payload.description,
    transfer_reference: payload.reference ?? null,
    request_key: payload.idempotencyKey,
  });
  return responseJson(c, response, 201);
});

treasuryRoutes.get('/:id/treasury/reconciliations', async (c) => {
  const response = await rest(
    c,
    `treasury_reconciliations?condominium_id=eq.${condominiumId(c)}&select=*&order=period_end.desc,created_at.desc`,
  );
  return listJson(c, response);
});

treasuryRoutes.post('/:id/treasury/reconciliations', async (c) => {
  const payload = await body(c, treasuryReconciliationSchema);
  if (payload instanceof Response) return payload;
  const response = await rpc(c, 'create_treasury_reconciliation', {
    target_condominium: condominiumId(c),
    target_account: payload.accountId,
    starts_on: payload.startsOn,
    ends_on: payload.endsOn,
    statement_opening: payload.statementOpeningBalance,
    statement_closing: payload.statementClosingBalance,
    reconciliation_notes: payload.notes ?? null,
  });
  return responseJson(c, response, 201);
});

treasuryRoutes.get('/:id/treasury/reconciliations/:reconciliationId/items', async (c) => {
  const response = await rest(
    c,
    `treasury_reconciliation_items?condominium_id=eq.${condominiumId(c)}&reconciliation_id=eq.${uuidSchema.parse(
      c.req.param('reconciliationId'),
    )}&select=*&order=matched_at.asc`,
  );
  return listJson(c, response);
});

treasuryRoutes.post('/:id/treasury/reconciliations/:reconciliationId/match', async (c) => {
  const payload = await body(c, treasuryMatchSchema);
  if (payload instanceof Response) return payload;
  const response = await rpc(c, 'match_treasury_movement', {
    target_condominium: condominiumId(c),
    target_reconciliation: uuidSchema.parse(c.req.param('reconciliationId')),
    target_movement: payload.movementId,
  });
  return responseJson(c, response, 201);
});

treasuryRoutes.post('/:id/treasury/reconciliations/:reconciliationId/close', async (c) => {
  const response = await rpc(c, 'close_treasury_reconciliation', {
    target_condominium: condominiumId(c),
    target_reconciliation: uuidSchema.parse(c.req.param('reconciliationId')),
  });
  return responseJson(c, response);
});
