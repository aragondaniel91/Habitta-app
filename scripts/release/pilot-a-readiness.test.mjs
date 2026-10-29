import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  compareMigrationVersions,
  evaluateReadiness,
  migrationVersions,
  runPublicSmoke,
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
