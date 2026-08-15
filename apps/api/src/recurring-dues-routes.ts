import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { uuidSchema } from '@habitta/validation';
import type { NotificationBindings } from './notifications/types';
import { ownershipFinanceRoutes } from './ownership-finance-routes';

type Variables = { token: string; userId: string };
type RecurringDuesContext = Context<{ Bindings: NotificationBindings; Variables: Variables }>;

export const recurringDuesRoutes = new Hono<{
  Bindings: NotificationBindings;
  Variables: Variables;
}>();

const moneySchema = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$/)
  .refine((value) => Number(value) > 0);

const scopeInputSchema = z
  .object({
    code: z.string().trim().min(1).max(48),
    name: z.string().trim().min(1).max(120),
    kind: z.enum(['condominium', 'building', 'custom']),
    buildingId: uuidSchema.optional(),
    unitIds: z.array(uuidSchema).min(1).optional(),
  })
  .superRefine((value, context) => {
    if (value.kind === 'building' && !value.buildingId)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['buildingId'],
        message: 'buildingId is required',
      });
    if (value.kind !== 'building' && value.buildingId)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['buildingId'],
        message: 'buildingId is only valid for building scopes',
      });
    if (value.kind === 'custom' && !value.unitIds?.length)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['unitIds'],
        message: 'unitIds are required for custom scopes',
      });
  });

const planInputSchema = z
  .object({
    conceptId: uuidSchema,
    financialScopeId: uuidSchema,
    name: z.string().trim().min(1).max(160),
    distribution: z.enum(['fixed_per_unit', 'participation_percentage']),
    amount: moneySchema,
    currencyCode: z.string().regex(/^[A-Z]{3}$/),
    startsOn: z.string().date(),
    endsOn: z.string().date().optional(),
    issueDay: z.number().int().min(1).max(28).default(1),
    dueDay: z.number().int().min(1).max(28).default(10),
  })
  .superRefine((value, context) => {
    if (value.dueDay < value.issueDay)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dueDay'],
        message: 'dueDay must not precede issueDay',
      });
    if (value.endsOn && value.endsOn < value.startsOn)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsOn'],
        message: 'endsOn must not precede startsOn',
      });
  });

const runInputSchema = z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) });
const runQuerySchema = z.object({
  status: z.enum(['scheduled', 'pending_review', 'posted', 'cancelled']).optional(),
});

function rest(c: RecurringDuesContext, path: string, init: RequestInit = {}) {
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

async function rpc(c: RecurringDuesContext, name: string, payload: Record<string, unknown>) {
  return rest(c, `rpc/${name}`, { method: 'POST', body: JSON.stringify(payload) });
}

async function parseBody<T extends z.ZodTypeAny>(c: RecurringDuesContext, schema: T) {
  const parsed = schema.safeParse(await c.req.json());
  return parsed.success ? parsed.data : c.json({ error: parsed.error.flatten() }, 400);
}

async function scopedExists(c: RecurringDuesContext, path: string) {
  const response = await rest(c, path);
  if (!response.ok) return false;
  return ((await response.json()) as unknown[]).length > 0;
}

recurringDuesRoutes.get('/:id/financial-scopes', async (c) => {
  const condominiumId = uuidSchema.parse(c.req.param('id'));
  const response = await rest(
    c,
    `financial_scopes?condominium_id=eq.${condominiumId}&select=*&order=name`,
  );
  return c.json(await response.json(), response.ok ? 200 : 403);
});

recurringDuesRoutes.post('/:id/financial-scopes', async (c) => {
  const condominiumId = uuidSchema.parse(c.req.param('id'));
  const parsed = await parseBody(c, scopeInputSchema);
  if (parsed instanceof Response) return parsed;
  const response = await rpc(c, 'create_financial_scope', {
    target: condominiumId,
    scope_code: parsed.code,
    scope_name: parsed.name,
    scope_kind: parsed.kind,
    target_building: parsed.buildingId ?? null,
    target_units: parsed.unitIds ?? null,
  });
  return c.json(await response.json(), response.ok ? 201 : 400);
});

recurringDuesRoutes.get('/:id/recurring-charge-plans', async (c) => {
  const condominiumId = uuidSchema.parse(c.req.param('id'));
  const response = await rest(
    c,
    `recurring_charge_plans?condominium_id=eq.${condominiumId}&select=*&order=created_at.desc`,
  );
  return c.json(await response.json(), response.ok ? 200 : 403);
});

recurringDuesRoutes.post('/:id/recurring-charge-plans', async (c) => {
  const condominiumId = uuidSchema.parse(c.req.param('id'));
  const parsed = await parseBody(c, planInputSchema);
  if (parsed instanceof Response) return parsed;
  const response = await rpc(c, 'create_recurring_charge_plan', {
    target: condominiumId,
    target_concept: parsed.conceptId,
    target_scope: parsed.financialScopeId,
    plan_name: parsed.name,
    plan_distribution: parsed.distribution,
    plan_amount: parsed.amount,
    plan_currency: parsed.currencyCode,
    plan_starts_on: parsed.startsOn,
    plan_issue_day: parsed.issueDay,
    plan_due_day: parsed.dueDay,
    plan_ends_on: parsed.endsOn ?? null,
  });
  return c.json(await response.json(), response.ok ? 201 : 400);
});

recurringDuesRoutes.get('/:id/recurring-charge-runs', async (c) => {
  const condominiumId = uuidSchema.parse(c.req.param('id'));
  const parsed = runQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const statusFilter = parsed.data.status ? `&status=eq.${parsed.data.status}` : '';
  const response = await rest(
    c,
    `recurring_charge_runs?condominium_id=eq.${condominiumId}${statusFilter}&select=*&order=period.desc`,
  );
  return c.json(await response.json(), response.ok ? 200 : 403);
});

recurringDuesRoutes.post('/:id/recurring-charge-plans/:planId/runs', async (c) => {
  const condominiumId = uuidSchema.parse(c.req.param('id'));
  const planId = uuidSchema.parse(c.req.param('planId'));
  const parsed = await parseBody(c, runInputSchema);
  if (parsed instanceof Response) return parsed;
  if (
    !(await scopedExists(
      c,
      `recurring_charge_plans?id=eq.${planId}&condominium_id=eq.${condominiumId}&select=id`,
    ))
  )
    return c.json({ error: 'Recurring plan not found in condominium' }, 404);
  const response = await rpc(c, 'schedule_recurring_charge_run', {
    target_plan: planId,
    target_period: parsed.period,
  });
  return c.json(await response.json(), response.ok ? 201 : 400);
});

async function mutateRun(
  c: RecurringDuesContext,
  rpcName: 'prepare_recurring_charge_run' | 'post_recurring_charge_run',
) {
  const condominiumId = uuidSchema.parse(c.req.param('id'));
  const runId = uuidSchema.parse(c.req.param('runId'));
  if (
    !(await scopedExists(
      c,
      `recurring_charge_runs?id=eq.${runId}&condominium_id=eq.${condominiumId}&select=id`,
    ))
  )
    return c.json({ error: 'Recurring run not found in condominium' }, 404);
  const response = await rpc(c, rpcName, { target_run: runId });
  return c.json(await response.json(), response.ok ? 200 : 400);
}

recurringDuesRoutes.post('/:id/recurring-charge-runs/:runId/prepare', (c) =>
  mutateRun(c, 'prepare_recurring_charge_run'),
);
recurringDuesRoutes.post('/:id/recurring-charge-runs/:runId/post', (c) =>
  mutateRun(c, 'post_recurring_charge_run'),
);

recurringDuesRoutes.route('/', ownershipFinanceRoutes);
