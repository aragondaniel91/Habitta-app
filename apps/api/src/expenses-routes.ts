import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { uuidSchema } from '@habitta/validation';
import type { NotificationBindings } from './notifications/types';

type Variables = { token: string; userId: string };
type ExpensesEnvironment = { Bindings: NotificationBindings; Variables: Variables };
type ExpensesContext = Context<ExpensesEnvironment>;
type ValidationFailure = { formErrors: string[]; fieldErrors: Record<string, string[]> };

const currencySchema = z
  .string()
  .trim()
  .length(3)
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z]{3}$/.test(value));
const moneySchema = z.string().regex(/^(0|[1-9][0-9]{0,15})\.[0-9]{2}$/);
const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .transform((value) => value || null)
    .optional();

const categorySchema = z.object({
  code: z.string().trim().min(1).max(30),
  name: z.string().trim().min(1).max(120),
  description: optionalText(500),
  isActive: z.boolean().default(true),
});

const supplierSchema = z.object({
  name: z.string().trim().min(1).max(160),
  taxDocument: optionalText(80),
  email: z.string().trim().email().nullable().optional(),
  phone: optionalText(80),
  address: optionalText(500),
  notes: optionalText(1000),
  status: z.enum(['active', 'inactive']).default('active'),
});

const expenseSchema = z
  .object({
    categoryId: uuidSchema,
    supplierId: uuidSchema.nullable().optional(),
    description: z.string().trim().min(1).max(500),
    amount: moneySchema,
    currencyCode: currencySchema,
    issueDate: z.string().date(),
    dueDate: z.string().date().nullable().optional(),
    documentReference: optionalText(160),
    supportMetadata: z.record(z.string(), z.unknown()).default({}),
  })
  .refine((value) => !value.dueDate || value.dueDate >= value.issueDate, {
    message: 'Due date must not precede issue date',
    path: ['dueDate'],
  });

const paidSchema = z.object({ paidDate: z.string().date() });
const voidSchema = z.object({ reason: z.string().trim().min(3).max(500) });
const budgetSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    periodStart: z.string().date(),
    periodEnd: z.string().date(),
    notes: optionalText(1000),
  })
  .refine((value) => value.periodEnd >= value.periodStart, {
    message: 'Budget end date must not precede start date',
    path: ['periodEnd'],
  });
const budgetLineSchema = z.object({
  categoryId: uuidSchema,
  currencyCode: currencySchema,
  plannedAmount: moneySchema,
  notes: optionalText(500),
});

async function parseBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
): Promise<z.infer<T> | ValidationFailure> {
  const result = schema.safeParse(await request.json());
  return result.success ? result.data : result.error.flatten();
}

const isValidationFailure = (value: unknown): value is ValidationFailure =>
  Boolean(value && typeof value === 'object' && 'fieldErrors' in value);

const parseCondominiumId = (value: string) => uuidSchema.safeParse(value);

const headers = (env: NotificationBindings, token: string, representation = false) => ({
  apikey: env.SUPABASE_ANON_KEY,
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  ...(representation ? { Prefer: 'return=representation' } : {}),
});

export const expensesRoutes = new Hono<ExpensesEnvironment>();

const proxyList = (table: string, order: string) => async (c: ExpensesContext) => {
  const condominiumId = parseCondominiumId(c.req.param('condominiumId'));
  if (!condominiumId.success)
    return c.json({ error: 'Invalid condominium identifier' }, 400);
  const response = await fetch(
    `${c.env.SUPABASE_URL}/rest/v1/${table}?condominium_id=eq.${condominiumId.data}&select=*&order=${order}`,
    { headers: headers(c.env, c.get('token')) },
  );
  return c.json(await response.json(), response.ok ? 200 : 400);
};

