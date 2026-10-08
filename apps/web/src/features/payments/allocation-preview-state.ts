import { allocationPreviewFingerprint } from './allocation-preview';
import type { AllocationInput, AllocationPreview } from './types';

export type AllocationPreviewSnapshot = {
  fingerprint: string;
  value: AllocationPreview;
  allocations: AllocationInput[];
};

/** Discards a response that no longer belongs to the latest preview request. */
export function snapshotForLatestPreview({
  latestRequestId,
  requestId,
  allocations,
  paymentCurrency,
  value,
}: {
  latestRequestId: number;
  requestId: number;
  allocations: AllocationInput[];
  paymentCurrency: string;
  value: AllocationPreview;
}): AllocationPreviewSnapshot | undefined {
  if (requestId !== latestRequestId) return undefined;

  return {
    fingerprint: allocationPreviewFingerprint(allocations, paymentCurrency),
    value,
    allocations,
  };
}

export function previewIsCurrent(
  snapshot: AllocationPreviewSnapshot | undefined,
  allocations: AllocationInput[],
  paymentCurrency: string,
) {
  return snapshot?.fingerprint === allocationPreviewFingerprint(allocations, paymentCurrency);
}

/** Returns the exact previewed payload only while it still matches the editor. */
export function approvalAllocations(
  snapshot: AllocationPreviewSnapshot | undefined,
  allocations: AllocationInput[],
  paymentCurrency: string,
): AllocationInput[] | undefined {
  if (!snapshot || !previewIsCurrent(snapshot, allocations, paymentCurrency)) return undefined;
  return snapshot.allocations.map((allocation) => ({ ...allocation }));
}
