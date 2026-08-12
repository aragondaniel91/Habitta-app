import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import type { NotificationBindings } from './notifications/types';

type Variables = { token: string; userId: string };
type AppEnvironment = { Bindings: NotificationBindings; Variables: Variables };
type AppContext = Context<AppEnvironment>;

const uuid = z.string().uuid();
const currency = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/)
  .transform((value) => value.toUpperCase());
const money = z.union([z.number().positive(), z.string().trim().regex(/^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$/)]).refine(
  (value) => Number(value) > 0,
  'Amount must be greater than zero',
);
const optionalText = (maximum: number) => z.string().trim().max(maximum).nullable().optional();

const quoteCreateSchema = z.object({
  vendorId: uuid,
  amount: money,
  currencyCode: currency,
  reference: optionalText(160),
  validUntil: z.string().date().nullable().optional(),
  notes: optionalText(3000),
});

const quoteDecisionSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    note: optionalText(2000),
  })
  .superRefine((value, context) => {
    if (value.decision === 'reject' && (!value.note || value.note.length < 3)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['note'],
        message: 'A rejection note is required',
      });
    }
  });

const expenseLinkSchema = z.object({
  expenseId: uuid,
  quoteId: uuid.nullable().optional(),
});

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
  const status: 400 | 403 | 404 | 409 =
    response.status === 401 || response.status === 403 || value.code === '42501'
      ? 403
      : value.code === '23505'
        ? 409
        : value.message?.includes('not found') || response.status === 404
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
              : (value.message ?? 'Invalid request'),
    },
    status,
  );
};

export const maintenanceFinancialRoutes = new Hono<AppEnvironment>();

maintenanceFinancialRoutes.get('/:id/maintenance/work-orders/:workOrderId/quotes', async (c) => {
  const condominiumId = uuid.parse(c.req.param('id'));
  const workOrderId = uuid.parse(c.req.param('workOrderId'));
  const response = await rest(
    c,
    `maintenance_quotes?condominium_id=eq.${condominiumId}&work_order_id=eq.${workOrderId}&select=*&order=created_at.desc,id.desc`,
  );
  return responseJson(c, response);
});

maintenanceFinancialRoutes.post('/:id/maintenance/work-orders/:workOrderId/quotes', async (c) => {
  const parsed = await body(c, quoteCreateSchema);
  if (parsed instanceof Response) return parsed;
  const response = await rpc(c, 'create_maintenance_quote', {
    target_condominium: uuid.parse(c.req.param('id')),
    target_work_order: uuid.parse(c.req.param('workOrderId')),
    target_vendor: parsed.vendorId,
    quote_amount: parsed.amount,
    quote_currency: parsed.currencyCode,
    reference_value: parsed.reference ?? null,
    valid_until_value: parsed.validUntil ?? null,
    notes_value: parsed.notes ?? null,
  });
  return responseJson(c, response, 201);
});

maintenanceFinancialRoutes.post(
  '/:id/maintenance/work-orders/:workOrderId/quotes/:quoteId/decision',
  async (c) => {
    uuid.parse(c.req.param('workOrderId'));
    const parsed = await body(c, quoteDecisionSchema);
    if (parsed instanceof Response) return parsed;
    const response = await rpc(c, 'decide_maintenance_quote', {
      target_condominium: uuid.parse(c.req.param('id')),
      target_quote: uuid.parse(c.req.param('quoteId')),
      decision: parsed.decision,
      decision_note_value: parsed.note ?? null,
    });
    return responseJson(c, response);
  },
);

maintenanceFinancialRoutes.get('/:id/maintenance/work-orders/:workOrderId/expenses', async (c) => {
  const condominiumId = uuid.parse(c.req.param('id'));
  const workOrderId = uuid.parse(c.req.param('workOrderId'));
  const response = await rest(
    c,
    `maintenance_work_order_expenses?condominium_id=eq.${condominiumId}&work_order_id=eq.${workOrderId}&select=*&order=created_at.desc,id.desc`,
  );
  return responseJson(c, response);
});

maintenanceFinancialRoutes.post('/:id/maintenance/work-orders/:workOrderId/expenses', async (c) => {
  const parsed = await body(c, expenseLinkSchema);
  if (parsed instanceof Response) return parsed;
  const response = await rpc(c, 'link_maintenance_expense', {
    target_condominium: uuid.parse(c.req.param('id')),
    target_work_order: uuid.parse(c.req.param('workOrderId')),
    target_expense: parsed.expenseId,
    target_quote: parsed.quoteId ?? null,
  });
  return responseJson(c, response, 201);
});
