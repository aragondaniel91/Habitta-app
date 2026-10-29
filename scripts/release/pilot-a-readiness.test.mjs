import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  compareMigrationVersions,
  evaluateReadiness,
  migrationVersions,
  readCloudflareControlPlane,
  readRepositoryVersions,
  runPublicSmoke,
  validateCLIArgs,
} from './pilot-a-readiness.mjs';

const main = '78bc6948fcf2d42289eddfd8c4bae69fb6f5d890';
const old = '9ae959d77f702f27cfa8ee52c6c095ad83744677';
const healthy = (commit) => ({
  status: 'ok',
  environment: 'production',
  commit,
});
const find = (report, id) => report.checks.find((entry) => entry.id === id);

test('migration history distinguishes matching versions from schema drift proof', () => {
  const result = compareMigrationVersions(
    ['20261029134919', '20261028230000'],
    [{ version: '20261028230000' }, { version: '20261029134919' }],
  );
  assert.equal(result.status, 'pass');
  assert.equal(result.localCount, 2);
  assert.equal(result.remoteCount, 2);
});

test('missing migration or a remote-only migration always blocks history parity', () => {
  const missing = compareMigrationVersions(
    ['20261028230000', '20261029134919'],
    [{ version: '20261028230000' }],
  );
  assert.deepEqual(missing.missingInProduction, ['20261029134919']);
  assert.equal(missing.status, 'block');
  const rogue = compareMigrationVersions(['20261028230000'], ['20261028230000', '20261029134919']);
  assert.deepEqual(rogue.unknownInRepository, ['20261029134919']);
  assert.equal(rogue.status, 'block');
});

test('missing inventory remains unknown instead of silently passing', () => {
  const m = compareMigrationVersions(['20261029134919'], null);
  assert.equal(m.status, 'unknown');
  assert.equal(m.remoteCount, null);
});

test('malformed or duplicate migration versions reject untrusted inventory', () => {
  assert.throws(() => migrationVersions([{ version: 'x' }]), /invalid_migration_version/);
  assert.throws(
    () => migrationVersions(['20261029134919', '20261029134919']),
    /duplicate_migration_version/,
  );
  assert.throws(() => migrationVersions({}), /migration_history_not_an_array/);
});

test('old healthy worker is BLOCKED against current commit', () => {
  const result = evaluateReadiness({
    candidateSha: main,
    workerHealth: healthy(old),
    protectedStatus: { organizations: 401, notFound: 404, app: 200, admin: 200 },
    migrationStatus: { status: 'pass' },
  });
  assert.equal(find(result, 'worker_health').status, 'pass');
  assert.equal(find(result, 'worker_commit_matches_candidate').status, 'block');
  assert.equal(find(result, 'public_route_guards').status, 'pass');
  assert.equal(find(result, 'pages_control_plane_sha').status, 'unknown');
  assert.equal(result.releaseDecision, 'NO_GO');
});

test('matching worker does NOT waive independent human gates or prove Pages', () => {
  const result = evaluateReadiness({
    candidateSha: main,
    workerHealth: healthy(main),
    migrationStatus: { status: 'pass' },
  });
  assert.equal(find(result, 'worker_commit_matches_candidate').status, 'pass');
  assert.equal(find(result, 'independent_human_appsec').status, 'human_required');
  assert.equal(find(result, 'sql_auto_deploy_control').status, 'human_required');
  assert.equal(find(result, 'restore_and_rollback_drill').status, 'human_required');
  assert.equal(result.releaseDecision, 'NO_GO');
});

test('fails closed for unexpected health metadata and weak 200 on protected API', () => {
  const report = evaluateReadiness({
    candidateSha: main,
    workerHealth: { status: 'ok', environment: 'development', commit: main },
    protectedStatus: { organizations: 200, notFound: 404, app: 200, admin: 200 },
    migrationStatus: { status: 'unknown' },
  });
  assert.equal(find(report, 'worker_health').status, 'block');
  assert.equal(find(report, 'worker_commit_matches_candidate').status, 'unknown');
  assert.equal(find(report, 'public_route_guards').status, 'block');
  assert.equal(find(report, 'migration_history_parity').status, 'unknown');
});

