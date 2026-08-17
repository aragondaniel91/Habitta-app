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
const money = z
  .string()
  .trim()
  .regex(/^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$/)
  .refine((value) => Number(value) > 0, 'Amount must be greater than zero');

const lineSchema = z.object({
  categoryId: uuid,
  currencyCode: currency,
  amount: money,
  note: z.string().trim().max(1000).optional(),
});

const budgetCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    startsOn: z.string().date(),
    endsOn: z.string().date(),
    requestId: uuid,
    revisionNote: z.string().trim().max(1000).optional(),
    lines: z.array(lineSchema).min(1).max(500),
  })
  .superRefine((value, context) => {
    if (value.endsOn < value.startsOn) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsOn'],
        message: 'Budget end date must not precede start date',
      });
    }
    const keys = value.lines.map((line) => `${line.categoryId}:${line.currencyCode.toUpperCase()}`);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lines'],
        message: 'Budget category and currency pairs must be unique',
      });
    }
  });

const budgetRevisionSchema = z.object({
  requestId: uuid,
  revisionNote: z.string().trim().max(1000).optional(),
  lines: z.array(lineSchema).min(1).max(500),
});

const documentLinkSchema = z.object({ documentId: uuid });

const body = async <T>(c: AppContext, schema: z.ZodType<T>) => {
  try {
    const parsed = schema.safeParse(await c.req.json());
    return parsed.success ? parsed.data : c.json({ error: parsed.error.flatten() }, 400);
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
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

const serializeLines = (
  lines: Array<{ categoryId: string; currencyCode: string; amount: string; note?: string }>,
) =>
  lines.map((line) => ({
    category_id: line.categoryId,
    currency_code: line.currencyCode,
    amount: line.amount,
    note: line.note ?? null,
  }));

export const budgetRoutes = new Hono<AppEnvironment>();

budgetRoutes.get('/:id/budgets', async (c) => {
  const condominiumId = uuid.parse(c.req.param('id'));
  const [periodsResponse, versionsResponse, linesResponse] = await Promise.all([
    rest(
      c,
      `budget_periods?condominium_id=eq.${condominiumId}&select=*&order=starts_on.desc,created_at.desc`,
    ),
    rest(c, `budget_versions?condominium_id=eq.${condominiumId}&select=*&order=created_at.desc`),
    rest(
      c,
      `budget_lines?condominium_id=eq.${condominiumId}&select=*&order=currency_code.asc,created_at.asc`,
    ),
  ]);

  if (!periodsResponse.ok || !versionsResponse.ok || !linesResponse.ok) {
    return c.json({ error: 'Budget workspace unavailable' }, 403);
  }

  return c.json({
    periods: await periodsResponse.json(),
    versions: await versionsResponse.json(),
    lines: await linesResponse.json(),
  });
});

budgetRoutes.post('/:id/budgets', async (c) => {
  const parsed = await body(c, budgetCreateSchema);
  if (parsed instanceof Response) return parsed;
  const response = await rpc(c, 'create_budget_period', {
    target_condominium: uuid.parse(c.req.param('id')),
    period_name: parsed.name,
    starts_on_value: parsed.startsOn,
    ends_on_value: parsed.endsOn,
    lines_value: serializeLines(parsed.lines),
    request_id_value: parsed.requestId,
    revision_note_value: parsed.revisionNote ?? null,
  });
  return responseJson(c, response, 201);
});

budgetRoutes.post('/:id/budgets/:periodId/revisions', async (c) => {
  const parsed = await body(c, budgetRevisionSchema);
  if (parsed instanceof Response) return parsed;
  const response = await rpc(c, 'create_budget_revision', {
    target_condominium: uuid.parse(c.req.param('id')),
    target_budget_period: uuid.parse(c.req.param('periodId')),
    lines_value: serializeLines(parsed.lines),
    request_id_value: parsed.requestId,
    revision_note_value: parsed.revisionNote ?? null,
  });
  return responseJson(c, response, 201);
});

budgetRoutes.post('/:id/budgets/:periodId/versions/:versionId/submit', async (c) => {
  const response = await rpc(c, 'submit_budget_version', {
    target_condominium: uuid.parse(c.req.param('id')),
    target_budget_period: uuid.parse(c.req.param('periodId')),
    target_budget_version: uuid.parse(c.req.param('versionId')),
  });
  return responseJson(c, response);
});

budgetRoutes.post('/:id/budgets/:periodId/versions/:versionId/approve', async (c) => {
  const response = await rpc(c, 'approve_budget_version', {
    target_condominium: uuid.parse(c.req.param('id')),
    target_budget_period: uuid.parse(c.req.param('periodId')),
    target_budget_version: uuid.parse(c.req.param('versionId')),
  });
  return responseJson(c, response);
});

budgetRoutes.get('/:id/budgets/:periodId/actual-vs-budget', async (c) => {
  const response = await rpc(c, 'get_budget_actual_vs_budget', {
    target_condominium: uuid.parse(c.req.param('id')),
    target_budget_period: uuid.parse(c.req.param('periodId')),
  });
  return responseJson(c, response);
});

// Dedicated endpoint keeps the existing generic Community Documents route backward-compatible
// while making the new authoritative budget target usable immediately.
budgetRoutes.post('/:id/budgets/:periodId/community-document-link', async (c) => {
  const parsed = await body(c, documentLinkSchema);
  if (parsed instanceof Response) return parsed;
  const response = await rpc(c, 'link_community_document', {
    target_document_id: parsed.documentId,
    target_type: 'budget',
    target_id: uuid.parse(c.req.param('periodId')),
  });
  return responseJson(c, response, 201);
});
