import type { Context, Hono } from 'hono';
import { z } from 'zod';
import {
  paymentAgreementCreateSchema,
  paymentAgreementTransitionSchema,
  uuidSchema,
} from '@habitta/validation';
import type { NotificationBindings } from './notifications/types';

type Variables = { token: string; userId: string };
type Environment = { Bindings: NotificationBindings; Variables: Variables };
type AppContext = Context<Environment>;

const agreementStatuses = ['pending', 'accepted', 'rejected', 'cancelled'] as const;
const agreementQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    unitId: uuidSchema.optional(),
    personId: uuidSchema.optional(),
    status: z.enum(agreementStatuses).optional(),
    // Keep money as its URL decimal representation. Converting it to Number before
    // JSON serialization can turn 0.30 into 0.30000000000000004.
    minAmount: z
      .string()
      .regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/)
      .optional(),
    maxAmount: z
      .string()
      .regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/)
      .optional(),
    periodFrom: z.string().date().optional(),
    periodTo: z.string().date().optional(),
    dateFrom: z.string().date().optional(),
    dateTo: z.string().date().optional(),
    sort: z
      .enum(['updatedAtDesc', 'updatedAtAsc', 'amountDesc', 'amountAsc', 'periodAsc', 'periodDesc'])
      .default('updatedAtDesc'),
  })
  .superRefine((value, context) => {
    if (
      value.minAmount !== undefined &&
      value.maxAmount !== undefined &&
      decimalToCents(value.minAmount) > decimalToCents(value.maxAmount)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxAmount'],
        message: 'maxAmount must be at least minAmount',
      });
    if (value.periodFrom && value.periodTo && value.periodFrom > value.periodTo)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['periodTo'],
        message: 'periodTo must not be before periodFrom',
      });
    if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dateTo'],
        message: 'dateTo must not be before dateFrom',
      });
  });

type AgreementRecord = {
  id: string;
  [key: string]: unknown;
};

const LEGACY_AGREEMENT_READ_CAP = 100;
type AgreementSearchRow = { agreement_id: string | null; total_count: number | string };
const decimalToCents = (value: string) => {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole ?? '0') * 100n + BigInt(fraction.padEnd(2, '0'));
};

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

const rpc = (c: AppContext, name: string, payload: unknown) =>
  rest(c, `rpc/${name}`, { method: 'POST', body: JSON.stringify(payload) });

const failure = async (c: AppContext, response: Response) => {
  const details = (await response.json().catch(() => null)) as {
    code?: string;
    message?: string;
  } | null;
  const status =
    details?.code === '42501'
      ? 403
      : details?.code === 'P0002'
        ? 404
        : details?.code === '40001'
          ? 409
          : 400;
  return c.json({ error: details?.message ?? 'Request failed' }, status);
};

const schedule = (
  installments: { dueDate: string; amount: string; currencyCode?: string | undefined }[],
) =>
  installments.map((item) => ({
    due_date: item.dueDate,
    amount: item.amount,
    ...(item.currencyCode ? { currency_code: item.currencyCode } : {}),
  }));

