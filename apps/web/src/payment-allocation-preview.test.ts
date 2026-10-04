import { describe, expect, it } from 'vitest';
import { allocationPreviewFingerprint } from './features/payments/allocation-preview';
import {
  approvalAllocations,
  previewIsCurrent,
  snapshotForLatestPreview,
} from './features/payments/allocation-preview-state';
import type { AllocationInput, AllocationPreview } from './features/payments/types';

const baseAllocation: AllocationInput = {
  receivableItemId: '11111111-1111-4111-8111-111111111111',
  paymentAmount: '10.00',
  receivableAmount: '10.00',
  paymentCurrencyCode: 'USD',
  receivableCurrencyCode: 'USD',
};

const preview: AllocationPreview = {
  total_used: '10.00',
  remaining: '0.00',
  errors: [],
  warnings: [],
  recognized_by_currency: {},
  allocations: [],
};

describe('payment allocation preview state', () => {
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

  it('rejects approval after an amount change makes its preview stale', () => {
    const snapshot = snapshotForLatestPreview({
      latestRequestId: 1,
      requestId: 1,
      allocations: [baseAllocation],
      paymentCurrency: 'USD',
      value: preview,
    });
    const changedAllocations = [
      { ...baseAllocation, paymentAmount: '11.00', receivableAmount: '11.00' },
    ];

    expect(previewIsCurrent(snapshot, changedAllocations, 'USD')).toBe(false);
    expect(approvalAllocations(snapshot, changedAllocations, 'USD')).toBeUndefined();
  });

  it('ignores an out-of-order response and confirms the exact current preview payload', () => {
    expect(
      snapshotForLatestPreview({
        latestRequestId: 2,
        requestId: 1,
        allocations: [baseAllocation],
        paymentCurrency: 'USD',
        value: preview,
      }),
    ).toBeUndefined();

    const latestSnapshot = snapshotForLatestPreview({
      latestRequestId: 2,
      requestId: 2,
      allocations: [baseAllocation],
      paymentCurrency: 'USD',
      value: preview,
    });
    const confirmedAllocations = approvalAllocations(latestSnapshot, [baseAllocation], 'USD');

    expect(confirmedAllocations).toEqual([baseAllocation]);
    expect(confirmedAllocations).not.toBe(latestSnapshot?.allocations);
  });
});