expensesRoutes.get(
  '/:condominiumId/expense-categories',
  proxyList('expense_categories', 'name.asc'),
);
expensesRoutes.get('/:condominiumId/suppliers', proxyList('suppliers', 'name.asc'));
expensesRoutes.get('/:condominiumId/expenses', proxyList('expense_register', 'issue_date.desc'));
expensesRoutes.get('/:condominiumId/budgets', proxyList('budgets', 'period_start.desc'));
expensesRoutes.get(
  '/:condominiumId/budget-actuals',
  proxyList('budget_actuals', 'budget_name.asc,category_name.asc'),
);
expensesRoutes.get(
  '/:condominiumId/expense-summary',
  proxyList('expense_summary_by_currency', 'currency_code.asc'),
);

expensesRoutes.post('/:condominiumId/expense-categories', async (c) => {
  const condominiumId = parseCondominiumId(c.req.param('condominiumId'));
  if (!condominiumId.success)
    return c.json({ error: 'Invalid condominium identifier' }, 400);
  const parsed = await parseBody(c.req.raw, categorySchema);
  if (isValidationFailure(parsed)) return c.json({ error: parsed }, 400);

  const response = await fetch(`${c.env.SUPABASE_URL}/rest/v1/expense_categories`, {
    method: 'POST',
    headers: headers(c.env, c.get('token'), true),
    body: JSON.stringify({
      condominium_id: condominiumId.data,
      code: parsed.code,
      name: parsed.name,
      description: parsed.description ?? null,
      is_active: parsed.isActive,
      created_by: c.get('userId'),
    }),
  });
  return c.json(await response.json(), response.ok ? 201 : 400);
});

expensesRoutes.patch('/:condominiumId/expense-categories/:categoryId', async (c) => {
  const condominiumId = parseCondominiumId(c.req.param('condominiumId'));
  const categoryId = uuidSchema.safeParse(c.req.param('categoryId'));
  if (!condominiumId.success || !categoryId.success)
    return c.json({ error: 'Invalid category identifier' }, 400);
  const parsed = await parseBody(c.req.raw, categorySchema.partial());
  if (isValidationFailure(parsed)) return c.json({ error: parsed }, 400);

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.code !== undefined) payload.code = parsed.code;
  if (parsed.name !== undefined) payload.name = parsed.name;
  if (parsed.description !== undefined) payload.description = parsed.description;
  if (parsed.isActive !== undefined) payload.is_active = parsed.isActive;
  const response = await fetch(
    `${c.env.SUPABASE_URL}/rest/v1/expense_categories?id=eq.${categoryId.data}&condominium_id=eq.${condominiumId.data}`,
    {
      method: 'PATCH',
      headers: headers(c.env, c.get('token'), true),
      body: JSON.stringify(payload),
    },
  );
  return c.json(await response.json(), response.ok ? 200 : 400);
});

expensesRoutes.post('/:condominiumId/suppliers', async (c) => {
  const condominiumId = parseCondominiumId(c.req.param('condominiumId'));
  if (!condominiumId.success)
    return c.json({ error: 'Invalid condominium identifier' }, 400);
  const parsed = await parseBody(c.req.raw, supplierSchema);
  if (isValidationFailure(parsed)) return c.json({ error: parsed }, 400);

  const response = await fetch(`${c.env.SUPABASE_URL}/rest/v1/suppliers`, {
    method: 'POST',
    headers: headers(c.env, c.get('token'), true),
    body: JSON.stringify({
      condominium_id: condominiumId.data,
      name: parsed.name,
      tax_document: parsed.taxDocument ?? null,
      email: parsed.email ?? null,
      phone: parsed.phone ?? null,
      address: parsed.address ?? null,
      notes: parsed.notes ?? null,
      status: parsed.status,
      created_by: c.get('userId'),
    }),
  });
  return c.json(await response.json(), response.ok ? 201 : 400);
});