export function registerPaymentAgreementRoutes(router: Hono<Environment>) {
  router.get('/:id/payment-agreements', async (c) => {
    const condominiumId = uuidSchema.parse(c.req.param('id'));
    const explicitPagination =
      c.req.query('page') !== undefined || c.req.query('pageSize') !== undefined;
    const parsed = agreementQuerySchema.safeParse({
      page: c.req.query('page') || undefined,
      pageSize: c.req.query('pageSize') || undefined,
      unitId: c.req.query('unitId') || undefined,
      personId: c.req.query('personId') || undefined,
      status: c.req.query('status') || undefined,
      minAmount: c.req.query('minAmount') || undefined,
      maxAmount: c.req.query('maxAmount') || undefined,
      periodFrom: c.req.query('periodFrom') || undefined,
      periodTo: c.req.query('periodTo') || undefined,
      dateFrom: c.req.query('dateFrom') || undefined,
      dateTo: c.req.query('dateTo') || undefined,
      sort: c.req.query('sort') || undefined,
    });
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const query = parsed.data;
    // The unpaginated compatibility response is intentionally capped. New callers receive
    // pagination metadata; neither shape causes the Worker to enumerate a condominium.
    const search = await rpc(c, 'list_payment_agreement_ids', {
      target_condominium: condominiumId,
      target_page: explicitPagination ? query.page : 1,
      target_page_size: explicitPagination ? query.pageSize : LEGACY_AGREEMENT_READ_CAP,
      target_unit: query.unitId ?? null,
      target_person: query.personId ?? null,
      target_status: query.status ?? null,
      target_min_amount: query.minAmount ?? null,
      target_max_amount: query.maxAmount ?? null,
      target_period_from: query.periodFrom ?? null,
      target_period_to: query.periodTo ?? null,
      target_date_from: query.dateFrom ?? null,
      target_date_to: query.dateTo ?? null,
      target_sort: query.sort,
    });
    if (!search.ok) return failure(c, search);
    const searchRows = (await search.json()) as AgreementSearchRow[];
    const total = Number(searchRows[0]?.total_count ?? 0);
    const pageItemIds = searchRows.flatMap((row) => (row.agreement_id ? [row.agreement_id] : []));
    if (!pageItemIds.length) {
      return c.json(
        explicitPagination
          ? {
              items: [],
              page: query.page,
              pageSize: query.pageSize,
              total,
              totalPages: total ? Math.ceil(total / query.pageSize) : 0,
              hasNextPage: false,
              hasPreviousPage: query.page > 1,
            }
          : [],
      );
    }
    const ids = pageItemIds.join(',');
    const [agreements, sources, events, progress] = await Promise.all([
      rest(c, `payment_agreements?id=in.(${ids})&select=*`),
      rest(c, `payment_agreement_receivables?agreement_id=in.(${ids})&select=*`),
      rest(
        c,
        `payment_agreement_events?agreement_id=in.(${ids})&select=*&order=sequence_number.asc`,
      ),
      rest(c, `payment_agreement_progress?agreement_id=in.(${ids})&select=*`),
    ]);
    if (!agreements.ok) return failure(c, agreements);
    if (!sources.ok) return failure(c, sources);
    if (!events.ok) return failure(c, events);
    if (!progress.ok) return failure(c, progress);
    const sourcesByAgreement = new Map<string, unknown[]>();
    for (const item of (await sources.json()) as { agreement_id: string }[]) {
      sourcesByAgreement.set(item.agreement_id, [
        ...(sourcesByAgreement.get(item.agreement_id) ?? []),
        item,
      ]);
    }
    const eventsByAgreement = new Map<string, unknown[]>();
    for (const item of (await events.json()) as { agreement_id: string }[]) {
      eventsByAgreement.set(item.agreement_id, [
        ...(eventsByAgreement.get(item.agreement_id) ?? []),
        item,
      ]);
    }
    const progressByAgreement = new Map<string, unknown>();
    for (const item of (await progress.json()) as { agreement_id: string }[])
      progressByAgreement.set(item.agreement_id, item);
    const agreementsById = new Map(
      ((await agreements.json()) as AgreementRecord[]).map((item) => [item.id, item]),
    );
    const enriched = pageItemIds.flatMap((id) => {
      const item = agreementsById.get(id);
      if (!item) return [];
      return [
        {
          ...item,
          receivables: sourcesByAgreement.get(item.id) ?? [],
          events: eventsByAgreement.get(item.id) ?? [],
          progress: progressByAgreement.get(item.id) ?? null,
        },
      ];
    });
    return c.json(
      explicitPagination
        ? {
            items: enriched,
            page: query.page,
            pageSize: query.pageSize,
            total,
            totalPages: total ? Math.ceil(total / query.pageSize) : 0,
            hasNextPage: query.page * query.pageSize < total,
            hasPreviousPage: query.page > 1,
          }
        : enriched,
    );
  });

  router.post('/:id/payment-agreements', async (c) => {
    const parsed = paymentAgreementCreateSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const condominiumId = uuidSchema.parse(c.req.param('id'));
    const value = parsed.data;
    const response = await rpc(c, 'create_payment_agreement', {
      target_condominium: condominiumId,
      target_unit: value.unitId,
      target_legal_obligor: value.legalObligorPersonId ?? null,
      target_currency: value.currencyCode,
      target_schedule: schedule(value.installments),
      target_receivable_ids: value.receivableItemIds,
      target_reason: value.reason ?? null,
      target_idempotency_key: value.idempotencyKey,
    });
    if (!response.ok) return failure(c, response);
    return c.json(await response.json(), 201);
  });

  router.post('/:id/payment-agreements/:agreementId/transition', async (c) => {
    uuidSchema.parse(c.req.param('id'));
    const agreementId = uuidSchema.parse(c.req.param('agreementId'));
    const parsed = paymentAgreementTransitionSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const value = parsed.data;
    const response = await rpc(c, 'transition_payment_agreement', {
      target_agreement: agreementId,
      target_action: value.action,
      target_schedule: value.installments ? schedule(value.installments) : null,
      target_reason: value.reason ?? null,
      expected_version: value.expectedVersion ?? null,
    });
    if (!response.ok) return failure(c, response);
    return c.json(await response.json());
  });
}
