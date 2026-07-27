import { describe, expect, it } from 'vitest';
import { allocationSchema, paymentDraftSchema } from '@habitta/validation';
describe('manual payment validation', () => {
  it('keeps amounts and rates as exact strings', () =>
    expect(
      allocationSchema.parse({
        receivableItemId: '00000000-0000-0000-0000-000000000001',
        paymentAmount: '100.00',
        receivableAmount: '4000.00',
        paymentCurrencyCode: 'USD',
        receivableCurrencyCode: 'VES',
        receivablePerPaymentRate: '40.0000000000',
      }).receivableAmount,
    ).toBe('4000.00'));
  it('rejects invalid decimal payments', () =>
    expect(
      paymentDraftSchema.safeParse({
        unitId: '00000000-0000-0000-0000-000000000001',
        paymentMethodId: '00000000-0000-0000-0000-000000000002',
        paymentDate: '2026-07-01',
        originalAmount: '1.234',
        originalCurrencyCode: 'USD',
        payerName: 'A',
        idempotencyKey: 'x',
      }).success,
    ).toBe(false));
  it('preserves decimal text without floating-point conversion', () =>
    expect(
      allocationSchema.parse({
        receivableItemId: '00000000-0000-0000-0000-000000000001',
        paymentAmount: '0.10',
        receivableAmount: '4.00',
        paymentCurrencyCode: 'USD',
        receivableCurrencyCode: 'VES',
        receivablePerPaymentRate: '40.0000000000',
      }).paymentAmount,
    ).toBe('0.10'));
});
