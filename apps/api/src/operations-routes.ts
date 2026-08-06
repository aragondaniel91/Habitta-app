import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { maintenanceRoutes } from './maintenance-routes';
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
const money = z
  .string()
  .trim()
  .regex(/^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$/)
  .refine((value) => Number(value) > 0, 'Amount must be greater than zero');
const optionalText = (maximum: number) => z.string().trim().max(maximum).optional();
const optionalUrl = z.string().trim().url().max(1000).optional();

const expenseCategorySchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9_-]{1,31}$/),
  name: z.string().trim().min(2).max(80),
  description: optionalText(500),
  isActive: z.boolean().optional(),
});

const vendorSchema = z.object({
  name: z.string().trim().min(2).max(160),
  taxIdentifier: optionalText(80),
  email: z.string().trim().email().optional(),
  phone: optionalText(40),
  notes: optionalText(1000),
  isActive: z.boolean().optional(),
});

const expenseCreateSchema = z
  .object({
    categoryId: uuid,
    vendorId: uuid.optional(),
    description: z.string().trim().min(3).max(500),
    invoiceNumber: optionalText(100),
    expenseDate: z.string().date(),
    dueDate: z.string().date().optional(),
    amount: money,
    currencyCode: currency,
    paymentMethod: optionalText(100),
    paymentReference: optionalText(160),
    supportUrl: optionalUrl,
    notes: optionalText(2000),
  })
  .refine((value) => !value.dueDate || value.dueDate >= value.expenseDate, {
    path: ['dueDate'],
    message: 'Due date must not precede expense date',
  });

const expenseUpdateSchema = z
  .object({
    categoryId: uuid.optional(),
    vendorId: uuid.optional(),
    clearVendor: z.boolean().optional(),
    description: z.string().trim().min(3).max(500).optional(),
    invoiceNumber: optionalText(100),
    expenseDate: z.string().date().optional(),
    dueDate: z.string().date().optional(),
    clearDue: z.boolean().optional(),
    amount: money.optional(),
    currencyCode: currency.optional(),
    paymentMethod: optionalText(100),
    paymentReference: optionalText(160),
    supportUrl: optionalUrl,
    notes: optionalText(2000),
    expectedVersion: z.number().int().positive().optional(),
  })
  .superRefine((value, context) => {
    if (value.vendorId && value.clearVendor) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['clearVendor'],
        message: 'Cannot set and clear a vendor together',
      });
    }
    if (value.dueDate && value.clearDue) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['clearDue'],
        message: 'Cannot set and clear a due date together',
      });
    }
  });

const transitionSchema = z.object({
  expectedVersion: z.number().int().positive().optional(),
  reason: z.string().trim().min(3).max(500).optional(),
});

const proposalCreateSchema = z
  .object({
    title: z.string().trim().min(3).max(180),
    summary: optionalText(500),
    description: z.string().trim().min(3).max(8000),
    category: z.enum(['budget', 'maintenance', 'improvement', 'community', 'policy', 'other']),
    votingBasis: z.enum(['one_per_owner', 'one_per_unit']),
    quorumPercentage: z.number().min(0).max(100),
    budgetAmount: money.optional(),
    currencyCode: currency.optional(),
    opensAt: z.string().datetime({ offset: true }).optional(),
    closesAt: z.string().datetime({ offset: true }),
    options: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(160),
          description: optionalText(500),
        }),
      )
      .min(2)
      .max(12),
    attachments: z
      .array(
        z.object({
          documentType: z.enum(['quote', 'budget', 'support', 'minutes', 'other']),
          fileName: z.string().trim().min(1).max(200),
          url: z.string().trim().url().max(1000),
        }),
      )
      .max(12)
      .optional(),
  })
  .superRefine((value, context) => {
    if (Boolean(value.budgetAmount) !== Boolean(value.currencyCode)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['currencyCode'],
        message: 'Budget amount and currency must be provided together',
      });
    }
    const opensAt = value.opensAt ? Date.parse(value.opensAt) : Date.now();
    if (Date.parse(value.closesAt) <= opensAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['closesAt'],
        message: 'Closing date must follow the opening date',
      });
    }
    const normalizedLabels = value.options.map((option) => option.label.toLocaleLowerCase('es'));
    if (new Set(normalizedLabels).size !== normalizedLabels.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: 'Voting options must be unique',
      });
    }
  });

const proposalActionSchema = z.object({ expectedVersion: z.number().int().positive().optional() });
const voteSchema = z.object({ optionId: uuid, unitId: uuid.optional() });

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
              : (value.message ?? 'Invalid request'),
    },
    status,
  );
};

export const operationsRoutes = new Hono<AppEnvironment>();

