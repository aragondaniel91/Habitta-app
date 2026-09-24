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
export type WalkthroughStatus = 'pending-production-capture';

export type WalkthroughCapture = {
  status: WalkthroughStatus;
  screenshotAsset: null;
};

export type WalkthroughMetadata = {
  workflowId: WalkthroughWorkflowId;
  audience: WalkthroughAudience;
  version: typeof WALKTHROUGH_METADATA_VERSION;
  status: WalkthroughStatus;
  capture: WalkthroughCapture;
  canonicalTopicId?: ModuleHelpTopicId;
};

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
