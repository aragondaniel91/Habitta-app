import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import {
  treasuryAccountSchema,
  treasuryAccountUpdateSchema,
  treasuryMatchSchema,
  treasuryMovementSchema,
  treasuryReconciliationSchema,
  treasuryReversalSchema,
  treasuryTransferSchema,
  uuidSchema,
} from '@habitta/validation';
import type { NotificationBindings } from './notifications/types';
import { registerFinancialListRoutes } from './financial-list-routes';

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

type TreasuryFailure = { status: 400 | 403 | 409 | 422; error: string; publicMessage: string };

/**
 * Treasury guards used to collapse into a generic "Request failed". The operator has to know which
 * rule stopped them and how to satisfy it, without ever reading a PostgreSQL constraint name.
 */
const treasuryFailures: Record<string, TreasuryFailure> = {
  'treasury management denied': {
    status: 403,
    error: 'treasury_forbidden',
    publicMessage: 'No tienes permisos para administrar la tesorería de este condominio.',
  },
  'treasury account unavailable': {
    status: 409,
    error: 'treasury_account_unavailable',
    publicMessage: 'La cuenta de tesorería ya no está disponible. Actualiza la información.',
  },
  'invalid treasury account': {
    status: 422,
    error: 'treasury_account_invalid',
    publicMessage:
      'Revisa el nombre (2 a 120 caracteres), la moneda de tres letras y la referencia de la cuenta.',
  },
  'cash accounts cannot have a bank name': {
    status: 422,
    error: 'treasury_cash_account_bank',
    publicMessage: 'Una cuenta de efectivo no puede tener banco. Déjalo vacío o cámbiala a banco.',
  },
  'treasury account has movements': {
    status: 409,
    error: 'treasury_account_has_movements',
    publicMessage:
      'Esta cuenta ya registró movimientos, así que su moneda y su tipo no se pueden cambiar. Puedes corregir el nombre, el banco y la referencia.',
  },
  'treasury transfer not found': {
    status: 409,
    error: 'treasury_transfer_unavailable',
    publicMessage: 'La transferencia ya no está disponible. Actualiza la información.',
  },
  'invalid treasury reversal': {
    status: 422,
    error: 'treasury_reversal_invalid',
    publicMessage: 'Escribe el motivo del reverso (entre 2 y 500 caracteres).',
  },
  'treasury account is inactive': {
    status: 409,
    error: 'treasury_account_inactive',
    publicMessage:
      'Una de las cuentas de la transferencia está archivada. Reactívala antes de reversar.',
  },
  'movement requires a dedicated reversal flow': {
    status: 409,
    error: 'treasury_movement_needs_transfer_reversal',
    publicMessage:
      'Este movimiento pertenece a una transferencia. Reversa la transferencia completa para que ambas cuentas queden consistentes.',
  },
  'treasury account still holds a balance': {
    status: 409,
    error: 'treasury_account_has_balance',
    publicMessage:
      'La cuenta todavía tiene saldo. Traslada o concilia el saldo antes de archivarla.',
  },
};

export function treasuryFailureFromPostgrest(payload: unknown): TreasuryFailure | null {
  if (!payload || typeof payload !== 'object') return null;
  const message = (payload as { message?: unknown }).message;
  if (typeof message !== 'string') return null;
  return treasuryFailures[message] ?? null;
}

const responseJson = async (c: AppContext, response: Response, successStatus: 200 | 201 = 200) => {
  const value = (await response.json()) as { code?: string; message?: string };
  if (response.ok) return c.json(value, successStatus);

  const failure = treasuryFailureFromPostgrest(value);
  if (failure) {
    return c.json({ error: failure.error, publicMessage: failure.publicMessage }, failure.status);
  }

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
registerFinancialListRoutes(treasuryRoutes);

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

treasuryRoutes.patch('/:id/treasury/accounts/:accountId', async (c) => {
  const payload = await body(c, treasuryAccountUpdateSchema);
  if (payload instanceof Response) return payload;
  const response = await rpc(c, 'update_treasury_account', {
    target_condominium: condominiumId(c),
    target_account: uuidSchema.parse(c.req.param('accountId')),
    account_name: payload.name,
    account_kind: payload.accountType,
    account_currency: payload.currencyCode,
    financial_institution: payload.bankName ?? null,
    reference_value: payload.accountReference ?? null,
    account_notes: payload.notes ?? null,
    account_active: payload.isActive,
  });
  return responseJson(c, response, 200);
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

treasuryRoutes.post('/:id/treasury/transfers/:transferId/reverse', async (c) => {
  const payload = await body(c, treasuryReversalSchema);
  if (payload instanceof Response) return payload;
  const response = await rpc(c, 'reverse_treasury_transfer', {
    target_condominium: condominiumId(c),
    target_transfer: uuidSchema.parse(c.req.param('transferId')),
    reversal_reason: payload.reason,
  });
  return responseJson(c, response, 200);
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
