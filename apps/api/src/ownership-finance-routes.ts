import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { uuidSchema } from '@habitta/validation';
import type { NotificationBindings } from './notifications/types';

type Variables = { token: string; userId: string };
type RouteContext = Context<{ Bindings: NotificationBindings; Variables: Variables }>;

export const ownershipFinanceRoutes = new Hono<{
  Bindings: NotificationBindings;
  Variables: Variables;
}>();

const dateSchema = z.string().date();
const currencyCodeSchema = z
  .string()
  .trim()
  .length(3)
  .transform((value) => value.toUpperCase());
const moneySchema = z.union([
  z.number().positive(),
  z.string().regex(/^(0|[1-9][0-9]{0,15})(\.[0-9]{1,10})?$/),
]);

const ownershipTransferSchema = z.object({
  effectiveDate: dateSchema,
  newOwners: z
    .array(
      z.object({
        personId: uuidSchema,
        ownershipPercentage: z.union([z.number().positive().max(100), z.string()]).optional(),
        isPrimaryContact: z.boolean().optional(),
      }),
    )
    .min(1),
  supportingDocumentReference: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
});

const statementQuerySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});

const solvencyQuerySchema = z.object({ asOf: dateSchema.optional() });

const currencyPolicySchema = z.object({
  accountingCurrencyCode: currencyCodeSchema,
  acceptedCurrencyCodes: z.array(currencyCodeSchema).min(1).max(12),
  conversionMode: z.enum(['disabled', 'approved_rates_only']),
  defaultRateSource: z.string().trim().max(120).optional(),
  maxRateAgeDays: z.number().int().min(0).max(31).default(7),
});

const exchangeRateSchema = z.object({
  fromCurrencyCode: currencyCodeSchema,
  toCurrencyCode: currencyCodeSchema,
  rate: moneySchema,
  effectiveOn: dateSchema,
  rateAt: z.string().datetime({ offset: true }),
  source: z.string().trim().min(1).max(120),
  sourceReference: z.string().trim().max(500).optional(),
});

const solvencyPolicySchema = z.object({
  balanceBasis: z.enum(['outstanding', 'overdue']).default('outstanding'),
  graceDays: z.number().int().min(0).max(365).default(0),
  tolerancePerCurrency: z.number().min(0).multipleOf(0.01).default(0),
  certificateValidityDays: z.number().int().min(1).max(365).default(30),
});

