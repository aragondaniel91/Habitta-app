import { describe, expect, it } from 'vitest';
import type { Payment, PaymentMethod } from '../features/payments/types';
import { filterPayments, getPaymentCurrencies, getPaymentSummary, sortPayments } from './payments';

const methods: PaymentMethod[] = [
  {
    id: 'bank',
    display_name: 'Transferencia Banesco',
    currency_code: 'VES',
    requires_proof: true,
    requires_reference: true,
    method_type: 'bank_transfer',
    is_active: true,
  },
  {
    id: 'zelle',
    display_name: 'Zelle administración',
    currency_code: 'USD',
    requires_proof: true,
    requires_reference: false,
    method_type: 'zelle',
    is_active: true,
  },
];

const payments: Payment[] = [
  {
    id: '1',
    status: 'approved',
    original_amount: '100.00',
    original_currency_code: 'USD',
    payment_date: '2026-07-15',
    payer_name: 'Ana Rodríguez',
    unit_id: 'unit-a',
    payment_method_id: 'zelle',
    reference: 'JULIO-100',
  },
  {
    id: '2',
    status: 'under_review',
    original_amount: '2500.00',
    original_currency_code: 'VES',
    payment_date: '2026-07-18',
    payer_name: 'Luis Martínez',
    unit_id: 'unit-b',
    payment_method_id: 'bank',
  },
];

const unitCodes = new Map([
  ['unit-a', 'A-2'],
  ['unit-b', 'B-8'],
]);

describe('payment workspace helpers', () => {
  it('keeps currencies separated in summaries', () => {
    expect(getPaymentSummary(payments, 'USD')).toEqual({
      approvedAmount: 100,
      pendingReview: 0,
      drafts: 0,
      reversedAmount: 0,
    });
    expect(getPaymentSummary(payments, 'VES').pendingReview).toBe(1);
    expect(getPaymentCurrencies(payments, methods)).toEqual(['USD', 'VES']);
  });

  it('searches by independent words across unit, payer and method', () => {
    const visible = filterPayments(payments, methods, unitCodes, {
      query: 'ana zelle a-2',
      status: '',
      currencyCode: 'USD',
      methodId: '',
    });
    expect(visible.map((payment) => payment.id)).toEqual(['1']);
  });

  it('sorts newest payments first', () => {
    expect(sortPayments(payments).map((payment) => payment.id)).toEqual(['2', '1']);
  });
});