expensesRoutes.patch('/:condominiumId/suppliers/:supplierId', async (c) => {
  const condominiumId = parseCondominiumId(c.req.param('condominiumId'));
  const supplierId = uuidSchema.safeParse(c.req.param('supplierId'));
  if (!condominiumId.success || !supplierId.success)
    return c.json({ error: 'Invalid supplier identifier' }, 400);
  const parsed = await parseBody(c.req.raw, supplierSchema.partial());
  if (isValidationFailure(parsed)) return c.json({ error: parsed }, 400);

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.name !== undefined) payload.name = parsed.name;
  if (parsed.taxDocument !== undefined) payload.tax_document = parsed.taxDocument;
  if (parsed.email !== undefined) payload.email = parsed.email;
  if (parsed.phone !== undefined) payload.phone = parsed.phone;
  if (parsed.address !== undefined) payload.address = parsed.address;
  if (parsed.notes !== undefined) payload.notes = parsed.notes;
  if (parsed.status !== undefined) payload.status = parsed.status;
  const response = await fetch(
    `${c.env.SUPABASE_URL}/rest/v1/suppliers?id=eq.${supplierId.data}&condominium_id=eq.${condominiumId.data}`,
    {
      method: 'PATCH',
      headers: headers(c.env, c.get('token'), true),
      body: JSON.stringify(payload),
    },
  );
  return c.json(await response.json(), response.ok ? 200 : 400);
});

expensesRoutes.post('/:condominiumId/expenses', async (c) => {
  const condominiumId = parseCondominiumId(c.req.param('condominiumId'));
  if (!condominiumId.success)
    return c.json({ error: 'Invalid condominium identifier' }, 400);
  const parsed = await parseBody(c.req.raw, expenseSchema);
  if (isValidationFailure(parsed)) return c.json({ error: parsed }, 400);

  const response = await fetch(`${c.env.SUPABASE_URL}/rest/v1/rpc/create_expense`, {
    method: 'POST',
    headers: headers(c.env, c.get('token')),
    body: JSON.stringify({
      target_condominium_id: condominiumId.data,
      target_category_id: parsed.categoryId,
      target_supplier_id: parsed.supplierId ?? null,
      expense_description: parsed.description,
      expense_amount: parsed.amount,
      expense_currency_code: parsed.currencyCode,
      expense_issue_date: parsed.issueDate,
      expense_due_date: parsed.dueDate ?? null,
      expense_document_reference: parsed.documentReference ?? null,
      expense_support_metadata: parsed.supportMetadata,
    }),
  });
  return c.json(await response.json(), response.ok ? 201 : 400);
});

expensesRoutes.post('/:condominiumId/expenses/:expenseId/approve', async (c) => {
  const condominiumId = parseCondominiumId(c.req.param('condominiumId'));
  const expenseId = uuidSchema.safeParse(c.req.param('expenseId'));
  if (!condominiumId.success || !expenseId.success)
    return c.json({ error: 'Invalid expense identifier' }, 400);
  const response = await fetch(`${c.env.SUPABASE_URL}/rest/v1/rpc/approve_expense`, {
    method: 'POST',
    headers: headers(c.env, c.get('token')),
    body: JSON.stringify({
      target_condominium_id: condominiumId.data,
      target_expense_id: expenseId.data,
    }),
  });
  return c.json(await response.json(), response.ok ? 200 : 400);
});

expensesRoutes.post('/:condominiumId/expenses/:expenseId/paid', async (c) => {
  const condominiumId = parseCondominiumId(c.req.param('condominiumId'));
  const expenseId = uuidSchema.safeParse(c.req.param('expenseId'));
  if (!condominiumId.success || !expenseId.success)
    return c.json({ error: 'Invalid expense identifier' }, 400);
  const parsed = await parseBody(c.req.raw, paidSchema);
  if (isValidationFailure(parsed)) return c.json({ error: parsed }, 400);
  const response = await fetch(`${c.env.SUPABASE_URL}/rest/v1/rpc/mark_expense_paid`, {
    method: 'POST',
    headers: headers(c.env, c.get('token')),
    body: JSON.stringify({
      target_condominium_id: condominiumId.data,
      target_expense_id: expenseId.data,
      paid_on: parsed.paidDate,
    }),
  });
  return c.json(await response.json(), response.ok ? 200 : 400);
});