operationsRoutes.get('/:id/expense-categories', async (c) => {
  const condominiumId = uuid.parse(c.req.param('id'));
  const response = await rest(
    c,
    `expense_categories?condominium_id=eq.${condominiumId}&select=*&order=name.asc`,
  );
  return c.json(await response.json(), response.ok ? 200 : 403);
});

operationsRoutes.post('/:id/expense-categories', async (c) => {
  const parsed = await body(c, expenseCategorySchema);
  if (parsed instanceof Response) return parsed;
  const response = await rest(c, 'expense_categories', {
    method: 'POST',
    body: JSON.stringify({
      condominium_id: uuid.parse(c.req.param('id')),
      code: parsed.code,
      name: parsed.name,
      description: parsed.description ?? null,
      is_active: parsed.isActive ?? true,
      created_by: c.get('userId'),
    }),
  });
  return responseJson(c, response, 201);
});

operationsRoutes.patch('/:id/expense-categories/:categoryId', async (c) => {
  const parsed = await body(c, expenseCategorySchema.partial());
  if (parsed instanceof Response) return parsed;
  const condominiumId = uuid.parse(c.req.param('id'));
  const categoryId = uuid.parse(c.req.param('categoryId'));
  const response = await rest(
    c,
    `expense_categories?id=eq.${categoryId}&condominium_id=eq.${condominiumId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        code: parsed.code,
        name: parsed.name,
        description: parsed.description,
        is_active: parsed.isActive,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  return responseJson(c, response);
});

operationsRoutes.get('/:id/vendors', async (c) => {
  const condominiumId = uuid.parse(c.req.param('id'));
  const response = await rest(
    c,
    `vendors?condominium_id=eq.${condominiumId}&select=*&order=name.asc`,
  );
  return c.json(await response.json(), response.ok ? 200 : 403);
});

operationsRoutes.post('/:id/vendors', async (c) => {
  const parsed = await body(c, vendorSchema);
  if (parsed instanceof Response) return parsed;
  const response = await rest(c, 'vendors', {
    method: 'POST',
    body: JSON.stringify({
      condominium_id: uuid.parse(c.req.param('id')),
      name: parsed.name,
      tax_identifier: parsed.taxIdentifier ?? null,
      email: parsed.email ?? null,
      phone: parsed.phone ?? null,
      notes: parsed.notes ?? null,
      is_active: parsed.isActive ?? true,
      created_by: c.get('userId'),
    }),
  });
  return responseJson(c, response, 201);
});

operationsRoutes.patch('/:id/vendors/:vendorId', async (c) => {
  const parsed = await body(c, vendorSchema.partial());
  if (parsed instanceof Response) return parsed;
  const condominiumId = uuid.parse(c.req.param('id'));
  const vendorId = uuid.parse(c.req.param('vendorId'));
  const response = await rest(c, `vendors?id=eq.${vendorId}&condominium_id=eq.${condominiumId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: parsed.name,
      tax_identifier: parsed.taxIdentifier,
      email: parsed.email,
      phone: parsed.phone,
      notes: parsed.notes,
      is_active: parsed.isActive,
      updated_at: new Date().toISOString(),
    }),
  });
  return responseJson(c, response);
});

operationsRoutes.get('/:id/expenses/summary', async (c) => {
  const response = await rpc(c, 'get_expense_summary', {
    target_condominium: uuid.parse(c.req.param('id')),
  });
  return responseJson(c, response);
});

operationsRoutes.get('/:id/expenses', async (c) => {
  const condominiumId = uuid.parse(c.req.param('id'));
  const status = c.req.query('status');
  const currencyCode = c.req.query('currency');
  const statusFilter = status
    ? z.enum(['draft', 'pending_approval', 'approved', 'paid', 'void']).parse(status)
    : '';
  const currencyFilter = currencyCode ? currency.parse(currencyCode) : '';
  const filters = [
    `condominium_id=eq.${condominiumId}`,
    statusFilter ? `status=eq.${statusFilter}` : '',
    currencyFilter ? `currency_code=eq.${currencyFilter}` : '',
  ].filter(Boolean);
  const response = await rest(
    c,
    `expenses?${filters.join('&')}&select=*&order=expense_date.desc,created_at.desc`,
  );
  return c.json(await response.json(), response.ok ? 200 : 403);
});