function rest(c: RouteContext, path: string, init: RequestInit = {}) {
  return fetch(`${c.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: c.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${c.get('token')}`,
      Prefer: 'return=representation',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

function rpc(c: RouteContext, name: string, body: Record<string, unknown>) {
  return rest(c, `rpc/${name}`, { method: 'POST', body: JSON.stringify(body) });
}

async function parsedBody<T extends z.ZodTypeAny>(c: RouteContext, schema: T) {
  const parsed = schema.safeParse(await c.req.json());
  return parsed.success ? parsed.data : c.json({ error: parsed.error.flatten() }, 400);
}

async function jsonResponse(c: RouteContext, response: Response, successStatus: 200 | 201 = 200) {
  return c.json(await response.json(), response.ok ? successStatus : 400);
}

type OwnershipFailure = { status: 403 | 409 | 422; error: string; publicMessage: string };

/** Annulment guards are the whole point here, so each one has to say what it protects. */
const ownershipFailures: Record<string, OwnershipFailure> = {
  'permission denied': {
    status: 403,
    error: 'ownership_forbidden',
    publicMessage: 'No tienes permisos para realizar esta corrección.',
  },
  'ownership transfer not found': {
    status: 409,
    error: 'ownership_transfer_unavailable',
    publicMessage: 'El traspaso ya no está disponible. Actualiza la información.',
  },
  'invalid ownership revert': {
    status: 422,
    error: 'ownership_revert_invalid',
    publicMessage: 'Escribe el motivo del reverso (entre 3 y 500 caracteres).',
  },
  'only the latest ownership transfer can be reverted': {
    status: 409,
    error: 'ownership_revert_not_latest',
    publicMessage:
      'Solo se puede revertir el último traspaso de la unidad. Revierte primero los posteriores.',
  },
  'ownership transfer already reverted': {
    status: 409,
    error: 'ownership_revert_duplicate',
    publicMessage: 'Este traspaso ya fue revertido.',
  },
  'ownership transfer has no previous owners to restore': {
    status: 409,
    error: 'ownership_revert_without_previous',
    publicMessage:
      'Este traspaso fue la primera asignación de la unidad, así que no hay propietarios anteriores que restaurar. Registra un traspaso nuevo.',
  },
  'solvency certificate not found': {
    status: 409,
    error: 'solvency_certificate_unavailable',
    publicMessage: 'El certificado ya no está disponible. Actualiza la información.',
  },
  'solvency certificate already annulled': {
    status: 409,
    error: 'solvency_certificate_already_annulled',
    publicMessage: 'Este certificado ya fue anulado.',
  },
  'invalid solvency annulment': {
    status: 422,
    error: 'solvency_annulment_invalid',
    publicMessage: 'Escribe el motivo de la anulación (entre 3 y 500 caracteres).',
  },
};

export function ownershipFailureFromPostgrest(payload: unknown): OwnershipFailure | null {
  if (!payload || typeof payload !== 'object') return null;
  const message = (payload as { message?: unknown }).message;
  if (typeof message !== 'string') return null;
  return ownershipFailures[message] ?? null;
}

const annulmentReasonSchema = z.object({ reason: z.string().trim().min(3).max(500) });

async function guardedResponse(c: RouteContext, response: Response) {
  const payload = await response
    .clone()
    .json()
    .catch(() => null);
  if (response.ok) return c.json(payload, 200);

  const failure = ownershipFailureFromPostgrest(payload);
  if (failure) {
    return c.json({ error: failure.error, publicMessage: failure.publicMessage }, failure.status);
  }
  if (response.status === 401 || response.status === 403) {
    return c.json({ error: 'ownership_forbidden' }, 403);
  }
  if (response.status >= 500) return c.json({ error: 'ownership_upstream_failure' }, 502);
  return c.json({ error: 'ownership_operation_failed' }, 400);
}

ownershipFinanceRoutes.get('/:id/units/:unitId/ownership-transfers', async (c) => {
  const condominiumId = uuidSchema.parse(c.req.param('id'));
  const unitId = uuidSchema.parse(c.req.param('unitId'));
  const response = await rest(
    c,
    `ownership_transfers?condominium_id=eq.${condominiumId}&unit_id=eq.${unitId}&select=*&order=effective_date.desc,created_at.desc`,
  );
  return jsonResponse(c, response);
});

ownershipFinanceRoutes.post('/:id/units/:unitId/ownership-transfers', async (c) => {
  const condominiumId = uuidSchema.parse(c.req.param('id'));
  const unitId = uuidSchema.parse(c.req.param('unitId'));
  const body = await parsedBody(c, ownershipTransferSchema);
  if (body instanceof Response) return body;
  const response = await rpc(c, 'transfer_unit_ownership', {
    target: condominiumId,
    target_unit: unitId,
    effective_on: body.effectiveDate,
    new_owners: body.newOwners.map(
      (owner: {
        personId: string;
        ownershipPercentage?: string | number;
        isPrimaryContact?: boolean;
      }) => ({
        person_id: owner.personId,
        ownership_percentage: owner.ownershipPercentage ?? null,
        is_primary_contact: owner.isPrimaryContact ?? false,
      }),
    ),
    supporting_document: body.supportingDocumentReference ?? null,
    transfer_notes: body.notes ?? null,
  });
  return jsonResponse(c, response, 201);
});

ownershipFinanceRoutes.get('/:id/units/:unitId/account-statement', async (c) => {
  const condominiumId = uuidSchema.parse(c.req.param('id'));
  const unitId = uuidSchema.parse(c.req.param('unitId'));
  const parsed = statementQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const response = await rpc(c, 'get_unit_account_statement', {
    target: condominiumId,
    target_unit: unitId,
    period_from: parsed.data.from ?? null,
    period_to: parsed.data.to ?? new Date().toISOString().slice(0, 10),
  });
  return jsonResponse(c, response);
});

ownershipFinanceRoutes.get('/:id/units/:unitId/solvency', async (c) => {
  const condominiumId = uuidSchema.parse(c.req.param('id'));
  const unitId = uuidSchema.parse(c.req.param('unitId'));
  const parsed = solvencyQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const response = await rpc(c, 'evaluate_unit_solvency', {
    target: condominiumId,
    target_unit: unitId,
    evaluated_on: parsed.data.asOf ?? new Date().toISOString().slice(0, 10),
  });
  return jsonResponse(c, response);
});

ownershipFinanceRoutes.get('/:id/units/:unitId/solvency-certificates', async (c) => {
  const condominiumId = uuidSchema.parse(c.req.param('id'));
  const unitId = uuidSchema.parse(c.req.param('unitId'));
  const response = await rest(
    c,
    `solvency_certificates?condominium_id=eq.${condominiumId}&unit_id=eq.${unitId}&select=*&order=issued_at.desc`,
  );
  return jsonResponse(c, response);
});

ownershipFinanceRoutes.post('/:id/units/:unitId/solvency-certificates', async (c) => {
  const condominiumId = uuidSchema.parse(c.req.param('id'));
  const unitId = uuidSchema.parse(c.req.param('unitId'));
  const parsed = solvencyQuerySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const response = await rpc(c, 'issue_solvency_certificate', {
    target: condominiumId,
    target_unit: unitId,
    evaluated_on: parsed.data.asOf ?? new Date().toISOString().slice(0, 10),
  });
  return jsonResponse(c, response, 201);
});

ownershipFinanceRoutes.get('/:id/currency-policy', async (c) => {
  const condominiumId = uuidSchema.parse(c.req.param('id'));
  const response = await rest(
    c,
    `condominium_currency_policies?condominium_id=eq.${condominiumId}&select=*`,
  );
  return jsonResponse(c, response);
});

ownershipFinanceRoutes.put('/:id/currency-policy', async (c) => {
  const condominiumId = uuidSchema.parse(c.req.param('id'));
  const body = await parsedBody(c, currencyPolicySchema);
  if (body instanceof Response) return body;
  const response = await rpc(c, 'configure_condominium_currency_policy', {
    target: condominiumId,
    accounting_currency: body.accountingCurrencyCode,
    accepted_currencies: body.acceptedCurrencyCodes,
    conversion_policy: body.conversionMode,
    default_source: body.defaultRateSource ?? null,
    rate_age_days: body.maxRateAgeDays,
  });
  return jsonResponse(c, response);
});

ownershipFinanceRoutes.get('/:id/exchange-rates', async (c) => {
  const condominiumId = uuidSchema.parse(c.req.param('id'));
  const response = await rest(
    c,
    `condominium_exchange_rates?condominium_id=eq.${condominiumId}&select=*&order=effective_on.desc,created_at.desc`,
  );
  return jsonResponse(c, response);
});

ownershipFinanceRoutes.post('/:id/exchange-rates', async (c) => {
  const condominiumId = uuidSchema.parse(c.req.param('id'));
  const body = await parsedBody(c, exchangeRateSchema);
  if (body instanceof Response) return body;
  const response = await rpc(c, 'record_approved_exchange_rate', {
    target: condominiumId,
    from_currency: body.fromCurrencyCode,
    to_currency: body.toCurrencyCode,
    rate_value: body.rate,
    rate_effective_on: body.effectiveOn,
    observed_at: body.rateAt,
    rate_source: body.source,
    source_ref: body.sourceReference ?? null,
  });
  return jsonResponse(c, response, 201);
});

ownershipFinanceRoutes.get('/:id/solvency-policy', async (c) => {
  const condominiumId = uuidSchema.parse(c.req.param('id'));
  const response = await rest(
    c,
    `condominium_solvency_policies?condominium_id=eq.${condominiumId}&select=*`,
  );
  return jsonResponse(c, response);
});

ownershipFinanceRoutes.put('/:id/solvency-policy', async (c) => {
  const condominiumId = uuidSchema.parse(c.req.param('id'));
  const body = await parsedBody(c, solvencyPolicySchema);
  if (body instanceof Response) return body;
  const response = await rpc(c, 'configure_solvency_policy', {
    target: condominiumId,
    basis: body.balanceBasis,
    grace_period_days: body.graceDays,
    tolerance: body.tolerancePerCurrency,
    validity_days: body.certificateValidityDays,
  });
  return jsonResponse(c, response);
});

ownershipFinanceRoutes.post(
  '/:id/units/:unitId/ownership-transfers/:transferId/revert',
  async (c) => {
    const condominiumId = uuidSchema.parse(c.req.param('id'));
    const transferId = uuidSchema.parse(c.req.param('transferId'));
    const body = await parsedBody(c, annulmentReasonSchema);
    if (body instanceof Response) return body;
    const response = await rpc(c, 'revert_unit_ownership_transfer', {
      target: condominiumId,
      target_transfer: transferId,
      revert_reason: body.reason,
    });
    return guardedResponse(c, response);
  },
);

ownershipFinanceRoutes.post(
  '/:id/units/:unitId/solvency-certificates/:certificateId/annul',
  async (c) => {
    const condominiumId = uuidSchema.parse(c.req.param('id'));
    const certificateId = uuidSchema.parse(c.req.param('certificateId'));
    const body = await parsedBody(c, annulmentReasonSchema);
    if (body instanceof Response) return body;
    const response = await rpc(c, 'annul_solvency_certificate', {
      target: condominiumId,
      target_certificate: certificateId,
      annulment_reason: body.reason,
    });
    return guardedResponse(c, response);
  },
);
