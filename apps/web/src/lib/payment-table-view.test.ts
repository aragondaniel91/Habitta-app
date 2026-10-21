import { describe, expect, it } from 'vitest';
import type { Payment } from '../features/payments/types';
import {
  filterPaymentTableColumns,
  nextPaymentTableSort,
  paymentTableSortFromValue,
  sortPaymentTableRows,
} from './payment-table-view';

const rows: Payment[] = [
  {
    id: '1',
    status: 'submitted',
    original_amount: '100.01',
    original_currency_code: 'USD',
    payment_date: '2026-10-01',
    payer_name: 'Zoe',
    unit_id: 'u2',
    payment_method_id: 'm1',
  },
  {
    id: '2',
    status: 'approved',
    original_amount: '9.95',
    original_currency_code: 'USD',
    payment_date: '2026-10-17',
    payer_name: 'Ana',
    unit_id: 'u1',
    payment_method_id: 'm2',
  },
  {
    id: '3',
    status: 'under_review',
    original_amount: '100.001',
    original_currency_code: 'USD',
    payment_date: '2026-10-09',
    payer_name: 'Luis',
    unit_id: 'u3',
    payment_method_id: 'm1',
  },
];
const units = new Map([
  ['u1', 'A-2'],
  ['u2', 'A-10'],
  ['u3', 'B-1'],
]);
const methods = new Map([
  ['m1', 'Transferencia'],
  ['m2', 'Pago móvil'],
]);
const ids = (r: Payment[]) => r.map((row) => row.id);

describe('payment table column controls', () => {
  it('sorts dates and unit codes before pagination with stable tie breaking', () => {
    expect(
      ids(sortPaymentTableRows(rows, { field: 'date', direction: 'desc' }, units, methods)),
    ).toEqual(['2', '3', '1']);
    expect(
      ids(sortPaymentTableRows(rows, { field: 'unit', direction: 'asc' }, units, methods)),
    ).toEqual(['2', '1', '3']);
    expect(
      ids(sortPaymentTableRows(rows, { field: 'payer', direction: 'asc' }, units, methods)),
    ).toEqual(['2', '3', '1']);
  });

  it('compares decimal string amounts exactly, never through JS Number or mixed currencies', () => {
    expect(
      ids(sortPaymentTableRows(rows, { field: 'amount', direction: 'desc' }, units, methods)),
    ).toEqual(['1', '3', '2']);
    expect(
      ids(sortPaymentTableRows(rows, { field: 'amount', direction: 'asc' }, units, methods)),
    ).toEqual(['2', '3', '1']);
  });

  it('handles PostgreSQL numeric JSON values at the API boundary', () => {
    const mixed = rows.map((payment, index) => ({
      ...payment,
      original_amount: (index === 0 ? 100.01 : payment.original_amount) as string,
    }));
    expect(
      ids(sortPaymentTableRows(mixed, { field: 'amount', direction: 'desc' }, units, methods)),
    ).toEqual(['1', '3', '2']);
  });

  it('filters by unit, inclusive ISO date range, and status without affecting input rows', () => {
    expect(
      ids(
        filterPaymentTableColumns(rows, {
          unitId: 'u1',
          dateFrom: '2026-10-01',
          dateTo: '2026-10-31',
        }),
      ),
    ).toEqual(['2']);
    expect(
      ids(
        filterPaymentTableColumns(rows, {
          unitId: '',
          dateFrom: '2026-10-09',
          dateTo: '2026-10-17',
          status: 'under_review',
        }),
      ),
    ).toEqual(['3']);
    expect(rows).toHaveLength(3);
  });

  it('toggles a header between ascending and descending and rejects invalid sort options', () => {
    expect(nextPaymentTableSort({ field: 'date', direction: 'desc' }, 'date')).toEqual({
      field: 'date',
      direction: 'asc',
    });
    expect(nextPaymentTableSort({ field: 'date', direction: 'desc' }, 'unit')).toEqual({
      field: 'unit',
      direction: 'asc',
    });
    expect(paymentTableSortFromValue('amount-desc')).toEqual({
      field: 'amount',
      direction: 'desc',
    });
    expect(paymentTableSortFromValue('unsafe-x')).toEqual({ field: 'date', direction: 'desc' });
  });
});