test('untrusted Pages snapshot never counts as verified Cloudflare control plane', () => {
  const validSnapshot = {
    project: {
      canonical_deployment: {
        id: 'fake',
        environment: 'production',
        latest_stage: { status: 'success' },
        deployment_trigger: { metadata: { commit_hash: main } },
      },
    },
    domain: { name: 'app.mihabitta.com', status: 'active' },
  };
  const untrusted = evaluateReadiness({
    candidateSha: main,
    pagesControlPlane: validSnapshot,
    migrationStatus: { status: 'pass' },
  });
  assert.equal(find(untrusted, 'pages_control_plane_sha').status, 'unknown');
  const directAuthenticated = evaluateReadiness({
    candidateSha: main,
    pagesControlPlane: validSnapshot,
    pagesControlPlaneAuthenticated: true,
    migrationStatus: { status: 'pass' },
  });
  assert.equal(find(directAuthenticated, 'pages_control_plane_sha').status, 'pass');
  assert.equal(directAuthenticated.releaseDecision, 'NO_GO');
});

test('rejects incorrect or short SHA', () => {
  assert.throws(() => evaluateReadiness({ candidateSha: 'main' }), /candidate_sha_must_be_exact/);
});

test('public probe is GET/HEAD only and captures HTTP guards without auth secrets', async () => {
  const seen = [];
  const fakeFetch = async (url, opts) => {
    seen.push([url, opts.method, opts.headers?.Origin ?? null]);
    if (url.endsWith('/health'))
      return {
        ok: true,
        status: 200,
        json: async () => healthy(old),
      };
    const status = url.endsWith('/v1/organizations')
      ? 401
      : url.endsWith('/not-a-route')
        ? 404
        : 200;
    return { status, ok: status === 200 };
  };
  const res = await runPublicSmoke(fakeFetch);
  assert.equal(res.workerHealth.commit, old);
  assert.deepEqual(res.protectedStatus, {
    organizations: 401,
    notFound: 404,
    app: 200,
    admin: 200,
  });
  assert.deepEqual(
    seen.map((x) => x[1]),
    ['GET', 'GET', 'GET', 'HEAD', 'HEAD'],
  );
  assert.ok(seen.every((x) => x[2] === null || x[2] === 'https://app.mihabitta.com'));
});

test('readRepositoryVersions takes exact committed tree, not untracked local files', () => {
  let invocation = null;
  const versions = readRepositoryVersions('/an/isolated/repo', (...args) => {
    invocation = args;
    return (
      'supabase/migrations/20261028230000_example.sql\n' +
      'supabase/migrations/20261029134919_second.sql\n'
    );
  });
  assert.deepEqual(versions, ['20261028230000', '20261029134919']);
  assert.deepEqual(invocation[1], [
    'ls-tree',
    '-r',
    '--name-only',
    'HEAD',
    '--',
    'supabase/migrations',
  ]);
});

test('strict CLI accepts pnpm separator, denies waiver flags and missing values', () => {
  assert.deepEqual(validateCLIArgs(['--', '--online', '--migration-history', 'x.json']), [
    '--online',
    '--migration-history',
    'x.json',
  ]);
  assert.throws(() => validateCLIArgs(['--waive-571']), /unknown_argument/);
  assert.throws(() => validateCLIArgs(['--approve']), /unknown_argument/);
  assert.throws(() => validateCLIArgs(['--migration-history']), /missing_argument/);
  assert.throws(() => validateCLIArgs(['--pages-control-plane', '--online']), /missing_argument/);
});

test('explicitly attempted but unreachable worker blocks, not unknown', () => {
  const result = evaluateReadiness({
    candidateSha: main,
    workerHealth: null,
    workerProbeAttempted: true,
    migrationStatus: { status: 'pass' },
  });
  assert.equal(find(result, 'worker_health').status, 'block');
  assert.equal(find(result, 'worker_commit_matches_candidate').status, 'block');
});