expensesRoutes.post('/:condominiumId/expenses/:expenseId/void', async (c) => {
  const condominiumId = parseCondominiumId(c.req.param('condominiumId'));
  const expenseId = uuidSchema.safeParse(c.req.param('expenseId'));
  if (!condominiumId.success || !expenseId.success)
    return c.json({ error: 'Invalid expense identifier' }, 400);
  const parsed = await parseBody(c.req.raw, voidSchema);
  if (isValidationFailure(parsed)) return c.json({ error: parsed }, 400);
  const response = await fetch(`${c.env.SUPABASE_URL}/rest/v1/rpc/void_expense`, {
    method: 'POST',
    headers: headers(c.env, c.get('token')),
    body: JSON.stringify({
      target_condominium_id: condominiumId.data,
      target_expense_id: expenseId.data,
      reason: parsed.reason,
    }),
  });
  return c.json(await response.json(), response.ok ? 200 : 400);
});

expensesRoutes.get('/:condominiumId/expenses/:expenseId/events', async (c) => {
  const condominiumId = parseCondominiumId(c.req.param('condominiumId'));
  const expenseId = uuidSchema.safeParse(c.req.param('expenseId'));
  if (!condominiumId.success || !expenseId.success)
    return c.json({ error: 'Invalid expense identifier' }, 400);
  const response = await fetch(
    `${c.env.SUPABASE_URL}/rest/v1/expense_events?condominium_id=eq.${condominiumId.data}&expense_id=eq.${expenseId.data}&select=*&order=created_at.asc`,
    { headers: headers(c.env, c.get('token')) },
  );
  return c.json(await response.json(), response.ok ? 200 : 400);
});

expensesRoutes.post('/:condominiumId/budgets', async (c) => {
  const condominiumId = parseCondominiumId(c.req.param('condominiumId'));
  if (!condominiumId.success)
    return c.json({ error: 'Invalid condominium identifier' }, 400);
  const parsed = await parseBody(c.req.raw, budgetSchema);
  if (isValidationFailure(parsed)) return c.json({ error: parsed }, 400);
  const response = await fetch(`${c.env.SUPABASE_URL}/rest/v1/rpc/create_budget`, {
    method: 'POST',
    headers: headers(c.env, c.get('token')),
    body: JSON.stringify({
      target_condominium_id: condominiumId.data,
      budget_name: parsed.name,
      starts_on: parsed.periodStart,
      ends_on: parsed.periodEnd,
      budget_notes: parsed.notes ?? null,
    }),
  });
  return c.json(await response.json(), response.ok ? 201 : 400);
});

expensesRoutes.post('/:condominiumId/budgets/:budgetId/lines', async (c) => {
  const condominiumId = parseCondominiumId(c.req.param('condominiumId'));
  const budgetId = uuidSchema.safeParse(c.req.param('budgetId'));
  if (!condominiumId.success || !budgetId.success)
    return c.json({ error: 'Invalid budget identifier' }, 400);
  const parsed = await parseBody(c.req.raw, budgetLineSchema);
  if (isValidationFailure(parsed)) return c.json({ error: parsed }, 400);
  const response = await fetch(`${c.env.SUPABASE_URL}/rest/v1/rpc/upsert_budget_line`, {
    method: 'POST',
    headers: headers(c.env, c.get('token')),
    body: JSON.stringify({
      target_condominium_id: condominiumId.data,
      target_budget_id: budgetId.data,
      target_category_id: parsed.categoryId,
      line_currency_code: parsed.currencyCode,
      line_planned_amount: parsed.plannedAmount,
      line_notes: parsed.notes ?? null,
    }),
  });
  return c.json(await response.json(), response.ok ? 200 : 400);
});

expensesRoutes.post('/:condominiumId/budgets/:budgetId/approve', async (c) => {
  const condominiumId = parseCondominiumId(c.req.param('condominiumId'));
  const budgetId = uuidSchema.safeParse(c.req.param('budgetId'));
  if (!condominiumId.success || !budgetId.success)
    return c.json({ error: 'Invalid budget identifier' }, 400);
  const response = await fetch(`${c.env.SUPABASE_URL}/rest/v1/rpc/approve_budget`, {
    method: 'POST',
    headers: headers(c.env, c.get('token')),
    body: JSON.stringify({
      target_condominium_id: condominiumId.data,
      target_budget_id: budgetId.data,
    }),
  });
  return c.json(await response.json(), response.ok ? 200 : 400);
});
