import type { AllocationInput } from './types';

/**
 * Stable identity for the exact allocation payload that was validated by the preview endpoint.
 * Keep every approval-relevant field explicit here so adding a new field requires a conscious
 * fingerprint update instead of silently allowing a stale preview.
 */
export function allocationPreviewFingerprint(
  allocations: AllocationInput[],
  paymentCurrency: string,
): string {
  return JSON.stringify({
    paymentCurrency,
    allocations: allocations.map((allocation) => ({
      receivableItemId: allocation.receivableItemId,
      paymentAmount: allocation.paymentAmount,
      receivableAmount: allocation.receivableAmount,
      paymentCurrencyCode: allocation.paymentCurrencyCode,
      receivableCurrencyCode: allocation.receivableCurrencyCode,
      receivablePerPaymentRate: allocation.receivablePerPaymentRate ?? null,
    })),
  });
}
