export type BudgetVersionStatus = 'draft' | 'pending_approval' | 'approved' | 'superseded';

export type BudgetPeriod = {
  id: string;
  condominium_id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  current_version_number: number;
  approved_version_id: string | null;
  created_at: string;
  updated_at: string;
};

export type BudgetVersion = {
  id: string;
  budget_period_id: string;
  condominium_id: string;
  version_number: number;
  status: BudgetVersionStatus;
  request_id: string;
  revision_note: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  superseded_at: string | null;
  created_at: string;
};

export type BudgetLine = {
  id: string;
  budget_version_id: string;
  budget_period_id: string;
  condominium_id: string;
  category_id: string;
  currency_code: string;
  amount: string;
  note: string | null;
  created_at: string;
};

export type BudgetWorkspace = {
  periods: BudgetPeriod[];
  versions: BudgetVersion[];
  lines: BudgetLine[];
};

export type BudgetActualRow = {
  category_id: string;
  category_name: string;
  currency_code: string;
  budget_amount: number | string;
  actual_amount: number | string;
  variance_amount: number | string;
};

export const budgetStatusLabels: Record<BudgetVersionStatus, string> = {
  draft: 'Borrador',
  pending_approval: 'Pendiente de aprobación',
  approved: 'Aprobado',
  superseded: 'Reemplazado',
};

export function latestBudgetVersion(period: BudgetPeriod, versions: BudgetVersion[]) {
  return versions.find(
    (version) =>
      version.budget_period_id === period.id &&
      version.version_number === period.current_version_number,
  );
}

export function linesForBudgetVersion(versionId: string, lines: BudgetLine[]) {
  return lines.filter((line) => line.budget_version_id === versionId);
}

export function budgetTotalsByCurrency(lines: BudgetLine[]) {
  return lines.reduce<Record<string, number>>((totals, line) => {
    totals[line.currency_code] = (totals[line.currency_code] ?? 0) + Number(line.amount);
    return totals;
  }, {});
}

export function formatBudgetMoney(value: string | number, currencyCode: string) {
  return new Intl.NumberFormat('es', {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export function formatBudgetDate(value: string) {
  return new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(
    new Date(`${value}T12:00:00`),
  );
}
