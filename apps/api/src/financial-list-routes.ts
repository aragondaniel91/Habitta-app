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

const COMPLETE_READ_PAGE_SIZE = 500;
const COMPLETE_READ_MAX_ROWS = 50_000;

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

const listFailure = async (c: AppContext, response: Response) => {
  const value = (await response.json().catch(() => null)) as { code?: string } | null;
  const denied = response.status === 401 || response.status === 403 || value?.code === '42501';
  return c.json({ error: denied ? 'Forbidden' : 'Request failed' }, denied ? 403 : 400);
};

const paginatedFinancialList = (table: string, order: string) => async (c: AppContext) => {
  const id = uuidSchema.parse(c.req.param('id'));
  const explicitPagination =
    c.req.query('page') !== undefined || c.req.query('pageSize') !== undefined;

  if (!explicitPagination) {
    const items: unknown[] = [];
    let total: number | null = null;

    for (let offset = 0; ; offset += COMPLETE_READ_PAGE_SIZE) {
      const response = await rest(
        c,
        `${table}?condominium_id=eq.${id}&select=*&order=${order}&limit=${COMPLETE_READ_PAGE_SIZE}&offset=${offset}`,
        { headers: { Prefer: 'count=exact' } },
      );
      if (!response.ok) return listFailure(c, response);

      const pageItems = (await response.json()) as unknown[];
      const pageTotal = parseExactTotal(response.headers.get('content-range'));
      if (!Array.isArray(pageItems) || pageTotal === null) {
        return c.json({ error: 'Pagination metadata unavailable' }, 502);
      }
      total ??= pageTotal;
      if (pageTotal !== total) {
        return c.json({ error: 'Financial list changed during read' }, 409);
      }
      if (total > COMPLETE_READ_MAX_ROWS) {
        return c.json(
          {
            error: 'Financial history requires explicit pagination',
            total,
            maxCompleteReadRows: COMPLETE_READ_MAX_ROWS,
          },
          413,
        );
      }

      items.push(...pageItems);
      if (items.length >= total) return c.json(items);
      if (pageItems.length === 0) {
        return c.json({ error: 'Financial history ended before exact count' }, 502);
      }
    }
  }

  const query = paginationQuerySchema.safeParse({
    page: c.req.query('page') || undefined,
    pageSize: c.req.query('pageSize') || undefined,
  });
  if (!query.success) return c.json({ error: query.error.flatten() }, 400);

  const { page, pageSize } = query.data;
  const offset = (page - 1) * pageSize;
  const response = await rest(
    c,
    `${table}?condominium_id=eq.${id}&select=*&order=${order}&limit=${pageSize}&offset=${offset}`,
    { headers: { Prefer: 'count=exact' } },
  );
  if (!response.ok) return listFailure(c, response);

  const value = await response.json();
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
  router.get(
    '/:id/charge-concepts',
    paginatedFinancialList('charge_concepts', 'created_at.desc,id.desc'),
  );
  router.get(
    '/:id/receivables',
    paginatedFinancialList('receivable_balances', 'issue_date.desc,id.desc'),
  );
  router.get(
    '/:id/charge-batches',
    paginatedFinancialList('charge_batches', 'created_at.desc,id.desc'),
  );
  router.get(
    '/:id/payment-methods',
    paginatedFinancialList('condominium_payment_methods', 'display_name.asc,id.asc'),
  );
  router.get('/:id/payments', paginatedFinancialList('payments', 'created_at.desc,id.desc'));
}
