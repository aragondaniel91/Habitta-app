import type { Payment } from '../features/payments/types';
import { paymentStatusLabels } from './payments';

export type PaymentTableSortField = 'date' | 'unit' | 'payer' | 'method' | 'status' | 'amount';
export type PaymentTableSort = { field: PaymentTableSortField; direction: 'asc' | 'desc' };

export const defaultPaymentTableSort: PaymentTableSort = { field: 'date', direction: 'desc' };

export const nextPaymentTableSort = (
  current: PaymentTableSort,
  field: PaymentTableSortField,
): PaymentTableSort =>
  current.field === field
    ? { field, direction: current.direction === 'asc' ? 'desc' : 'asc' }
    : { field, direction: field === 'date' || field === 'amount' ? 'desc' : 'asc' };

export const paymentTableSortValue = (sort: PaymentTableSort) => sort.field + '-' + sort.direction;

export const paymentTableSortFromValue = (value: string): PaymentTableSort => {
  const [field, direction] = value.split('-');
  if (
    ['date', 'unit', 'payer', 'method', 'status', 'amount'].includes(field ?? '') &&
    (direction === 'asc' || direction === 'desc')
  )
    return { field: field as PaymentTableSortField, direction };
  return defaultPaymentTableSort;
};

/** Sort decimal-string amounts without floating-point rounding or currency conversion. */
const decimalAsBigInt = (raw: unknown) => {
  // PostgREST serializes numeric as either a JSON string or a number.
  const normalized =
    typeof raw === 'string'
      ? raw.trim()
      : typeof raw === 'number' && Number.isFinite(raw)
        ? String(raw)
        : '';
  const match = /^(-?)(\d+)(?:\.(\d{1,6}))?$/.exec(normalized);
  if (!match) return 0n;
  const number = BigInt(match[2]!) * 1_000_000n + BigInt((match[3] ?? '').padEnd(6, '0') || '0');
  return match[1] === '-' ? -number : number;
};

const compareText = (left: string, right: string) =>
  left.localeCompare(right, 'es', { numeric: true, sensitivity: 'base' });

export function sortPaymentTableRows(
  rows: Payment[],
  sort: PaymentTableSort,
  unitCodes: Map<string, string>,
  methodNames: Map<string, string>,
): Payment[] {
  const sign = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((left, right) => {
    let compare = 0;
    switch (sort.field) {
      case 'date':
        compare = left.payment_date.localeCompare(right.payment_date);
        break;
      case 'unit':
        compare = compareText(
          unitCodes.get(left.unit_id) ?? '',
          unitCodes.get(right.unit_id) ?? '',
        );
        break;
      case 'payer':
        compare = compareText(left.payer_name, right.payer_name);
        break;
      case 'method':
        compare = compareText(
          methodNames.get(left.payment_method_id) ?? '',
          methodNames.get(right.payment_method_id) ?? '',
        );
        break;
      case 'status':
        compare = compareText(
          paymentStatusLabels[left.status] ?? left.status,
          paymentStatusLabels[right.status] ?? right.status,
        );
        break;
      case 'amount': {
        const leftAmount = decimalAsBigInt(left.original_amount);
        const rightAmount = decimalAsBigInt(right.original_amount);
        compare = leftAmount > rightAmount ? 1 : leftAmount < rightAmount ? -1 : 0;
        break;
      }
    }
    return (
      sign * compare ||
      right.payment_date.localeCompare(left.payment_date) ||
      right.id.localeCompare(left.id)
    );
  });
}

export function filterPaymentTableColumns(
  rows: Payment[],
  selection: { unitId: string; dateFrom: string; dateTo: string; status?: string },
) {
  return rows.filter((payment) => {
    if (selection.unitId && payment.unit_id !== selection.unitId) return false;
    const date = payment.payment_date.slice(0, 10);
    if (selection.dateFrom && date < selection.dateFrom) return false;
    if (selection.dateTo && date > selection.dateTo) return false;
    if (selection.status && payment.status !== selection.status) return false;
    return true;
  });
}
