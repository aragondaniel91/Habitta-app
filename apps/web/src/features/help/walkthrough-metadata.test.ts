import { describe, expect, it } from 'vitest';
import { MODULE_HELP } from './module-help';
import {
  createCapturedProductionEvidence,
  WALKTHROUGH_METADATA,
  WALKTHROUGH_METADATA_VERSION,
} from './walkthrough-metadata';

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

  it('references the canonical MODULE_HELP topics for each module workflow', () => {
    expect(
      WALKTHROUGH_METADATA.filter((workflow) => workflow.workflowId !== 'onboarding').map(
        (workflow) => workflow.canonicalTopicId,
      ),
    ).toEqual([
      MODULE_HELP.units.topicId,
      MODULE_HELP.people.topicId,
      MODULE_HELP.fees.topicId,
      MODULE_HELP.payments.topicId,
      MODULE_HELP.payments.topicId,
      MODULE_HELP.requests.topicId,
      MODULE_HELP.settings.topicId,
    ]);
  });

  it('creates captured production evidence from complete approved capture details', () => {
    const evidence = createCapturedProductionEvidence({
      screenshotAsset: 'help/walkthroughs/units.png',
      capturedAt: '2026-09-24T12:00:00.000Z',
      sourceUrl: 'https://app.habitta.example/help/units',
      piiReview: 'approved',
      releaseSha: '0123456789abcdef0123456789abcdef01234567',
    });

    expect(evidence).toEqual({
      status: 'captured-production',
      screenshotAsset: 'help/walkthroughs/units.png',
      capturedAt: '2026-09-24T12:00:00.000Z',
      sourceUrl: 'https://app.habitta.example/help/units',
      piiReview: 'approved',
      releaseSha: '0123456789abcdef0123456789abcdef01234567',
    });
  });

  it.each([
    ['short SHA', '0123456789abcdef'],
    ['non-hex SHA', 'g123456789abcdef0123456789abcdef01234567'],
  ])('rejects captured production evidence with an invalid %s', (_reason, releaseSha) => {
    expect(() =>
      createCapturedProductionEvidence({
        screenshotAsset: 'help/walkthroughs/units.png',
        capturedAt: '2026-09-24T12:00:00.000Z',
        sourceUrl: 'https://app.habitta.example/help/units',
        piiReview: 'approved',
        releaseSha,
      }),
    ).toThrow('40-character hexadecimal release SHA');
  });

  it('rejects captured production evidence without an approved PII review', () => {
    expect(() =>
      createCapturedProductionEvidence({
        screenshotAsset: 'help/walkthroughs/units.png',
        capturedAt: '2026-09-24T12:00:00.000Z',
        sourceUrl: 'https://app.habitta.example/help/units',
        piiReview: 'rejected',
        releaseSha: '0123456789abcdef0123456789abcdef01234567',
      }),
    ).toThrow('approved PII review');
  });
});
