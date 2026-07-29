export type DashboardUnit = {
  id: string;
  code: string;
  status: string;
  type?: string;
};

export type DashboardBuilding = {
  id: string;
  name: string;
};

export type DashboardPerson = {
  id: string;
  first_name: string;
  last_name: string;
  status?: string;
};

export type ReceivableSummary = {
  currency_code: string;
  net_outstanding: string;
  total_debits: string;
  total_credits: string;
};

export type ReceivableAging = {
  currency_code: string;
  current_amount: string;
  days_1_30: string;
  days_31_60: string;
  days_61_90: string;
  over_90: string;
};

export type DashboardReceivable = {
  id: string;
  unit_id: string;
  description: string;
  currency_code: string;
  outstanding_amount: string;
  original_amount?: string;
  amount?: string;
  status: string;
  issue_date?: string;
  due_date?: string;
  created_at?: string;
};

export type DashboardPayment = {
  id: string;
  unit_id: string;
  payer_name: string;
  status: string;
  original_amount: string;
  original_currency_code: string;
  payment_date: string;
  submitted_at?: string;
  created_at?: string;
};

export type DashboardActivity = {
  id: string;
  kind: 'receivable' | 'payment';
  title: string;
  detail: string;
  amount: string;
  currencyCode: string;
  status: string;
  date: string;
};

export type AgingBucket = {
  key: 'current' | 'days_1_30' | 'days_31_60' | 'days_61_90' | 'over_90';
  label: string;
  amount: string;
  numericAmount: number;
};

export type MonthlyFinancialPoint = {
  key: string;
  label: string;
  collections: number;
  charges: number;
};

export type RecentPayment = {
  id: string;
  payer: string;
  unitCode: string;
  amount: string;
  currencyCode: string;
  status: string;
  date: string;
};

const numeric = (value: string | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const dateKey = (value: string | undefined) => {
  if (!value) return '';
  const match = /^(\d{4})-(\d{2})/.exec(value);
  return match ? `${match[1]}-${match[2]}` : '';
};

const monthKey = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

export function formatDashboardAmount(value: string | number, currencyCode: string) {
  const parsed = typeof value === 'number' ? value : numeric(value);
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: currencyCode,
    currencyDisplay: 'code',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parsed);
}

export function formatDashboardDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function sortReceivableSummaries(rows: ReceivableSummary[]) {
  const priority = new Map([
    ['USD', 0],
    ['VES', 1],
  ]);
  return [...rows].sort((left, right) => {
    const leftPriority = priority.get(left.currency_code) ?? 99;
    const rightPriority = priority.get(right.currency_code) ?? 99;
    return leftPriority - rightPriority || left.currency_code.localeCompare(right.currency_code);
  });
}

export function getDashboardCurrencies(
  summaries: ReceivableSummary[],
  aging: ReceivableAging[],
  receivables: DashboardReceivable[],
  payments: DashboardPayment[],
) {
  const codes = new Set<string>();
  summaries.forEach((row) => codes.add(row.currency_code));
  aging.forEach((row) => codes.add(row.currency_code));
  receivables.forEach((row) => codes.add(row.currency_code));
  payments.forEach((row) => codes.add(row.original_currency_code));
  return sortReceivableSummaries(
    [...codes].map((currencyCode) => ({
      currency_code: currencyCode,
      net_outstanding: '0',
      total_debits: '0',
      total_credits: '0',
    })),
  ).map((row) => row.currency_code);
}

export function getAgingBuckets(row: ReceivableAging): AgingBucket[] {
  return [
    {
      key: 'current',
      label: 'Al día',
      amount: row.current_amount,
      numericAmount: numeric(row.current_amount),
    },
    {
      key: 'days_1_30',
      label: '1–30 días',
      amount: row.days_1_30,
      numericAmount: numeric(row.days_1_30),
    },
    {
      key: 'days_31_60',
      label: '31–60 días',
      amount: row.days_31_60,
      numericAmount: numeric(row.days_31_60),
    },
    {
      key: 'days_61_90',
      label: '61–90 días',
      amount: row.days_61_90,
      numericAmount: numeric(row.days_61_90),
    },
    {
      key: 'over_90',
      label: 'Más de 90 días',
      amount: row.over_90,
      numericAmount: numeric(row.over_90),
    },
  ];
}

export function getAgingTotal(row: ReceivableAging) {
  return getAgingBuckets(row).reduce((total, bucket) => total + bucket.numericAmount, 0);
}

export function getOverdueTotal(row: ReceivableAging) {
  return getAgingBuckets(row)
    .filter((bucket) => bucket.key !== 'current')
    .reduce((total, bucket) => total + bucket.numericAmount, 0);
}

