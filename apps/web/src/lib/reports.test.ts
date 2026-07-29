import { describe, expect, it } from 'vitest';
import type {
  DashboardPayment,
  DashboardReceivable,
  DashboardUnit,
  ReceivableAging,
  ReceivableSummary,
} from './dashboard';
import {
  buildPaymentStatusRows,
  buildUnitFinancialRows,
  createUnitReportCsv,
  getPeriodFinancialTotals,
  getPortfolioTotals,
  getReportCurrencies,
} from './reports';

const referenceDate = new Date('2026-07-29T12:00:00Z');
const units: DashboardUnit[] = [
  { id: 'a', code: 'A-1', status: 'active' },
  { id: 'b', code: 'B-2', status: 'active' },
];
const receivables: DashboardReceivable[] = [
  {
    id: 'r1',
    unit_id: 'a',
    description: 'Cuota julio',
    currency_code: 'USD',
    original_amount: '100.00',
    outstanding_amount: '40.00',
    status: 'partially_paid',
    issue_date: '2026-07-01',
    due_date: '2026-07-10',
  },
  {
    id: 'r2',
    unit_id: 'b',
    description: 'Cuota junio',
    currency_code: 'VES',
    original_amount: '2000.00',
    outstanding_amount: '2000.00',
    status: 'open',
    issue_date: '2026-06-01',
    due_date: '2026-06-10',
  },
];
const payments: DashboardPayment[] = [
  {
    id: 'p1',
    unit_id: 'a',
    payer_name: 'Ana',
    status: 'approved',
    original_amount: '60.00',
    original_currency_code: 'USD',
    payment_date: '2026-07-15',
  },
  {
    id: 'p2',
    unit_id: 'b',
    payer_name: 'Luis',
    status: 'submitted',
    original_amount: '2000.00',
    original_currency_code: 'VES',
    payment_date: '2026-07-18',
  },
];
const summaries: ReceivableSummary[] = [
  { currency_code: 'USD', net_outstanding: '40.00', total_debits: '100', total_credits: '60' },
  { currency_code: 'VES', net_outstanding: '2000', total_debits: '2000', total_credits: '0' },
];
const aging: ReceivableAging[] = [
  {
    currency_code: 'USD',
    current_amount: '0',
    days_1_30: '40',
    days_31_60: '0',
    days_61_90: '0',
    over_90: '0',
  },
];

describe('financial report calculations', () => {
  it('keeps report currencies and totals separated', () => {
    expect(getReportCurrencies(summaries, aging, receivables, payments)).toEqual(['USD', 'VES']);
    expect(getPeriodFinancialTotals(receivables, payments, 'USD', 3, referenceDate)).toEqual({
      charges: 100,
      collections: 60,
      collectionRate: 60,
    });
    expect(
      getPeriodFinancialTotals(receivables, payments, 'VES', 3, referenceDate).collections,
    ).toBe(0);
  });

  it('builds unit collection and delinquency rows', () => {
    const rows = buildUnitFinancialRows(units, receivables, payments, 'USD', 3, referenceDate);
    expect(rows[0]).toMatchObject({
      unitCode: 'A-1',
      charges: 100,
      collections: 60,
      outstanding: 40,
      overdue: 40,
      paymentCount: 1,
      openItemCount: 1,
    });
    expect(getPortfolioTotals(summaries, aging, 'USD')).toEqual({ outstanding: 40, overdue: 40 });
  });

  it('summarizes payment states and produces a deterministic CSV', () => {
    expect(buildPaymentStatusRows(payments, 'VES', 3, referenceDate)).toEqual([
      { status: 'submitted', count: 1, amount: 2000 },
    ]);
    const csv = createUnitReportCsv(
      buildUnitFinancialRows(units, receivables, payments, 'USD', 3, referenceDate),
      'USD',
    );
    expect(csv).toContain('unit_code,currency_code,charges,collections');
    expect(csv).toContain('A-1,USD,100.00,60.00,40.00,40.00,1,1');
  });
});