operationsRoutes.post('/:id/expenses', async (c) => {
  const parsed = await body(c, expenseCreateSchema);
  if (parsed instanceof Response) return parsed;
  const response = await rpc(c, 'create_expense', {
    target_condominium: uuid.parse(c.req.param('id')),
    target_category: parsed.categoryId,
    target_vendor: parsed.vendorId ?? null,
    expense_description: parsed.description,
    invoice_value: parsed.invoiceNumber ?? null,
    expense_on: parsed.expenseDate,
    due_on: parsed.dueDate ?? null,
    expense_amount: parsed.amount,
    expense_currency: parsed.currencyCode,
    payment_method_value: parsed.paymentMethod ?? null,
    payment_reference_value: parsed.paymentReference ?? null,
    support_url_value: parsed.supportUrl ?? null,
    notes_value: parsed.notes ?? null,
  });
  return responseJson(c, response, 201);
});

operationsRoutes.get('/:id/expenses/:expenseId', async (c) => {
  const condominiumId = uuid.parse(c.req.param('id'));
  const expenseId = uuid.parse(c.req.param('expenseId'));
  const response = await rest(
    c,
    `expenses?id=eq.${expenseId}&condominium_id=eq.${condominiumId}&select=*`,
  );
  if (!response.ok) return c.json({ error: 'Expense failed' }, 403);
  const rows = (await response.json()) as unknown[];
  return rows.length ? c.json(rows[0]) : c.json({ error: 'Expense not found' }, 404);
});

operationsRoutes.get('/:id/expenses/:expenseId/events', async (c) => {
  const condominiumId = uuid.parse(c.req.param('id'));
  const expenseId = uuid.parse(c.req.param('expenseId'));
  const response = await rest(
    c,
    `expense_events?expense_id=eq.${expenseId}&condominium_id=eq.${condominiumId}&select=*&order=occurred_at.asc`,
  );
  return c.json(await response.json(), response.ok ? 200 : 403);
});

operationsRoutes.patch('/:id/expenses/:expenseId', async (c) => {
  const parsed = await body(c, expenseUpdateSchema);
  if (parsed instanceof Response) return parsed;
  const response = await rpc(c, 'update_expense', {
    target_condominium: uuid.parse(c.req.param('id')),
    target_expense: uuid.parse(c.req.param('expenseId')),
    target_category: parsed.categoryId ?? null,
    target_vendor: parsed.vendorId ?? null,
    clear_vendor: parsed.clearVendor ?? false,
    expense_description: parsed.description ?? null,
    invoice_value: parsed.invoiceNumber ?? null,
    expense_on: parsed.expenseDate ?? null,
    due_on: parsed.dueDate ?? null,
    clear_due: parsed.clearDue ?? false,
    expense_amount: parsed.amount ?? null,
    expense_currency: parsed.currencyCode ?? null,
    payment_method_value: parsed.paymentMethod ?? null,
    payment_reference_value: parsed.paymentReference ?? null,
    support_url_value: parsed.supportUrl ?? null,
    notes_value: parsed.notes ?? null,
    expected_version: parsed.expectedVersion ?? null,
  });
  return responseJson(c, response);
});

for (const [path, action] of [
  ['submit', 'submit'],
  ['approve', 'approve'],
  ['mark-paid', 'mark_paid'],
  ['void', 'void'],
] as const) {
  operationsRoutes.post(`/:id/expenses/:expenseId/${path}`, async (c) => {
    const parsed = await body(c, transitionSchema);
    if (parsed instanceof Response) return parsed;
    const response = await rpc(c, 'transition_expense', {
      target_condominium: uuid.parse(c.req.param('id')),
      target_expense: uuid.parse(c.req.param('expenseId')),
      action_name: action,
      reason_value: parsed.reason ?? null,
      expected_version: parsed.expectedVersion ?? null,
    });
    return responseJson(c, response);
  });
}

operationsRoutes.get('/:id/governance-proposals', async (c) => {
  const condominiumId = uuid.parse(c.req.param('id'));
  const status = c.req.query('status');
  const category = c.req.query('category');
  const statusFilter = status
    ? z.enum(['draft', 'open', 'closed', 'approved', 'rejected', 'archived']).parse(status)
    : '';
  const categoryFilter = category
    ? z
        .enum(['budget', 'maintenance', 'improvement', 'community', 'policy', 'other'])
        .parse(category)
    : '';
  const filters = [
    `condominium_id=eq.${condominiumId}`,
    statusFilter ? `status=eq.${statusFilter}` : '',
    categoryFilter ? `category=eq.${categoryFilter}` : '',
  ].filter(Boolean);
  const response = await rest(
    c,
    `governance_proposals?${filters.join('&')}&select=*&order=updated_at.desc`,
  );
  return c.json(await response.json(), response.ok ? 200 : 403);
});