export function getDelinquencyRate(row: ReceivableAging | undefined) {
  if (!row) return 0;
  const total = getAgingTotal(row);
  return total > 0 ? (getOverdueTotal(row) / total) * 100 : 0;
}

export function getCollectionsThisMonth(
  payments: DashboardPayment[],
  currencyCode: string,
  referenceDate = new Date(),
) {
  const target = monthKey(referenceDate);
  return payments
    .filter(
      (payment) =>
        payment.status === 'approved' &&
        payment.original_currency_code === currencyCode &&
        dateKey(payment.payment_date || payment.created_at) === target,
    )
    .reduce((total, payment) => total + numeric(payment.original_amount), 0);
}

export function buildMonthlyFinancialSeries(
  receivables: DashboardReceivable[],
  payments: DashboardPayment[],
  currencyCode: string,
  referenceDate = new Date(),
  monthCount = 6,
): MonthlyFinancialPoint[] {
  const safeCount = Math.max(1, monthCount);
  const keys = Array.from({ length: safeCount }, (_, index) => {
    const offset = safeCount - index - 1;
    return monthKey(
      new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() - offset, 1)),
    );
  });
  const points = new Map(
    keys.map((key) => {
      const date = new Date(`${key}-01T12:00:00Z`);
      const label = new Intl.DateTimeFormat('es-VE', { month: 'short' })
        .format(date)
        .replace('.', '');
      return [key, { key, label, collections: 0, charges: 0 } satisfies MonthlyFinancialPoint];
    }),
  );

  payments.forEach((payment) => {
    if (payment.status !== 'approved' || payment.original_currency_code !== currencyCode) return;
    const key = dateKey(payment.payment_date || payment.created_at);
    const point = points.get(key);
    if (point) point.collections += numeric(payment.original_amount);
  });

  receivables.forEach((receivable) => {
    if (receivable.status === 'reversed' || receivable.currency_code !== currencyCode) return;
    const key = dateKey(receivable.issue_date ?? receivable.created_at ?? receivable.due_date);
    const point = points.get(key);
    if (point)
      point.charges += numeric(
        receivable.original_amount ?? receivable.amount ?? receivable.outstanding_amount,
      );
  });

  return keys.map((key) => points.get(key)!).filter(Boolean);
}

export function getRecentPayments(
  payments: DashboardPayment[],
  units: DashboardUnit[],
  limit = 4,
): RecentPayment[] {
  const unitCodes = new Map(units.map((unit) => [unit.id, unit.code]));
  return [...payments]
    .filter((payment) => Boolean(payment.payment_date || payment.created_at))
    .sort((left, right) => {
      const leftDate = left.submitted_at ?? left.created_at ?? left.payment_date;
      const rightDate = right.submitted_at ?? right.created_at ?? right.payment_date;
      return rightDate.localeCompare(leftDate);
    })
    .slice(0, limit)
    .map((payment) => ({
      id: payment.id,
      payer: payment.payer_name || 'Pago registrado',
      unitCode: unitCodes.get(payment.unit_id) ?? 'Sin unidad',
      amount: payment.original_amount,
      currencyCode: payment.original_currency_code,
      status: payment.status,
      date: payment.submitted_at ?? payment.created_at ?? payment.payment_date,
    }));
}

export function buildRecentActivity(
  receivables: DashboardReceivable[],
  payments: DashboardPayment[],
  units: DashboardUnit[],
  limit = 8,
): DashboardActivity[] {
  const unitCodes = new Map(units.map((unit) => [unit.id, unit.code]));
  const receivableActivity = receivables.map<DashboardActivity>((item) => ({
    id: `receivable-${item.id}`,
    kind: 'receivable',
    title: item.description || 'Cargo emitido',
    detail: `Unidad ${unitCodes.get(item.unit_id) ?? 'sin identificar'}`,
    amount: item.outstanding_amount,
    currencyCode: item.currency_code,
    status: item.status,
    date: item.issue_date ?? item.created_at ?? item.due_date ?? '',
  }));
  const paymentActivity = payments.map<DashboardActivity>((item) => ({
    id: `payment-${item.id}`,
    kind: 'payment',
    title: item.payer_name || 'Pago registrado',
    detail: `Unidad ${unitCodes.get(item.unit_id) ?? 'sin identificar'}`,
    amount: item.original_amount,
    currencyCode: item.original_currency_code,
    status: item.status,
    date: item.submitted_at ?? item.created_at ?? item.payment_date,
  }));

  return [...receivableActivity, ...paymentActivity]
    .filter((item) => Boolean(item.date))
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, limit);
}
