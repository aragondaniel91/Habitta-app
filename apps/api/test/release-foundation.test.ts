import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isMainReleaseRef,
  requireApplyConfirmation,
  requireWorkerVersionId,
  rollbackWorkerPlan,
  sanitizedMetadata,
  validateDevelopmentRelease,
} from '../../../scripts/release/release-utils.mjs';
import {
  createWorkerSecretsFile,
  workerSecretsContent,
} from '../../../scripts/release/create-worker-secrets-file.mjs';
import {
  runDevelopmentSmoke,
  detectsResendCall,
} from '../../../scripts/release/development-smoke.mjs';
import {
  provisionDevelopmentResources,
  resourcePlan,
} from '../../../scripts/release/provision-development-resources.mjs';
import { verifyWebBundleSecrets } from '../../../scripts/release/verify-web-bundle-secrets.mjs';

describe('development release safeguards', () => {
  it('rejects invalid confirmation, refs, production and non-disabled email', () => {
    expect(requireApplyConfirmation('wrong')).toBe(false);
    expect(isMainReleaseRef('feature/nope', ['abc'])).toBe(false);
    expect(
      validateDevelopmentRelease({
        appEnv: 'production',
        emailMode: 'sandbox',
        projectRef: 'expected',
        confirmProjectRef: 'other',
        worker: 'habitta-api-production',
        pages: 'habitta-web-production',
      }),
    ).toEqual(
      expect.arrayContaining([
        'app_environment_must_be_development',
        'notifications_email_must_be_disabled',
        'supabase_project_ref_mismatch',
      ]),
    );
  });
  it('does not execute provisioning commands without apply and never plans existing resources', () => {
    let calls = 0;
    provisionDevelopmentResources({ run: () => calls++ });
    expect(calls).toBe(0);
    expect(
      resourcePlan({
        queues: ['habitta-notifications-dev', 'habitta-notifications-dlq-dev'],
        buckets: ['habitta-payment-proofs-dev'],
        pages: ['habitta-web-dev'],
      }),
    ).toEqual([]);
  });
  it('requires worker versions and preserves the prior version for rollback', () => {
    expect(requireWorkerVersionId('')).toBe(false);
    expect(rollbackWorkerPlan('previous-version')[0]).toContain('previous-version@100%');
  });
  it('keeps secret content out of metadata and reports missing secrets safely', async () => {
    expect(() => workerSecretsContent({})).toThrow('worker_secrets_missing');
    const dir = await mkdtemp(join(tmpdir(), 'habitta-release-'));
    const path = join(dir, 'secrets');
    await createWorkerSecretsFile(path, {
      SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
    });
    expect(
      JSON.stringify(
        sanitizedMetadata({
          commit: 'c',
          versionId: 'v',
          timestamp: 't',
          environment: 'development',
        }),
      ),
    ).not.toContain('service');
    await rm(dir, { recursive: true });
  });
  it('rejects incorrect commits, production APIs and Resend indicators in smoke checks', async () => {
    expect(
      await runDevelopmentSmoke({
        apiUrl: 'https://production.example',
        expectedCommit: 'x',
        emailMode: 'disabled',
      }),
    ).toContain('invalid_development_api_url');
    const request = async () =>
      Response.json({ status: 'ok', environment: 'development', commit: 'wrong' });
    expect(
      await runDevelopmentSmoke({
        apiUrl: 'https://api.dev.example',
        expectedCommit: 'right',
        emailMode: 'disabled',
        request,
      }),
    ).toContain('commit_mismatch');
    expect(detectsResendCall({ url: 'https://api.resend.com/emails' })).toBe(true);
  });
  it('fails bundles with server secrets while allowing the public anon key', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'habitta-bundle-'));
    await writeFile(join(dir, 'app.js'), 'SUPABASE_SERVICE_ROLE_KEY');
    expect(await verifyWebBundleSecrets(dir)).toContain(
      'bundle_contains:SUPABASE_SERVICE_ROLE_KEY',
    );
    await writeFile(join(dir, 'app.js'), 'public-anon-key');
    expect(await verifyWebBundleSecrets(dir, ['service-key'])).toEqual([]);
    await rm(dir, { recursive: true });
  });
});
