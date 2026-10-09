// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExpenseFinancialSummary } from './ExpensesPage';
import type { ExpenseRecord, ExpenseSummary } from '../lib/expenses';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const expense = (status: ExpenseRecord['status'], currency_code: string): ExpenseRecord => ({
  id: `${status}-${currency_code}`,
  condominium_id: 'condominium-1',
  category_id: 'category-1',
  vendor_id: null,
  description: `${status} ${currency_code}`,
  invoice_number: null,
  expense_date: '2026-10-09',
  due_date: null,
  amount: '1.00',
  currency_code,
  status,
  payment_method: null,
  payment_reference: null,
  treasury_account_id: null,
  support_url: null,
  notes: null,
  approved_at: null,
  paid_at: null,
  voided_at: null,
  version: 1,
  created_at: '2026-10-09T00:00:00.000Z',
  updated_at: '2026-10-09T00:00:00.000Z',
});

const summary: ExpenseSummary = {
  active_vendor_count: 1,
  pending_approval_count: 1,
  totals_by_currency: [
    {
      currency_code: 'USD',
      total_amount: '9000.00',
      draft_amount: '5000.00',
      pending_amount: '1000.00',
      approved_amount: '2000.00',
      paid_amount: '1000.00',
      void_amount: '0.00',
      expense_count: 4,
    },
    {
      currency_code: 'VES',
      total_amount: '1750.00',
      draft_amount: '1000.00',
      pending_amount: '250.00',
      approved_amount: '500.00',
      paid_amount: '0.00',
      void_amount: '0.00',
      expense_count: 3,
    },
  ],
};

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('ExpenseFinancialSummary', () => {
  it('separates lifecycle amounts by currency and never presents drafts as liabilities', () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    document.body.append(host);

    act(() => {
      root.render(
        <ExpenseFinancialSummary
          activeStatus=""
          expenses={[
            expense('draft', 'USD'),
            expense('pending_approval', 'USD'),
            expense('approved', 'USD'),
            expense('paid', 'USD'),
            expense('draft', 'VES'),
          ]}
          onStatusSelect={() => undefined}
          summary={summary}
        />,
      );
    });

    expect(host.textContent).toContain('Borradores');
    expect(host.textContent).toContain('Aprobados pendientes de pago');
    expect(host.textContent).toContain('No son obligaciones');
    expect(host.textContent).toContain('No sustituyen la evidencia de tesorería');
    expect(host.textContent).toContain('5000,00 US$');
    expect(host.textContent).toContain('1000,00 VES');
    expect(host.textContent).not.toContain('10750,00 US$');
    expect(host.textContent).not.toContain('Total USD');
    void act(() => root.unmount());
  });

  it('uses lifecycle cards as real status filters', async () => {
    const selectStatus = vi.fn();
    const host = document.createElement('div');
    const root = createRoot(host);
    document.body.append(host);

    await act(async () => {
      root.render(
        <ExpenseFinancialSummary
          activeStatus="approved"
          expenses={[expense('approved', 'USD')]}
          onStatusSelect={selectStatus}
          summary={summary}
        />,
      );
    });

    const approvedCard = [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Aprobados pendientes de pago'),
    );
    expect(approvedCard?.getAttribute('aria-pressed')).toBe('true');
    await act(async () => approvedCard?.click());
    expect(selectStatus).toHaveBeenCalledWith('approved');
    await act(async () => root.unmount());
  });
});