operationsRoutes.post('/:id/governance-proposals', async (c) => {
  const parsed = await body(c, proposalCreateSchema);
  if (parsed instanceof Response) return parsed;
  const response = await rpc(c, 'create_governance_proposal', {
    target_condominium: uuid.parse(c.req.param('id')),
    proposal_title: parsed.title,
    proposal_summary: parsed.summary ?? null,
    proposal_description: parsed.description,
    proposal_category: parsed.category,
    proposal_voting_basis: parsed.votingBasis,
    proposal_quorum: parsed.quorumPercentage,
    proposal_budget_amount: parsed.budgetAmount ?? null,
    proposal_currency: parsed.currencyCode ?? null,
    opens_on: parsed.opensAt ?? null,
    closes_on: parsed.closesAt,
    options_value: parsed.options.map((option, index) => ({
      label: option.label,
      description: option.description ?? null,
      sortOrder: index,
    })),
    attachments_value: parsed.attachments ?? [],
  });
  return responseJson(c, response, 201);
});

operationsRoutes.get('/:id/governance-proposals/:proposalId', async (c) => {
  const condominiumId = uuid.parse(c.req.param('id'));
  const proposalId = uuid.parse(c.req.param('proposalId'));
  const response = await rest(
    c,
    `governance_proposals?id=eq.${proposalId}&condominium_id=eq.${condominiumId}&select=*`,
  );
  if (!response.ok) return c.json({ error: 'Proposal failed' }, 403);
  const rows = (await response.json()) as unknown[];
  return rows.length ? c.json(rows[0]) : c.json({ error: 'Proposal not found' }, 404);
});

operationsRoutes.get('/:id/governance-proposals/:proposalId/options', async (c) => {
  const condominiumId = uuid.parse(c.req.param('id'));
  const proposalId = uuid.parse(c.req.param('proposalId'));
  const response = await rest(
    c,
    `governance_options?proposal_id=eq.${proposalId}&condominium_id=eq.${condominiumId}&select=*&order=sort_order.asc,label.asc`,
  );
  return c.json(await response.json(), response.ok ? 200 : 403);
});

operationsRoutes.get('/:id/governance-proposals/:proposalId/attachments', async (c) => {
  const condominiumId = uuid.parse(c.req.param('id'));
  const proposalId = uuid.parse(c.req.param('proposalId'));
  const response = await rest(
    c,
    `governance_attachments?proposal_id=eq.${proposalId}&condominium_id=eq.${condominiumId}&select=*&order=created_at.asc`,
  );
  return c.json(await response.json(), response.ok ? 200 : 403);
});

operationsRoutes.get('/:id/governance-proposals/:proposalId/events', async (c) => {
  const condominiumId = uuid.parse(c.req.param('id'));
  const proposalId = uuid.parse(c.req.param('proposalId'));
  const response = await rest(
    c,
    `governance_events?proposal_id=eq.${proposalId}&condominium_id=eq.${condominiumId}&select=*&order=occurred_at.asc`,
  );
  return c.json(await response.json(), response.ok ? 200 : 403);
});

operationsRoutes.get('/:id/governance-proposals/:proposalId/eligibility', async (c) => {
  const response = await rpc(c, 'get_governance_eligibility', {
    target_condominium: uuid.parse(c.req.param('id')),
    target_proposal: uuid.parse(c.req.param('proposalId')),
  });
  return responseJson(c, response);
});

operationsRoutes.get('/:id/governance-proposals/:proposalId/results', async (c) => {
  const response = await rpc(c, 'get_governance_results', {
    target_condominium: uuid.parse(c.req.param('id')),
    target_proposal: uuid.parse(c.req.param('proposalId')),
  });
  return responseJson(c, response);
});

for (const action of ['open', 'close', 'approve', 'reject', 'archive'] as const) {
  operationsRoutes.post(`/:id/governance-proposals/:proposalId/${action}`, async (c) => {
    const parsed = await body(c, proposalActionSchema);
    if (parsed instanceof Response) return parsed;
    const response = await rpc(c, 'transition_governance_proposal', {
      target_condominium: uuid.parse(c.req.param('id')),
      target_proposal: uuid.parse(c.req.param('proposalId')),
      action_name: action,
      expected_version: parsed.expectedVersion ?? null,
    });
    return responseJson(c, response);
  });
}

operationsRoutes.post('/:id/governance-proposals/:proposalId/votes', async (c) => {
  const parsed = await body(c, voteSchema);
  if (parsed instanceof Response) return parsed;
  const response = await rpc(c, 'cast_governance_vote', {
    target_condominium: uuid.parse(c.req.param('id')),
    target_proposal: uuid.parse(c.req.param('proposalId')),
    target_option: parsed.optionId,
    target_unit: parsed.unitId ?? null,
  });
  return responseJson(c, response, 201);
});

operationsRoutes.route('/', maintenanceRoutes);
