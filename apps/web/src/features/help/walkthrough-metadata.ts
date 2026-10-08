import type { ModuleHelpTopicId } from './module-help';

export const WALKTHROUGH_METADATA_VERSION = '1.0.0' as const;

export type WalkthroughWorkflowId =
  | 'onboarding'
  | 'units'
  | 'people'
  | 'recurring-dues'
  | 'payments'
  | 'resident-payments'
  | 'requests'
  | 'settings';

export type WalkthroughAudience = 'Administrator' | 'Resident';
export type WalkthroughStatus = 'pending-production-capture' | 'captured-production';

type PendingProductionCapture = {
  status: 'pending-production-capture';
  screenshotAsset: null;
};

export type CapturedProductionEvidence = {
  status: 'captured-production';
  screenshotAsset: string;
  capturedAt: string;
  sourceUrl: string;
  piiReview: 'approved';
  releaseSha: string;
};

export type WalkthroughCapture = PendingProductionCapture | CapturedProductionEvidence;

type CapturedProductionEvidenceInput = Omit<CapturedProductionEvidence, 'status' | 'piiReview'> & {
  piiReview: string;
};

export function createCapturedProductionEvidence({
  piiReview,
  releaseSha,
  ...evidence
}: CapturedProductionEvidenceInput): CapturedProductionEvidence {
  if (piiReview !== 'approved') {
    throw new Error('Captured production evidence requires an approved PII review.');
  }

  if (!/^[a-fA-F0-9]{40}$/.test(releaseSha)) {
    throw new Error(
      'Captured production evidence requires a 40-character hexadecimal release SHA.',
    );
  }

  return {
    status: 'captured-production',
    ...evidence,
    piiReview,
    releaseSha,
  };
}

type WalkthroughMetadataBase = {
  workflowId: WalkthroughWorkflowId;
  audience: WalkthroughAudience;
  version: typeof WALKTHROUGH_METADATA_VERSION;
  canonicalTopicId?: ModuleHelpTopicId;
};

export type WalkthroughMetadata = WalkthroughMetadataBase &
  (
    | {
        status: 'pending-production-capture';
        capture: PendingProductionCapture;
      }
    | {
        status: 'captured-production';
        capture: CapturedProductionEvidence;
      }
  );

export const WALKTHROUGH_METADATA = [
  {
    workflowId: 'onboarding',
    audience: 'Administrator',
    version: WALKTHROUGH_METADATA_VERSION,
    status: 'pending-production-capture',
    capture: { status: 'pending-production-capture', screenshotAsset: null },
  },
  {
    workflowId: 'units',
    audience: 'Administrator',
    version: WALKTHROUGH_METADATA_VERSION,
    status: 'pending-production-capture',
    capture: { status: 'pending-production-capture', screenshotAsset: null },
    canonicalTopicId: 'module-help.units',
  },
  {
    workflowId: 'people',
    audience: 'Administrator',
    version: WALKTHROUGH_METADATA_VERSION,
    status: 'pending-production-capture',
    capture: { status: 'pending-production-capture', screenshotAsset: null },
    canonicalTopicId: 'module-help.people',
  },
  {
    workflowId: 'recurring-dues',
    audience: 'Administrator',
    version: WALKTHROUGH_METADATA_VERSION,
    status: 'pending-production-capture',
    capture: { status: 'pending-production-capture', screenshotAsset: null },
    canonicalTopicId: 'module-help.fees',
  },
  {
    workflowId: 'payments',
    audience: 'Administrator',
    version: WALKTHROUGH_METADATA_VERSION,
    status: 'pending-production-capture',
    capture: { status: 'pending-production-capture', screenshotAsset: null },
    canonicalTopicId: 'module-help.payments',
  },
  {
    workflowId: 'resident-payments',
    audience: 'Resident',
    version: WALKTHROUGH_METADATA_VERSION,
    status: 'pending-production-capture',
    capture: { status: 'pending-production-capture', screenshotAsset: null },
    canonicalTopicId: 'module-help.payments',
  },
  {
    workflowId: 'requests',
    audience: 'Resident',
    version: WALKTHROUGH_METADATA_VERSION,
    status: 'pending-production-capture',
    capture: { status: 'pending-production-capture', screenshotAsset: null },
    canonicalTopicId: 'module-help.requests',
  },
  {
    workflowId: 'settings',
    audience: 'Administrator',
    version: WALKTHROUGH_METADATA_VERSION,
    status: 'pending-production-capture',
    capture: { status: 'pending-production-capture', screenshotAsset: null },
    canonicalTopicId: 'module-help.settings',
  },
] as const satisfies readonly WalkthroughMetadata[];
