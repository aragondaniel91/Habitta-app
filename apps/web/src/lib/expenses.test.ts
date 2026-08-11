import { describe, expect, it } from 'vitest';
import { filterExpenses, getExpenseStatusCounts, nextExpenseActions } from './expenses';
import type { ExpenseRecord } from './expenses';

const expense = (values: Partial<ExpenseRecord>): ExpenseRecord => ({
  id: '00000000-0000-4000-8000-000000000001',
  condominium_id: '00000000-0000-4000-8000-000000000002',
  category_id: '00000000-0000-4000-8000-000000000003',
  vendor_id: null,
  description: 'Mantenimiento ascensor',
  invoice_number: 'FAC-100',
  expense_date: '2026-08-01',
  due_date: null,
  amount: '120.00',
  currency_code: 'USD',
  status: 'draft',
  payment_method: null,
  payment_reference: null,
  treasury_account_id: null,
  support_url: null,
  notes: null,
  approved_at: null,
  paid_at: null,
  voided_at: null,
  version: 1,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  ...values,
});

describe('expense workspace helpers', () => {
  it('filters by query, status and currency without mixing concerns', () => {
    const rows = [
      expense({ id: '1', status: 'draft', currency_code: 'USD' }),
      expense({ id: '2', description: 'Electricidad', status: 'paid', currency_code: 'VES' }),
    ];

    expect(
      filterExpenses(rows, { query: 'electricidad', status: 'paid', currency: 'VES' }),
    ).toEqual([rows[1]]);
    expect(filterExpenses(rows, { query: '', status: '', currency: 'USD' })).toEqual([rows[0]]);
  });

  it('counts every workflow state', () => {
    const counts = getExpenseStatusCounts([
      expense({ status: 'draft' }),
      expense({ status: 'pending_approval' }),
      expense({ status: 'paid' }),
    ]);

    expect(counts).toEqual({ draft: 1, pending_approval: 1, approved: 0, paid: 1, void: 0 });
  });

  it('exposes only valid next actions', () => {
    expect(nextExpenseActions('draft')).toEqual(['submit', 'void']);
    expect(nextExpenseActions('pending_approval')).toEqual(['approve', 'void']);
    expect(nextExpenseActions('approved')).toEqual(['mark-paid', 'void']);
    expect(nextExpenseActions('paid')).toEqual([]);
  });
});
