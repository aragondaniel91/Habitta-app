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
const currencyCodeSchema = z.string().trim().length(3).transform((value) => value.toUpperCase());
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

async function jsonResponse(c: RouteContext, response: Response, successStatus = 200) {
  return c.json(await response.json(), response.ok ? successStatus : 400);
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
    new_owners: body.newOwners.map((owner) => ({
      person_id: owner.personId,
      ownership_percentage: owner.ownershipPercentage ?? null,
      is_primary_contact: owner.isPrimaryContact ?? false,
    })),
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
