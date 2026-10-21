import { z } from 'zod';
import { buildPaymentHistoryFilters } from './payment-history-query';

const reviewPageSchema = z.object({
  page: z.coerce.number().int().min(1).max(100000),
  pageSize: z.coerce.number().int().min(1).max(100),
});

export type ReviewQueueQuery =
  | { ok: true; path: string; page: number; pageSize: number; offset: number }
  | { ok: false; error: string };

export function buildReviewQueueQuery(
  condominiumId: string,
  raw: Record<string, string | undefined>,
): ReviewQueueQuery {
  const pagination = reviewPageSchema.safeParse({
    page: raw.page ?? '1',
    pageSize: raw.pageSize ?? '10',
  });
  if (!pagination.success) return { ok: false, error: 'Invalid review queue pagination' };
  // Reviewers may filter only reviewable statuses, never drafts, reversals or
  // another tenant. We validate and then enforce the queue status on the server.
  if (raw.status && raw.status !== 'submitted' && raw.status !== 'under_review')
    return { ok: false, error: 'Invalid review queue status' };
  if (raw.statusGroup) return { ok: false, error: 'Invalid review queue status group' };

  const filters = buildPaymentHistoryFilters({
    unitId: raw.unitId,
    methodId: raw.methodId,
    currencyCode: raw.currencyCode,
    dateFrom: raw.dateFrom,
    dateTo: raw.dateTo,
    search: raw.search,
    sortBy: raw.sortBy,
    sortDir: raw.sortDir,
  });
  if (!filters.ok) return filters;
  const { page, pageSize } = pagination.data;
  const offset = (page - 1) * pageSize;
  const statusFilter = raw.status
    ? 'status=eq.' + raw.status
    : 'status=in.(submitted,under_review)';
  const order = raw.sortBy ? filters.order : 'submitted_at.asc,id.asc';
  return {
    ok: true,
    page,
    pageSize,
    offset,
    path:
      `payments?condominium_id=eq.${condominiumId}&${statusFilter}${filters.filter}` +
      `&select=${filters.select}&order=${order}&limit=${pageSize}&offset=${offset}`,
  };
}
