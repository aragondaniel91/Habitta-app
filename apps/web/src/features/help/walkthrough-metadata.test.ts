import { describe, expect, it } from 'vitest';
import { MODULE_HELP } from './module-help';
import { WALKTHROUGH_METADATA, WALKTHROUGH_METADATA_VERSION } from './walkthrough-metadata';

describe('walkthrough metadata', () => {
  it('defines exactly the versioned workflows expected for the walkthrough registry', () => {
    expect(WALKTHROUGH_METADATA).toHaveLength(8);
    expect(WALKTHROUGH_METADATA.map((workflow) => workflow.workflowId).sort()).toEqual([
      'onboarding',
      'payments',
      'people',
      'recurring-dues',
      'requests',
      'resident-payments',
      'settings',
      'units',
    ]);
  });

  it('uses explicit audiences and deterministic pending-capture metadata', () => {
    for (const workflow of WALKTHROUGH_METADATA) {
      expect(['Administrator', 'Resident']).toContain(workflow.audience);
      expect(workflow.version).toBe(WALKTHROUGH_METADATA_VERSION);
      expect(workflow.status).toBe('pending-production-capture');
      expect(workflow.capture).toEqual({
        status: 'pending-production-capture',
        screenshotAsset: null,
      });
    }
  });

  it('keeps onboarding standalone and links canonical topics to current module help', () => {
    const onboarding = WALKTHROUGH_METADATA.find(
      (workflow) => workflow.workflowId === 'onboarding',
    );

    expect(onboarding).toBeDefined();
    expect('canonicalTopicId' in onboarding!).toBe(false);

    for (const workflow of WALKTHROUGH_METADATA) {
      if (workflow.workflowId === 'onboarding' || !workflow.canonicalTopicId) continue;

      expect(
        Object.values(MODULE_HELP).some((help) => help.topicId === workflow.canonicalTopicId),
      ).toBe(true);
    }
  });
});
