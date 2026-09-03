import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  allocationReceivableAmount,
  deriveReceivableAmount,
  isPositiveAllocationRate,
  isPositiveMoneyAmount,
  moneyExceeds,
} from './features/payments/allocation-amounts';

const editorSource = readFileSync(
  fileURLToPath(
    new URL('./features/payments/components/PaymentAllocationEditor.tsx', import.meta.url),
  ),
  'utf8',
);
const drawersSource = readFileSync(
  fileURLToPath(new URL('./pages/PaymentsDrawersCore.tsx', import.meta.url)),
  'utf8',
);

describe('HAB-459 guided payment allocations', () => {
  it('derives cross-currency amounts with Postgres-compatible decimal rounding', () => {
    expect(deriveReceivableAmount('10.00', '40')).toBe('400.00');
    expect(deriveReceivableAmount('1.00', '1.005')).toBe('1.01');
    expect(deriveReceivableAmount('0.01', '0.5')).toBe('0.01');
    expect(deriveReceivableAmount('25.35', '36.1234567890')).toBe('915.73');
  });

  it('never accepts malformed precision as valid financial input', () => {
    expect(isPositiveMoneyAmount('12.34')).toBe(true);
    expect(isPositiveMoneyAmount('12.345')).toBe(false);
    expect(isPositiveMoneyAmount('0')).toBe(false);
    expect(isPositiveAllocationRate('36.1234567890')).toBe(true);
    expect(isPositiveAllocationRate('36.12345678901')).toBe(false);
    expect(deriveReceivableAmount('10.001', '40')).toBe('');
  });

  it('mirrors same-currency allocations and bounds values without binary floats', () => {
    expect(
      allocationReceivableAmount({
        paymentAmount: '47.25',
        paymentCurrency: 'USD',
        receivableCurrency: 'USD',
      }),
    ).toBe('47.25');
    expect(moneyExceeds('100.01', '100.00')).toBe(true);
    expect(moneyExceeds('100.00', '100.00')).toBe(false);
  });

  it('scopes the review drawer to the payment unit before the editor sees receivables', () => {
    expect(drawersSource).toContain('item.unit_id === payment.unit_id');
    expect(drawersSource).toContain('Number(item.outstanding_amount ?? 0) > 0');
  });

  it('shows outstanding context and derives instead of freehand-editing the counterpart', () => {
    expect(editorSource).toContain('Pendiente {item.outstanding_amount');
    expect(editorSource).toContain('Monto que se aplicará');
    expect(editorSource).toContain('1 {paymentCurrency} = X {allocation.receivableCurrencyCode}');
    expect(editorSource).toContain('allocationReceivableAmount({');
    expect(editorSource).toContain('moneyExceeds(allocation.receivableAmount');
    expect(editorSource).not.toContain('receivableAmount: event.target.value');
  });

  it('keeps preview as the mandatory freshness gate before approval', () => {
    expect(editorSource).toContain('allocationPreviewFingerprint');
    expect(editorSource).toContain('previewIsCurrent');
    expect(editorSource).toContain('Los cambios requieren una nueva previsualización');
    expect(editorSource).toContain('disabled={!readyForPreview}');
    expect(editorSource).toContain('disabled={preview.errors.length > 0}');
  });
});