test('even ALL automated PASS checks cannot produce a release approval', () => {
  const pages = {
    project: {
      canonical_deployment: {
        id: 'example',
        environment: 'production',
        latest_stage: { status: 'success' },
        deployment_trigger: { metadata: { commit_hash: main } },
      },
    },
    domain: { name: 'app.mihabitta.com', status: 'active' },
  };
  const report = evaluateReadiness({
    candidateSha: main,
    candidateTreeClean: true,
    workerHealth: healthy(main),
    workerProbeAttempted: true,
    protectedStatus: { organizations: 401, notFound: 404, app: 200, admin: 200 },
    migrationStatus: { status: 'pass' },
    pagesControlPlane: pages,
    pagesControlPlaneAuthenticated: true,
  });
  assert.equal(report.checks.filter((x) => x.status === 'human_required').length, 5);
  assert.equal(report.checks.filter((x) => x.status === 'block').length, 0);
  assert.equal(report.releaseDecision, 'NO_GO');
  assert.match(find(report, 'migration_history_parity').detail, /not_schema_drift_proof/);
});

test('Cloudflare live probe only GETs API and never includes token in errors', async () => {
  const token = 'FAKE-SECRET-MUST-NOT-APPEAR';
  const authEnv = { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: 'safeaccount123' };
  const requests = [];
  const stub = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, status: 200, json: async () => ({ success: true, result: { name: 'ok' } }) };
  };
  const actual = await readCloudflareControlPlane(stub, authEnv);
  assert.deepEqual(Object.keys(actual), ['project', 'domain']);
  assert.equal(JSON.stringify(actual).includes(token), false);
  assert.equal(requests.length, 2);
  assert.ok(
    requests.every(
      (x) =>
        x.options.method === 'GET' &&
        x.options.redirect === 'error' &&
        x.url.startsWith('https://api.cloudflare.com/'),
    ),
  );
  assert.ok(requests.every((x) => x.options.headers.Authorization === 'Bearer ' + token));
  await assert.rejects(
    () => readCloudflareControlPlane(async () => ({ ok: false, status: 403 }), authEnv),
    /cloudflare_control_plane_http_403/,
  );
  await assert.rejects(
    () =>
      readCloudflareControlPlane(
        async () => ({ ok: true, json: async () => ({ success: false }) }),
        authEnv,
      ),
    /cloudflare_control_plane_error/,
  );
  await assert.rejects(
    () => readCloudflareControlPlane(stub, { ...authEnv, CLOUDFLARE_ACCOUNT_ID: '../unsafe' }),
    /cloudflare_account_id_invalid/,
  );
  await assert.rejects(
    () => readCloudflareControlPlane(stub, {}),
    /cloudflare_read_credentials_missing/,
  );
});

test('production HTML redirect is not mistaken for successful HTTP 200', () => {
  const report = evaluateReadiness({
    candidateSha: main,
    workerHealth: healthy(old),
    protectedStatus: { organizations: 401, notFound: 404, app: 302, admin: 200 },
    migrationStatus: { status: 'pass' },
  });
  assert.equal(find(report, 'public_route_guards').status, 'block');
});

test('CLI shell exit code 2 deliberately prevents NO_GO from being chained to deploy', () => {
  const script = fileURLToPath(new URL('./pilot-a-readiness.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script, '--json'], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).releaseDecision, 'NO_GO');
});

test('dirty candidate worktree blocks evidence even with matching SHA metadata', () => {
  const report = evaluateReadiness({
    candidateSha: main,
    candidateTreeClean: false,
    workerHealth: healthy(main),
    migrationStatus: { status: 'pass' },
  });
  assert.equal(find(report, 'candidate_commit_tree_clean').status, 'block');
  assert.equal(report.releaseDecision, 'NO_GO');
});
