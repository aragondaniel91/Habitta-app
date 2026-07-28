import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import wranglerFixture from './wrangler-fixtures.json';
import {
  isMainReleaseRef,
  requireApplyConfirmation,
  requireWorkerVersionId,
  rollbackWorkerPlan,
  activeWorkerVersion,
  sanitizedMetadata,
  validateDevelopmentRelease,
  workerVersionForTag,
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
  existingResourcesFromCloudflare,
  listPaginatedCloudflareResults,
  provisionDevelopmentResources,
  resourcePlan,
  sanitizeCloudflareDiagnostic,
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
  it('normalizes Cloudflare API resources and never relies on unsupported list JSON flags', async () => {
    expect(
      existingResourcesFromCloudflare({
        queuesResult: [
          { queue_name: 'habitta-notifications-dev' },
          { queue_name: 'habitta-notifications-dlq-dev' },
        ],
        r2Result: { buckets: [{ name: 'habitta-payment-proofs-dev' }] },
        pagesResult: [{ name: 'habitta-web-dev' }],
      }),
    ).toEqual({
      queues: ['habitta-notifications-dev', 'habitta-notifications-dlq-dev'],
      buckets: ['habitta-payment-proofs-dev'],
      pages: ['habitta-web-dev'],
    });
    const source = await readFile(
      new URL('../../../scripts/release/provision-development-resources.mjs', import.meta.url),
      'utf8',
    );
    expect(source).not.toContain("queues', 'list', '--json");
    expect(source).not.toContain("r2', 'bucket', 'list', '--json");
    expect(source).toContain('/queues?per_page=100');
    expect(source).toContain('/r2/buckets?per_page=100');
    expect(source).not.toContain('/pages/projects?per_page=100');
    expect(source).toContain("path: '/pages/projects'");
    expect(source).toContain('perPage: 20');
  });
  it('paginates Cloudflare Pages projects with supported list options', async () => {
    const calls: string[] = [];
    const pages = await listPaginatedCloudflareResults({
      path: '/pages/projects',
      operation: 'pages_projects_list',
      token: 'token',
      accountId: 'account',
      fetchImpl: async (url: string) => {
        const requestUrl = new URL(url);
        const page = Number(requestUrl.searchParams.get('page'));
        calls.push(requestUrl.toString());
        return Response.json({
          success: true,
          result: [{ name: `project-${page}` }],
          result_info: { page, per_page: 20, total_pages: 2 },
        });
      },
      perPage: 20,
    });

    expect(pages).toEqual([{ name: 'project-1' }, { name: 'project-2' }]);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain('page=1&per_page=20');
    expect(calls[1]).toContain('page=2&per_page=20');
  });
  it('redacts Cloudflare tokens from operational diagnostics', () => {
    const diagnostic = sanitizeCloudflareDiagnostic(
      'request failed with token secret-token-value',
      'secret-token-value',
    );
    expect(diagnostic).toContain('[REDACTED]');
    expect(diagnostic).not.toContain('secret-token-value');
  });
  it('keeps dispatch inputs out of shell and supports repository credentials on GitHub Free', async () => {
    const root = new URL('../../../', import.meta.url);
    const [plan, apply] = await Promise.all([
      readFile(new URL('.github/workflows/development-release-plan.yml', root), 'utf8'),
      readFile(new URL('.github/workflows/development-release-apply.yml', root), 'utf8'),
    ]);
    expect(plan).not.toContain('environment: development');
    expect(apply).not.toContain('environment: development');
    expect(plan).toContain('SUPABASE_PROJECT_REF: ${{ vars.SUPABASE_PROJECT_REF }}');
    expect(apply).toContain('CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}');
    expect(apply).toContain('confirm_project_ref');
    expect(apply).toContain('GH_TOKEN: ${{ github.token }}');
    expect(
      [...plan.matchAll(/run: \|([\s\S]*?)(?=\n      -|$)/g)].map((match) => match[1]).join('\n'),
    ).not.toContain('${{ inputs.');
    expect(
      [...apply.matchAll(/run: \|([\s\S]*?)(?=\n      -|$)/g)].map((match) => match[1]).join('\n'),
    ).not.toContain('${{ inputs.');
  });
  it('requires worker versions and preserves the prior version for rollback', () => {
    expect(requireWorkerVersionId('')).toBe(false);
    expect(rollbackWorkerPlan('previous-version')[0]).toContain('previous-version@100%');
    expect(activeWorkerVersion(wranglerFixture)).toBe('previous-version');
    expect(
      activeWorkerVersion({
        versions: [
          { version_id: 'a', percentage: 50 },
          { version_id: 'b', percentage: 50 },
        ],
      }),
    ).toBeNull();
    expect(workerVersionForTag(wranglerFixture.versionList, 'release-abc')).toBe('new-version');
    expect(
      workerVersionForTag(
        [{ id: 'new', annotations: { 'workers/tag': 'other' } }],
        'release-commit',
      ),
    ).toBeNull();
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
        expectedWebOrigin: 'https://web.dev.example',
        emailMode: 'disabled',
      }),
    ).toContain('invalid_development_api_url');
    const request = async () =>
      Response.json({ status: 'ok', environment: 'development', commit: 'wrong' });
    expect(
      await runDevelopmentSmoke({
        apiUrl: 'https://api.dev.example',
        expectedCommit: 'right',
        expectedWebOrigin: 'https://web.dev.example',
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
