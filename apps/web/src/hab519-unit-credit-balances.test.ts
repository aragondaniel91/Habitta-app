import { describe, expect, it } from 'vitest';
import {
  filterUnitCreditBalances,
  getTotalCreditBalance,
  sortUnitCreditBalances,
} from './lib/receivables';
import type { ReceivableUnit } from './lib/receivables';
import type { UnitCreditBalance } from './lib/dashboard';

const units: ReceivableUnit[] = [
  { id: 'unit-a', code: 'A-1', building_id: null },
  { id: 'unit-b', code: 'B-2', building_id: null },
];

const rows: UnitCreditBalance[] = [
  {
    unit_id: 'unit-a',
    currency_code: 'USD',
    credit_balance: '5.00',
    credit_entry_count: 1,
    oldest_credit_date: '2026-10-01',
    latest_credit_date: '2026-10-01',
  },
  {
    unit_id: 'unit-a',
    currency_code: 'VES',
    credit_balance: '0.50',
    credit_entry_count: 1,
    oldest_credit_date: '2026-10-02',
    latest_credit_date: '2026-10-02',
  },
  {
    unit_id: 'unit-b',
    currency_code: 'USD',
    credit_balance: '12.00',
    credit_entry_count: 2,
    oldest_credit_date: '2026-09-15',
    latest_credit_date: '2026-10-10',
  },
];

describe('HAB-519 collections workspace authorized credit helpers', () => {
  it('never combines credit balances across currencies for the same unit', () => {
    const totalUsd = getTotalCreditBalance(rows, 'USD');
    const totalVes = getTotalCreditBalance(rows, 'VES');
    expect(totalUsd).toBe(17);
    expect(totalVes).toBe(0.5);
  });

  it('filters by currency and by unit code search', () => {
    expect(filterUnitCreditBalances(rows, units, '', 'USD')).toHaveLength(2);
    expect(filterUnitCreditBalances(rows, units, 'a-1', '')).toEqual([rows[0], rows[1]]);
    expect(filterUnitCreditBalances(rows, units, 'b-2', 'USD')).toEqual([rows[2]]);
    expect(filterUnitCreditBalances(rows, units, 'does-not-exist', '')).toHaveLength(0);
  });

  it('sorts the largest available credit first', () => {
    const sorted = sortUnitCreditBalances(rows);
    expect(sorted.map((row) => row.credit_balance)).toEqual(['12.00', '5.00', '0.50']);
  });
});
