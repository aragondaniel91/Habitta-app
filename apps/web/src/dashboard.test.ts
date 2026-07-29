import { describe, expect, it } from 'vitest';
import {
  buildRecentActivity,
  getAgingTotal,
  getOverdueTotal,
  sortReceivableSummaries,
} from './lib/dashboard';

describe('administrative dashboard data helpers', () => {
  it('keeps financial summaries separated by currency', () => {
    const result = sortReceivableSummaries([
      {
        currency_code: 'VES',
        net_outstanding: '950.00',
        total_debits: '1000.00',
        total_credits: '50.00',
      },
      {
        currency_code: 'USD',
        net_outstanding: '125.00',
        total_debits: '150.00',
        total_credits: '25.00',
      },
    ]);

    expect(result.map((row) => row.currency_code)).toEqual(['USD', 'VES']);
    expect(result[0]?.net_outstanding).toBe('125.00');
    expect(result[1]?.net_outstanding).toBe('950.00');
  });

  it('calculates aging totals without changing the source currency', () => {
    const row = {
      currency_code: 'USD',
      current_amount: '10.00',
      days_1_30: '20.00',
      days_31_60: '30.00',
      days_61_90: '40.00',
      over_90: '50.00',
    };

    expect(getAgingTotal(row)).toBe(150);
    expect(getOverdueTotal(row)).toBe(140);
    expect(row.currency_code).toBe('USD');
  });

  it('combines receivables and payments by most recent activity', () => {
    const activity = buildRecentActivity(
      [
        {
          id: 'receivable-1',
          unit_id: 'unit-1',
          description: 'Cuota de julio',
          currency_code: 'USD',
          outstanding_amount: '40.00',
          status: 'open',
          issue_date: '2026-07-01',
        },
      ],
      [
        {
          id: 'payment-1',
          unit_id: 'unit-1',
          payer_name: 'Ana Pérez',
          status: 'submitted',
          original_amount: '20.00',
          original_currency_code: 'USD',
          payment_date: '2026-07-04',
          submitted_at: '2026-07-05T10:00:00Z',
        },
      ],
      [{ id: 'unit-1', code: 'A-01', status: 'active' }],
    );

    expect(activity).toHaveLength(2);
    expect(activity[0]?.kind).toBe('payment');
    expect(activity[0]?.detail).toBe('Unidad A-01');
    expect(activity[1]?.kind).toBe('receivable');
  });
});
