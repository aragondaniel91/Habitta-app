import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { allocationPreviewFingerprint } from './features/payments/allocation-preview';
import type { AllocationInput } from './features/payments/types';

const source = (relative: string) => readFile(new URL(relative, import.meta.url), 'utf8');

const baseAllocation: AllocationInput = {
  receivableItemId: '11111111-1111-4111-8111-111111111111',
  paymentAmount: '10.00',
  receivableAmount: '10.00',
  paymentCurrencyCode: 'USD',
  receivableCurrencyCode: 'USD',
};

describe('payment allocation preview fingerprint', () => {
  it('changes for every approval-relevant allocation field', () => {
    const baseline = allocationPreviewFingerprint([baseAllocation], 'USD');
    const variants: AllocationInput[] = [
      { ...baseAllocation, receivableItemId: '22222222-2222-4222-8222-222222222222' },
      { ...baseAllocation, paymentAmount: '11.00' },
      { ...baseAllocation, receivableAmount: '11.00' },
      { ...baseAllocation, paymentCurrencyCode: 'VES' },
      { ...baseAllocation, receivableCurrencyCode: 'VES' },
      { ...baseAllocation, receivablePerPaymentRate: '36.5000000000' },
    ];

    for (const variant of variants) {
      expect(allocationPreviewFingerprint([variant], 'USD')).not.toBe(baseline);
    }
    expect(allocationPreviewFingerprint([baseAllocation], 'VES')).not.toBe(baseline);
  });

  it('is stable for an unchanged payload and sensitive to row order', () => {
    const second: AllocationInput = {
      ...baseAllocation,
      receivableItemId: '22222222-2222-4222-8222-222222222222',
      paymentAmount: '5.00',
      receivableAmount: '5.00',
    };
    const fingerprint = allocationPreviewFingerprint([baseAllocation, second], 'USD');

    expect(allocationPreviewFingerprint([baseAllocation, second], 'USD')).toBe(fingerprint);
    expect(allocationPreviewFingerprint([second, baseAllocation], 'USD')).not.toBe(fingerprint);
  });

  it('only enables approval for a preview matching the current payload', async () => {
    const editor = await source('./features/payments/components/PaymentAllocationEditor.tsx');

    expect(editor).toContain('previewSnapshot?.fingerprint === currentFingerprint');
    expect(editor).toContain(
      'const preview = previewIsCurrent ? previewSnapshot?.value : undefined',
    );
    expect(editor).toContain('Los cambios requieren una nueva previsualización antes de aprobar.');
    expect(editor).toContain('const requestedAllocations = allocations.map');
    expect(editor).toContain('setPreviewSnapshot({ fingerprint: requestedFingerprint, value })');
  });

  it('ignores an older preview response after a newer preview request starts', async () => {
    const editor = await source('./features/payments/components/PaymentAllocationEditor.tsx');

    expect(editor).toContain('const requestId = ++latestPreviewRequest.current');
    expect(editor).toContain('if (requestId !== latestPreviewRequest.current) return;');
  });
});
