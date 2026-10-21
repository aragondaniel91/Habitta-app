import { describe, expect, it } from 'vitest';
import { buildReviewQueueQuery } from './payment-review-query';

const condominiumId = '22222222-2222-4222-8222-222222222221';
const unitId = '33333333-3333-4333-8333-333333333331';

describe('RLS-scoped paginated review queue', () => {
  it('always limits the queue to the selected tenant and reviewable statuses', () => {
    const query = buildReviewQueueQuery(condominiumId, {});
    expect(query.ok).toBe(true);
    if (!query.ok) return;
    expect(query).toMatchObject({ page: 1, pageSize: 10, offset: 0 });
    expect(query.path).toContain('condominium_id=eq.' + condominiumId);
    expect(query.path).toContain('status=in.(submitted,under_review)');
    expect(query.path).toContain('order=submitted_at.asc,id.asc');
    expect(query.path).toContain('limit=10&offset=0');
  });

  it('applies all supplied filters before limit/offset and uses a stable order', () => {
    const query = buildReviewQueueQuery(condominiumId, {
      page: '3',
      pageSize: '10',
      unitId,
      currencyCode: 'USD',
      status: 'under_review',
      dateFrom: '2026-10-01',
      dateTo: '2026-10-21',
      search: 'Ana Perez',
      sortBy: 'amount',
      sortDir: 'desc',
    });
    expect(query.ok).toBe(true);
    if (!query.ok) return;
    expect(query).toMatchObject({ page: 3, pageSize: 10, offset: 20 });
    expect(query.path).toContain('status=eq.under_review');
    expect(query.path).toContain('unit_id=eq.' + unitId);
    expect(query.path).toContain('original_currency_code=eq.USD');
    expect(query.path).toContain('payment_date=gte.2026-10-01');
    expect(query.path).toContain('payment_date=lte.2026-10-21');
    expect(query.path).toContain('payer_name.ilike.*Ana%20Perez*');
    expect(query.path).toContain('order=original_amount.desc,id.desc');
    expect(query.path).toContain('limit=10&offset=20');
  });

  it('sorts by the related unit code without interpolating arbitrary fields', () => {
    const query = buildReviewQueueQuery(condominiumId, {
      sortBy: 'unit',
      sortDir: 'asc',
    });
    expect(query.ok).toBe(true);
    if (query.ok) {
      expect(query.path).toContain('select=*,units(code)');
      expect(query.path).toContain('order=units(code).asc,id.asc');
    }
  });

  it.each([
    { page: '0' },
    { page: '-1' },
    { page: '1.2' },
    { pageSize: '101' },
    { pageSize: '0' },
    { pageSize: 'NaN' },
    { status: 'draft' },
    { status: 'approved' },
    { status: 'reversed' },
    { statusGroup: 'pending' },
    { sortBy: 'id;delete' },
    { sortDir: 'desc' },
    { currencyCode: 'USD);or=(status.eq.approved)' },
    { dateFrom: '2026-11-02', dateTo: '2026-10-01' },
    { search: 'test,or(status.eq.approved)' },
  ])('rejects unsafe/unreviewable filters %j', (params) => {
    expect(buildReviewQueueQuery(condominiumId, params)).toMatchObject({ ok: false });
  });

  it('does not accept a fabricated tenant filter from query params', () => {
    const query = buildReviewQueueQuery(condominiumId, {
      condominiumId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
    expect(query.ok).toBe(true);
    if (query.ok) {
      expect(query.path).toContain('condominium_id=eq.' + condominiumId);
      expect(query.path).not.toContain('aaaaaaaa-aaaa');
    }
  });
});
