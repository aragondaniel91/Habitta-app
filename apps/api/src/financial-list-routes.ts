import type { Context, Hono } from 'hono';
import { z } from 'zod';
import { uuidSchema } from '@habitta/validation';
import type { NotificationBindings } from './notifications/types';

type Variables = { token: string; userId: string };
type AppEnvironment = { Bindings: NotificationBindings; Variables: Variables };
type AppContext = Context<AppEnvironment>;

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

const rest = (c: AppContext, path: string, init: RequestInit = {}) =>
  fetch(`${c.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: c.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${c.get('token')}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

const parseExactTotal = (contentRange: string | null) => {
  const match = contentRange?.match(/\/(\d+)$/);
  return match ? Number.parseInt(match[1]!, 10) : null;
};

const paginatedFinancialList = (table: string, order: string) => async (c: AppContext) => {
  const query = paginationQuerySchema.safeParse({
    page: c.req.query('page') || undefined,
    pageSize: c.req.query('pageSize') || undefined,
  });
  if (!query.success) return c.json({ error: query.error.flatten() }, 400);

  const id = uuidSchema.parse(c.req.param('id'));
  const { page, pageSize } = query.data;
  const offset = (page - 1) * pageSize;
  const response = await rest(
    c,
    `${table}?condominium_id=eq.${id}&select=*&order=${order}&limit=${pageSize}&offset=${offset}`,
    { headers: { Prefer: 'count=exact' } },
  );
  const value = await response.json();
  if (!response.ok) {
    const code = (value as { code?: string }).code;
    const denied = response.status === 401 || response.status === 403 || code === '42501';
    return c.json({ error: denied ? 'Forbidden' : 'Request failed' }, denied ? 403 : 400);
  }

  const items = Array.isArray(value) ? value : [];
  const total = parseExactTotal(response.headers.get('content-range'));
  if (total === null) return c.json({ error: 'Pagination metadata unavailable' }, 502);

  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  return c.json({
    items,
    page,
    pageSize,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  });
};

export function registerFinancialListRoutes(router: Hono<AppEnvironment>) {
  router.get('/:id/charge-concepts', paginatedFinancialList('charge_concepts', 'created_at.desc,id.desc'));
  router.get(
    '/:id/receivables',
    paginatedFinancialList('receivable_balances', 'issue_date.desc,id.desc'),
  );
  router.get('/:id/charge-batches', paginatedFinancialList('charge_batches', 'created_at.desc,id.desc'));
  router.get(
    '/:id/payment-methods',
    paginatedFinancialList('condominium_payment_methods', 'display_name.asc,id.asc'),
  );
  router.get('/:id/payments', paginatedFinancialList('payments', 'created_at.desc,id.desc'));
}
