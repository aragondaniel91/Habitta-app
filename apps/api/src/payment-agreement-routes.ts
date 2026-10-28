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
    minAmount: z.coerce.number().finite().min(0).optional(),
    maxAmount: z.coerce.number().finite().min(0).optional(),
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
      value.minAmount > value.maxAmount
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
  schedule: { due_date: string; amount: string }[];
  updated_at: string;
  [key: string]: unknown;
};

const AGREEMENT_READ_PAGE_SIZE = 500;
const AGREEMENT_READ_MAX_ROWS = 50_000;
const scheduleFacts = (agreement: AgreementRecord) => {
  const dueDates = agreement.schedule
    .map((item) => item.due_date)
    .filter(Boolean)
    .sort();
  return {
    amount: agreement.schedule.reduce((total, item) => total + Number(item.amount || 0), 0),
    firstDueDate: dueDates[0] ?? '',
    lastDueDate: dueDates.at(-1) ?? '',
  };
};
const nextDay = (date: string) => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
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
    const filters = [
      `condominium_id=eq.${condominiumId}`,
      ...(query.unitId ? [`unit_id=eq.${query.unitId}`] : []),
      ...(query.personId ? [`legal_obligor_person_id=eq.${query.personId}`] : []),
      ...(query.status ? [`status=eq.${query.status}`] : []),
      ...(query.dateFrom ? [`updated_at=gte.${query.dateFrom}T00:00:00.000Z`] : []),
      ...(query.dateTo ? [`updated_at=lt.${nextDay(query.dateTo)}T00:00:00.000Z`] : []),
    ];
    const items: AgreementRecord[] = [];
    for (let offset = 0; ; offset += AGREEMENT_READ_PAGE_SIZE) {
      const agreements = await rest(
        c,
        `payment_agreements?${filters.join('&')}&select=*&order=updated_at.desc,id.desc&limit=${AGREEMENT_READ_PAGE_SIZE}&offset=${offset}`,
      );
      if (!agreements.ok) return failure(c, agreements);
      const page = (await agreements.json()) as AgreementRecord[];
      items.push(...page);
      if (items.length > AGREEMENT_READ_MAX_ROWS)
        return c.json({ error: 'Agreement history requires narrower filters' }, 413);
      if (page.length < AGREEMENT_READ_PAGE_SIZE) break;
    }
    const filtered = items
      .map((item) => ({ item, facts: scheduleFacts(item) }))
      .filter(({ facts }) => {
        if (query.minAmount !== undefined && facts.amount < query.minAmount) return false;
        if (query.maxAmount !== undefined && facts.amount > query.maxAmount) return false;
        if (query.periodFrom && (!facts.firstDueDate || facts.firstDueDate < query.periodFrom))
          return false;
        if (query.periodTo && (!facts.lastDueDate || facts.lastDueDate > query.periodTo))
          return false;
        return true;
      })
      .sort((left, right) => {
        const direction = query.sort.endsWith('Asc') ? 1 : -1;
        const leftValue = query.sort.startsWith('amount')
          ? left.facts.amount
          : query.sort.startsWith('period')
            ? left.facts.firstDueDate
            : left.item.updated_at;
        const rightValue = query.sort.startsWith('amount')
          ? right.facts.amount
          : query.sort.startsWith('period')
            ? right.facts.firstDueDate
            : right.item.updated_at;
        return leftValue < rightValue ? -direction : leftValue > rightValue ? direction : 0;
      });
    const total = filtered.length;
    const pageItems = explicitPagination
      ? filtered
          .slice((query.page - 1) * query.pageSize, query.page * query.pageSize)
          .map(({ item }) => item)
      : filtered.map(({ item }) => item);
    if (!pageItems.length) {
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
    const pageItemIds = pageItems.map((item) => item.id);
    const ids = pageItemIds.join(',');
    const [sources, events, progress] = await Promise.all([
      rest(c, `payment_agreement_receivables?agreement_id=in.(${ids})&select=*`),
      rest(
        c,
        `payment_agreement_events?agreement_id=in.(${ids})&select=*&order=sequence_number.asc`,
      ),
      rest(c, `payment_agreement_progress?agreement_id=in.(${ids})&select=*`),
    ]);
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
    const enriched = pageItems.map((item) => ({
      ...item,
      receivables: sourcesByAgreement.get(item.id) ?? [],
      events: eventsByAgreement.get(item.id) ?? [],
      progress: progressByAgreement.get(item.id) ?? null,
    }));
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
