import { describe, expect, it } from 'vitest';
import { validateProductionPagesState } from '../../../scripts/release/verify-production-pages-control-plane.mjs';

const expectedCommit = '2fedf370df955ea155eda97e45ee6ad19c49be68';
const expectedDomain = 'app.mihabitta.com';

const valid = {
  project: {
    canonical_deployment: {
      id: 'deployment-id',
      environment: 'production',
      latest_stage: { status: 'success' },
      deployment_trigger: { metadata: { commit_hash: expectedCommit } },
    },
  },
  domain: { name: expectedDomain, status: 'active' },
  expectedCommit,
  expectedDomain,
};

describe('production Pages control-plane validation', () => {
  it('accepts the expected successful production deployment and active domain', () => {
    expect(validateProductionPagesState(valid)).toEqual([]);
  });

  it('fails closed on deployment, commit or domain mismatches', () => {
    expect(
      validateProductionPagesState({
        ...valid,
        project: {
          canonical_deployment: {
            id: 'deployment-id',
            environment: 'preview',
            latest_stage: { status: 'failure' },
            deployment_trigger: { metadata: { commit_hash: 'wrong-commit' } },
          },
        },
        domain: { name: expectedDomain, status: 'pending' },
      }),
    ).toEqual(
      expect.arrayContaining([
        'canonical_deployment_not_production',
        'canonical_deployment_not_successful',
        'canonical_deployment_commit_mismatch',
        'canonical_domain_not_active',
      ]),
    );
  });
});
