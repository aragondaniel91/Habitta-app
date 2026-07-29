import type {
  DashboardPayment,
  DashboardReceivable,
  DashboardUnit,
  ReceivableAging,
  ReceivableSummary,
} from './dashboard';
import { getAgingBuckets } from './dashboard';

export type ReportPeriod = 3 | 6 | 12;

export type UnitFinancialRow = {
  unitId: string;
  unitCode: string;
  charges: number;
  collections: number;
  outstanding: number;
  overdue: number;
  paymentCount: number;
  openItemCount: number;
};

export type PaymentStatusRow = {
  status: string;
  count: number;
  amount: number;
};

const numeric = (value: string | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const reportDate = (value: string | undefined) => {
  if (!value) return undefined;
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const rangeStart = (months: ReportPeriod, referenceDate: Date) =>
  new Date(
    Date.UTC(
      referenceDate.getUTCFullYear(),
      referenceDate.getUTCMonth() - Math.max(0, months - 1),
      1,
    ),
  );

const isInsidePeriod = (value: string | undefined, months: ReportPeriod, referenceDate: Date) => {
  const date = reportDate(value);
  if (!date) return false;
  return date >= rangeStart(months, referenceDate) && date <= referenceDate;
};

const receivableAmount = (item: DashboardReceivable) =>
  numeric(item.original_amount ?? item.amount ?? item.outstanding_amount);

export function getReportCurrencies(
  summaries: ReceivableSummary[],
  aging: ReceivableAging[],
  receivables: DashboardReceivable[],
  payments: DashboardPayment[],
) {
  const currencies = new Set<string>();
  summaries.forEach((row) => currencies.add(row.currency_code));
  aging.forEach((row) => currencies.add(row.currency_code));
  receivables.forEach((row) => currencies.add(row.currency_code));
  payments.forEach((row) => currencies.add(row.original_currency_code));
  return [...currencies].filter(Boolean).sort((left, right) => {
    const priority = new Map([
      ['USD', 0],
      ['VES', 1],
    ]);
    return (priority.get(left) ?? 99) - (priority.get(right) ?? 99) || left.localeCompare(right);
  });
}

export function getPeriodFinancialTotals(
  receivables: DashboardReceivable[],
  payments: DashboardPayment[],
  currencyCode: string,
  months: ReportPeriod,
  referenceDate = new Date(),
) {
  const charges = receivables
    .filter(
      (item) =>
        item.status !== 'reversed' &&
        item.currency_code === currencyCode &&
        isInsidePeriod(item.issue_date ?? item.created_at ?? item.due_date, months, referenceDate),
    )
    .reduce((total, item) => total + receivableAmount(item), 0);
  const collections = payments
    .filter(
      (payment) =>
        payment.status === 'approved' &&
        payment.original_currency_code === currencyCode &&
        isInsidePeriod(payment.payment_date ?? payment.created_at, months, referenceDate),
    )
    .reduce((total, payment) => total + numeric(payment.original_amount), 0);

  return {
    charges,
    collections,
    collectionRate: charges > 0 ? (collections / charges) * 100 : 0,
  };
}

export function getPortfolioTotals(
  summaries: ReceivableSummary[],
  aging: ReceivableAging[],
  currencyCode: string,
) {
  const summary = summaries.find((row) => row.currency_code === currencyCode);
  const agingRow = aging.find((row) => row.currency_code === currencyCode);
  const overdue = agingRow
    ? getAgingBuckets(agingRow)
        .filter((bucket) => bucket.key !== 'current')
        .reduce((total, bucket) => total + bucket.numericAmount, 0)
    : 0;

  return {
    outstanding: numeric(summary?.net_outstanding),
    overdue,
  };
}

export function buildUnitFinancialRows(
  units: DashboardUnit[],
  receivables: DashboardReceivable[],
  payments: DashboardPayment[],
  currencyCode: string,
  months: ReportPeriod,
  referenceDate = new Date(),
): UnitFinancialRow[] {
  const rows = new Map(
    units.map((unit) => [
      unit.id,
      {
        unitId: unit.id,
        unitCode: unit.code,
        charges: 0,
        collections: 0,
        outstanding: 0,
        overdue: 0,
        paymentCount: 0,
        openItemCount: 0,
      } satisfies UnitFinancialRow,
    ]),
  );
  const referenceDay = referenceDate.toISOString().slice(0, 10);

  receivables.forEach((item) => {
    if (item.currency_code !== currencyCode || item.status === 'reversed') return;
    const row = rows.get(item.unit_id);
    if (!row) return;
    if (
      isInsidePeriod(item.issue_date ?? item.created_at ?? item.due_date, months, referenceDate)
    ) {
      row.charges += receivableAmount(item);
    }
    const outstanding = numeric(item.outstanding_amount);
    row.outstanding += outstanding;
    if (outstanding > 0) row.openItemCount += 1;
    if (outstanding > 0 && item.due_date && item.due_date < referenceDay)
      row.overdue += outstanding;
  });

  payments.forEach((payment) => {
    if (
      payment.status !== 'approved' ||
      payment.original_currency_code !== currencyCode ||
      !isInsidePeriod(payment.payment_date ?? payment.created_at, months, referenceDate)
    ) {
      return;
    }
    const row = rows.get(payment.unit_id);
    if (!row) return;
    row.collections += numeric(payment.original_amount);
    row.paymentCount += 1;
  });

  return [...rows.values()].sort(
    (left, right) =>
      right.outstanding - left.outstanding ||
      right.overdue - left.overdue ||
      left.unitCode.localeCompare(right.unitCode),
  );
}

export function buildPaymentStatusRows(
  payments: DashboardPayment[],
  currencyCode: string,
  months: ReportPeriod,
  referenceDate = new Date(),
): PaymentStatusRow[] {
  const rows = new Map<string, PaymentStatusRow>();
  payments.forEach((payment) => {
    if (
      payment.original_currency_code !== currencyCode ||
      !isInsidePeriod(payment.payment_date ?? payment.created_at, months, referenceDate)
    ) {
      return;
    }
    const current = rows.get(payment.status) ?? {
      status: payment.status,
      count: 0,
      amount: 0,
    };
    current.count += 1;
    current.amount += numeric(payment.original_amount);
    rows.set(payment.status, current);
  });
  return [...rows.values()].sort(
    (left, right) => right.count - left.count || right.amount - left.amount,
  );
}

const escapeCsv = (value: string | number) => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function createUnitReportCsv(rows: UnitFinancialRow[], currencyCode: string) {
  const header = [
    'unit_code',
    'currency_code',
    'charges',
    'collections',
    'outstanding',
    'overdue',
    'payment_count',
    'open_item_count',
  ];
  const body = rows.map((row) =>
    [
      row.unitCode,
      currencyCode,
      row.charges.toFixed(2),
      row.collections.toFixed(2),
      row.outstanding.toFixed(2),
      row.overdue.toFixed(2),
      row.paymentCount,
      row.openItemCount,
    ]
      .map(escapeCsv)
      .join(','),
  );
  return [header.join(','), ...body].join('\n');
}
