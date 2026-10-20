import { describe, expect, it } from 'vitest';
import type { PaymentAllocationIntent, Receivable } from './types';
import { resolveResidentProposal } from './resident-proposal-approval';

const paymentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const charge = (id: string, amount: string): Receivable => ({
  id,
  unit_id: 'unit-1',
  description: 'Cuota ' + id,
  currency_code: 'USD',
  outstanding_amount: amount,
});
const intent = (proposals: PaymentAllocationIntent['proposals']): PaymentAllocationIntent => ({
  payment_id: paymentId,
  proposals,
  updated_at: '2026-10-20T00:00:00Z',
});
const proposal = (id: string, value = '5.00') => ({
  receivable_item_id: id,
  payment_amount: value,
  receivable_amount: value,
  payment_currency_code: 'USD',
  receivable_currency_code: 'USD',
});
const evaluate = (
  saved: PaymentAllocationIntent | null,
  current: Receivable[],
  paymentAmount = '12.00',
) =>
  resolveResidentProposal({
    intent: saved,
    receivables: current,
    paymentAmount,
    paymentCurrency: 'USD',
    paymentId,
  });

describe('authoritative resident proposal → review allocation', () => {
  it('passes exact resident choices unchanged, including partial amounts and remaining payment credit', () => {
    const result = evaluate(intent([proposal('charge-1', '5.00'), proposal('charge-2', '4.25')]), [
      charge('charge-1', '7.00'),
      charge('charge-2', '9.00'),
    ]);
    expect(result.kind).toBe('resident-proposal');
    if (result.kind !== 'resident-proposal') return;
    expect(
      result.allocations.map((item) => [
        item.receivableItemId,
        item.paymentAmount,
        item.receivableAmount,
      ]),
    ).toEqual([
      ['charge-1', '5.00', '5.00'],
      ['charge-2', '4.25', '4.25'],
    ]);
    expect(result.allocations.every((item) => item.receivablePerPaymentRate === '1')).toBe(true);
  });

  it('manual is allowed only if authoritative API explicitly reports NO existing intent', () => {
    expect(evaluate(null, [])).toEqual({ kind: 'legacy-manual' });
    expect(evaluate(intent([]), []).kind).toBe('invalid');
  });

  it('rejects missing, closed, or duplicate charges instead of silently reallocating', () => {
    expect(evaluate(intent([proposal('missing')]), []).kind).toBe('invalid');
    expect(
      evaluate(intent([proposal('charge-1'), proposal('charge-1')]), [charge('charge-1', '12.00')])
        .kind,
    ).toBe('invalid');
  });

  it('rejects changes in outstanding balance, overapplication, and wrong payment identity', () => {
    expect(
      evaluate(intent([proposal('charge-1', '7.00')]), [charge('charge-1', '6.99')]).kind,
    ).toBe('invalid');
    expect(
      evaluate(intent([proposal('charge-1', '13.00')]), [charge('charge-1', '30.00')]).kind,
    ).toBe('invalid');
    expect(
      evaluate({ ...intent([proposal('charge-1')]), payment_id: 'other' }, [
        charge('charge-1', '20.00'),
      ]).kind,
    ).toBe('invalid');
  });

  it('rejects cross-currency and amounts not identical instead of fabricating a conversion rate', () => {
    expect(
      evaluate(intent([{ ...proposal('charge-1'), receivable_currency_code: 'VES' }]), [
        charge('charge-1', '20.00'),
      ]).kind,
    ).toBe('invalid');
    expect(
      evaluate(intent([{ ...proposal('charge-1'), receivable_amount: '4.99' }]), [
        charge('charge-1', '20.00'),
      ]).kind,
    ).toBe('invalid');
  });

  it('handles PostgreSQL numeric JSON values as decimal strings without float allocation arithmetic', () => {
    const numeric = 15.25 as unknown as string;
    const original = 25 as unknown as string;
    const current = 125 as unknown as string;
    const resolution = resolveResidentProposal({
      intent: intent([
        { ...proposal('charge-1'), payment_amount: numeric, receivable_amount: numeric },
      ]),
      paymentId,
      paymentAmount: original,
      paymentCurrency: 'USD',
      receivables: [charge('charge-1', current)],
    });
    expect(resolution.kind).toBe('resident-proposal');
    if (resolution.kind === 'resident-proposal') {
      expect(resolution.allocations[0]?.paymentAmount).toBe('15.25');
      expect(resolution.allocations[0]?.receivableAmount).toBe('15.25');
    }
  });

  it('keeps valid fractional cents and rejects malformed strings', () => {
    expect(
      evaluate(intent([proposal('charge-1', '0.01')]), [charge('charge-1', '10.00')]).kind,
    ).toBe('resident-proposal');
    expect(
      evaluate(intent([proposal('charge-1', '0.001')]), [charge('charge-1', '10.00')]).kind,
    ).toBe('invalid');
  });
});
