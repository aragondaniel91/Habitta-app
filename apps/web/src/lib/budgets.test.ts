import { describe, expect, it } from 'vitest';
import {
  budgetTotalsByCurrency,
  latestBudgetVersion,
  linesForBudgetVersion,
} from './budgets';
import type { BudgetLine, BudgetPeriod, BudgetVersion } from './budgets';

const period: BudgetPeriod = {
  id: '00000000-0000-4000-8000-000000000001',
  condominium_id: '00000000-0000-4000-8000-000000000002',
  name: 'Presupuesto 2026',
  starts_on: '2026-01-01',
  ends_on: '2026-12-31',
  current_version_number: 2,
  approved_version_id: '00000000-0000-4000-8000-000000000012',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-02-01T00:00:00Z',
};

const version = (versionNumber: number): BudgetVersion => ({
  id: `00000000-0000-4000-8000-00000000001${versionNumber}`,
  budget_period_id: period.id,
  condominium_id: period.condominium_id,
  version_number: versionNumber,
  status: versionNumber === 2 ? 'approved' : 'superseded',
  request_id: `00000000-0000-4000-8000-00000000002${versionNumber}`,
  revision_note: null,
  submitted_at: '2026-01-15T00:00:00Z',
  approved_at: '2026-01-16T00:00:00Z',
  superseded_at: versionNumber === 1 ? '2026-02-01T00:00:00Z' : null,
  created_at: '2026-01-10T00:00:00Z',
});

const line = (
  id: string,
  versionId: string,
  currencyCode: string,
  amount: string,
): BudgetLine => ({
  id,
  budget_version_id: versionId,
  budget_period_id: period.id,
  condominium_id: period.condominium_id,
  category_id: '00000000-0000-4000-8000-000000000099',
  currency_code: currencyCode,
  amount,
  note: null,
  created_at: '2026-01-10T00:00:00Z',
});

describe('budget workspace helpers', () => {
  it('selects the period current version without mutating history', () => {
    const versions = [version(1), version(2)];
    expect(latestBudgetVersion(period, versions)).toEqual(versions[1]);
  });

  it('keeps lines scoped to the selected immutable version', () => {
    const rows = [
      line('1', version(1).id, 'USD', '100.00'),
      line('2', version(2).id, 'USD', '120.00'),
    ];
    expect(linesForBudgetVersion(version(2).id, rows)).toEqual([rows[1]]);
  });

  it('totals each currency independently instead of combining USD and VES', () => {
    const versionId = version(2).id;
    const totals = budgetTotalsByCurrency([
      line('1', versionId, 'USD', '100.00'),
      line('2', versionId, 'USD', '50.00'),
      line('3', versionId, 'VES', '2000.00'),
    ]);

    expect(totals).toEqual({ USD: 150, VES: 2000 });
    expect(Object.values(totals)).not.toContain(2150);
  });
});
