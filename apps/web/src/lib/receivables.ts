import type { DashboardReceivable, ReceivableAging, ReceivableSummary } from './dashboard';

export type ReceivableUnit = {
  id: string;
  code: string;
  building_id: string | null;
  status?: string;
};

export type ChargeConcept = {
  id: string;
  code: string;
  name: string;
  description?: string;
  category: string;
  default_currency_code?: string;
  default_amount?: string;
  is_active?: boolean;
};

export type ReceivableItem = DashboardReceivable & {
  concept_id?: string;
  reversal_reason?: string;
};

export type ReceivableFilters = {
  query: string;
  unitId: string;
  conceptId: string;
  currencyCode: string;
  status: string;
  due: '' | 'overdue' | 'upcoming' | 'without_due_date';
};

export type AgingSegment = {
  key: 'current' | 'days_1_30' | 'days_31_60' | 'days_61_90' | 'over_90';
  label: string;
  amount: number;
  percentage: number;
};

export const receivableStatusLabels: Record<string, string> = {
  open: 'Pendiente',
  partially_paid: 'Pago parcial',
  paid: 'Pagado',
  settled: 'Saldado',
  reversed: 'Reversado',
};

export const conceptCategoryLabels: Record<string, string> = {
  regular_dues: 'Cuota regular',
  extraordinary_dues: 'Cuota extraordinaria',
  service: 'Servicio',
  penalty: 'Penalidad',
  adjustment: 'Ajuste',
  opening_balance: 'Saldo inicial',
  other: 'Otro',
};

const normalized = (value: string | undefined) =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export const numericAmount = (value: string | number | undefined) => {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const isSettledReceivable = (item: Pick<ReceivableItem, 'status'>) =>
  ['paid', 'settled', 'reversed'].includes(item.status);

export function getReceivableDueState(
  item: Pick<ReceivableItem, 'due_date' | 'status'>,
  today = new Date().toISOString().slice(0, 10),
) {
  if (isSettledReceivable(item)) return 'settled' as const;
  if (!item.due_date) return 'without_due_date' as const;
  return item.due_date < today ? ('overdue' as const) : ('upcoming' as const);
}

export function getUnitCode(unitId: string, units: ReceivableUnit[]) {
  return units.find((unit) => unit.id === unitId)?.code ?? 'Unidad no disponible';
}

export function getConceptName(conceptId: string | undefined, concepts: ChargeConcept[]) {
  if (!conceptId) return 'Cargo manual';
  return concepts.find((concept) => concept.id === conceptId)?.name ?? 'Concepto no disponible';
}

export function filterReceivables(
  items: ReceivableItem[],
  units: ReceivableUnit[],
  concepts: ChargeConcept[],
  filters: ReceivableFilters,
  today?: string,
) {
  const queryTokens = normalized(filters.query).split(/\s+/).filter(Boolean);

  return items.filter((item) => {
    const unitCode = getUnitCode(item.unit_id, units);
    const conceptName = getConceptName(item.concept_id, concepts);
    const searchable = normalized(`${item.description} ${unitCode} ${conceptName}`);
    const dueState = getReceivableDueState(item, today);
    const matchesQuery = queryTokens.every((token) => searchable.includes(token));
    const matchesStatus =
      !filters.status ||
      (filters.status === 'settled'
        ? ['paid', 'settled'].includes(item.status)
        : item.status === filters.status);

    return (
      matchesQuery &&
      (!filters.unitId || item.unit_id === filters.unitId) &&
      (!filters.conceptId || item.concept_id === filters.conceptId) &&
      (!filters.currencyCode || item.currency_code === filters.currencyCode) &&
      matchesStatus &&
      (!filters.due || dueState === filters.due)
    );
  });
}

export function getReceivableCurrencies(
  summaries: ReceivableSummary[],
  aging: ReceivableAging[],
  items: ReceivableItem[],
) {
  const currencies = new Set<string>();
  summaries.forEach((row) => currencies.add(row.currency_code));
  aging.forEach((row) => currencies.add(row.currency_code));
  items.forEach((item) => currencies.add(item.currency_code));

  const priority = new Map([
    ['USD', 0],
    ['VES', 1],
  ]);

  return [...currencies].sort((left, right) => {
    const leftPriority = priority.get(left) ?? 99;
    const rightPriority = priority.get(right) ?? 99;
    return leftPriority - rightPriority || left.localeCompare(right);
  });
}

export function getSummaryForCurrency(rows: ReceivableSummary[], currencyCode: string) {
  return (
    rows.find((row) => row.currency_code === currencyCode) ?? {
      currency_code: currencyCode,
      net_outstanding: '0',
      total_debits: '0',
      total_credits: '0',
    }
  );
}

export function getAgingForCurrency(rows: ReceivableAging[], currencyCode: string) {
  return rows.find((row) => row.currency_code === currencyCode);
}

export function getAgingSegments(row: ReceivableAging | undefined): AgingSegment[] {
  const source = [
    { key: 'current' as const, label: 'Al día', amount: numericAmount(row?.current_amount) },
    { key: 'days_1_30' as const, label: '1–30 días', amount: numericAmount(row?.days_1_30) },
    { key: 'days_31_60' as const, label: '31–60 días', amount: numericAmount(row?.days_31_60) },
    { key: 'days_61_90' as const, label: '61–90 días', amount: numericAmount(row?.days_61_90) },
    { key: 'over_90' as const, label: 'Más de 90 días', amount: numericAmount(row?.over_90) },
  ];
  const total = source.reduce((sum, segment) => sum + segment.amount, 0);

  return source.map((segment) => ({
    ...segment,
    percentage: total > 0 ? (segment.amount / total) * 100 : 0,
  }));
}

export function getOverdueAmount(row: ReceivableAging | undefined) {
  return getAgingSegments(row)
    .filter((segment) => segment.key !== 'current')
    .reduce((total, segment) => total + segment.amount, 0);
}

export function getReceivableStatusCounts(items: ReceivableItem[], currencyCode: string) {
  const counts = { open: 0, partiallyPaid: 0, settled: 0, reversed: 0 };

  items
    .filter((item) => !currencyCode || item.currency_code === currencyCode)
    .forEach((item) => {
      if (item.status === 'open') counts.open += 1;
      else if (item.status === 'partially_paid') counts.partiallyPaid += 1;
      else if (item.status === 'reversed') counts.reversed += 1;
      else if (['paid', 'settled'].includes(item.status)) counts.settled += 1;
    });

  return counts;
}

export function sortReceivables(items: ReceivableItem[]) {
  return [...items].sort((left, right) => {
    const leftDate = left.due_date ?? left.issue_date ?? left.created_at ?? '';
    const rightDate = right.due_date ?? right.issue_date ?? right.created_at ?? '';
    return rightDate.localeCompare(leftDate) || left.description.localeCompare(right.description);
  });
}

export function parseOpeningBalancesCsv(csv: string) {
  const [headerLine, ...lines] = csv.trim().split(/\r?\n/);
  const headers = headerLine?.split(',').map((value) => value.trim()) ?? [];
  const legacy = [
    'unit_code',
    'balance_type',
    'amount',
    'currency_code',
    'effective_date',
    'description',
  ];

  const topologySafe = ['building_name', ...legacy];
  if (![legacy, topologySafe].some((expected) => headers.join(',') === expected.join(','))) {
    throw new Error(
      `El archivo debe usar estos encabezados: ${legacy.join(',')} o ${topologySafe.join(',')}`,
    );
  }

  return lines
    .filter((line) => line.trim())
    .map((line) => {
      const cells = line.split(',').map((value) => value.trim());
      return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']));
    });
}
