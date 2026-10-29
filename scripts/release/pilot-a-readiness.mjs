#!/usr/bin/env node
// Engineering-only, read-only Release A assessment. It NEVER authorizes production deployment.
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateProductionPagesState } from './verify-production-pages-control-plane.mjs';

export const PROD_WORKER_URL = 'https://habitta-api-prod.aragondaniel91.workers.dev';
export const PROD_PAGES_URL = 'https://app.mihabitta.com';
export const PROD_ADMIN_URL = 'https://admin.mihabitta.com';
const SHA = /^[0-9a-f]{40}$/;
const MIGRATION_VERSION = /^\d{14}$/;

export function migrationVersions(migrations) {
  if (!Array.isArray(migrations)) throw new Error('migration_history_not_an_array');
  const versions = migrations.map((item) => {
    const value = typeof item === 'string' ? item : item?.version;
    if (!MIGRATION_VERSION.test(String(value ?? ''))) {
      throw new Error('invalid_migration_version');
    }
    return String(value);
  });
  if (new Set(versions).size !== versions.length) {
    throw new Error('duplicate_migration_version');
  }
  return versions.sort();
}

export function compareMigrationVersions(localVersions, remoteVersions) {
  if (remoteVersions === null) {
    return {
      status: 'unknown',
      localCount: localVersions.length,
      remoteCount: null,
      missingInProduction: [],
      unknownInRepository: [],
    };
  }
  const local = new Set(migrationVersions(localVersions));
  const remote = new Set(migrationVersions(remoteVersions));
  const missingInProduction = [...local].filter((value) => !remote.has(value));
  const unknownInRepository = [...remote].filter((value) => !local.has(value));
  return {
    status: missingInProduction.length || unknownInRepository.length ? 'block' : 'pass',
    localCount: local.size,
    remoteCount: remote.size,
    missingInProduction,
    unknownInRepository,
  };
}

export function evaluateReadiness({
  candidateSha,
  candidateTreeClean = null,
  workerHealth = null,
  workerProbeAttempted = false,
  protectedStatus = null,
  migrationStatus,
  pagesControlPlane = null,
  pagesControlPlaneAuthenticated = false,
} = {}) {
  const checks = [];
  const add = (id, status, detail) => checks.push({ id, status, detail });
  if (!SHA.test(candidateSha ?? '')) throw new Error('candidate_sha_must_be_exact');
  add(
    'candidate_commit_tree_clean',
    candidateTreeClean === null ? 'unknown' : candidateTreeClean ? 'pass' : 'block',
    candidateTreeClean === null
      ? 'candidate_tree_not_checked'
      : candidateTreeClean
        ? 'committed_candidate_tree'
        : 'local_modifications_not_part_of_candidate_sha',
  );
  const workerSha = workerHealth?.commit;
  const healthy =
    workerHealth?.status === 'ok' &&
    workerHealth?.environment === 'production' &&
    SHA.test(workerSha ?? '');
  add(
    'worker_health',
    workerHealth === null
      ? workerProbeAttempted
        ? 'block'
        : 'unknown'
      : healthy
        ? 'pass'
        : 'block',
    healthy
      ? workerSha
      : workerProbeAttempted
        ? 'production_worker_health_unreachable_or_invalid'
        : 'production_worker_health_unverified',
  );
  add(
    'worker_commit_matches_candidate',
    !healthy
      ? workerProbeAttempted
        ? 'block'
        : 'unknown'
      : workerSha === candidateSha
        ? 'pass'
        : 'block',
    healthy ? 'worker=' + workerSha : 'worker_sha_not_proven',
  );

  add(
    'public_route_guards',
    protectedStatus === null
      ? 'unknown'
      : protectedStatus?.organizations === 401 &&
          protectedStatus?.notFound === 404 &&
          protectedStatus?.app === 200 &&
          protectedStatus?.admin === 200
        ? 'pass'
        : 'block',
    protectedStatus === null ? 'public_smoke_not_run' : 'only_unauthenticated_read_only_smoke',
  );

  add(
    'migration_history_parity',
    migrationStatus?.status ?? 'unknown',
    migrationStatus?.status === 'pass'
      ? 'version_history_matches;_not_schema_drift_proof'
      : 'missing_or_extra_versions_or_not_checked',
  );

  const pagesValid =
    pagesControlPlane !== null &&
    validateProductionPagesState({
      project: pagesControlPlane.project,
      domain: pagesControlPlane.domain,
      expectedCommit: candidateSha,
      expectedDomain: 'app.mihabitta.com',
    }).length === 0;
  add(
    'pages_control_plane_sha',
    pagesControlPlane === null
      ? 'unknown'
      : pagesValid
        ? pagesControlPlaneAuthenticated
          ? 'pass'
          : 'unknown'
        : 'block',
    pagesValid
      ? pagesControlPlaneAuthenticated
        ? 'authenticated_cloudflare_commit=' + candidateSha
        : 'snapshot_matches_but_its_origin_is_unverified'
      : 'cloudflare_verified_commit_missing',
  );

  // Human approvals MUST NOT be accepted from a local flag/fixture or inferred from CI.
  for (const [id, detail] of [
    [
      'sql_auto_deploy_control',
      'supabase_github_integration_setting_and_operator_not_verified_issue_612',
    ],
    ['independent_human_appsec', 'qualified_independent_human_signoff_required_issue_571'],
    ['privileged_rpc_assessment', 'sensitive_inventory_human_review_required_pr_569'],
    ['restore_and_rollback_drill', 'restore_drill_and_rollback_evidence_required_issue_573'],
    ['founder_release_approval', 'release_a_specific_human_approval_required_issue_573'],
  ])
    add(id, 'human_required', detail);

  return {
    mode: 'read_only_evidence',
    releaseDecision: 'NO_GO', // Deliberately NEVER makes a release decision.
    candidateSha,
    workerSha: healthy ? workerSha : null,
    checks,
  };
}

export function readRepositoryVersions(repositoryRoot, readGit = execFileSync) {
  // Read from the candidate COMMIT, not the possibly dirty working directory.
  const tracked = readGit(
    'git',
    ['ls-tree', '-r', '--name-only', 'HEAD', '--', 'supabase/migrations'],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
    },
  );
  const entries = String(tracked)
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((name) => name.endsWith('.sql'))
    .map((name) => {
      const match = /^supabase\/migrations\/(\d{14})_[^.]+\.sql$/.exec(name);
      if (!match) throw new Error('unrecognized_migration_filename');
      return match[1];
    });
  return migrationVersions(entries);
}

export async function runPublicSmoke(fetcher = fetch) {
  async function check(url, options) {
    try {
      const response = await fetcher(url, {
        ...options,
        signal: AbortSignal.timeout(15000),
        redirect: 'manual',
      });
      return response;
    } catch {
      return null;
    }
  }
  const [health, organizations, notFound, app, admin] = await Promise.all([
    check(PROD_WORKER_URL + '/health', {
      method: 'GET',
      headers: { Origin: PROD_PAGES_URL },
    }),
    check(PROD_WORKER_URL + '/v1/organizations', {
      method: 'GET',
      headers: { Origin: PROD_PAGES_URL },
    }),
    check(PROD_WORKER_URL + '/not-a-route', { method: 'GET' }),
    check(PROD_PAGES_URL, { method: 'HEAD' }),
    check(PROD_ADMIN_URL, { method: 'HEAD' }),
  ]);
  let workerHealth = null;
  if (health?.ok) {
    try {
      workerHealth = await health.json();
    } catch {
      /* unknown remains blocked */
    }
  }
  return {
    workerHealth,
    workerProbeAttempted: true,
    protectedStatus: {
      organizations: organizations?.status ?? null,
      notFound: notFound?.status ?? null,
      app: app?.status ?? null,
      admin: admin?.status ?? null,
    },
  };
}

export async function readCloudflareControlPlane(fetcher = fetch, env = process.env) {
  const token = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) throw new Error('cloudflare_read_credentials_missing');
  if (!/^[a-z0-9_-]+$/i.test(accountId)) throw new Error('cloudflare_account_id_invalid');
  const base =
    'https://api.cloudflare.com/client/v4/accounts/' +
    accountId +
    '/pages/projects/habitta-web-prod';
  async function getJson(path) {
    const response = await fetcher(base + path, {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('cloudflare_control_plane_http_' + response.status);
    const json = await response.json();
    if (json?.success !== true) throw new Error('cloudflare_control_plane_error');
    return json.result;
  }
  const [project, domain] = await Promise.all([getJson(''), getJson('/domains/app.mihabitta.com')]);
  return { project, domain };
}

function argValue(args, key) {
  const idx = args.indexOf(key);
  if (idx < 0) return null;
  if (!args[idx + 1] || args[idx + 1].startsWith('--')) {
    throw new Error('missing_argument_' + key);
  }
  return args[idx + 1];
}

export function validateCLIArgs(rawArgs) {
  const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;
  const allowed = [
    '--online',
    '--json',
    '--migration-history',
    '--pages-control-plane',
    '--cloudflare-live',
  ];
  for (let i = 0; i < args.length; i++) {
    if (!allowed.includes(args[i])) throw new Error('unknown_argument');
    if (args[i] === '--migration-history' || args[i] === '--pages-control-plane') {
      if (!args[i + 1] || args[i + 1].startsWith('--'))
        throw new Error('missing_argument_' + args[i]);
      i++;
    }
  }
  return args;
}

export async function runCLI(rawArgs = process.argv.slice(2)) {
  const args = validateCLIArgs(rawArgs);
  const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
  const candidateSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
  const candidateTreeClean =
    execFileSync('git', ['status', '--porcelain'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim().length === 0;
  const localVersions = readRepositoryVersions(repoRoot);
  let remoteVersions = null;
  const history = argValue(args, '--migration-history');
  if (history) {
    const raw = JSON.parse(await readFile(resolve(history), 'utf8'));
    remoteVersions = migrationVersions(Array.isArray(raw) ? raw : raw.migrations);
  }
  let pagesControlPlane = null;
  let pagesControlPlaneAuthenticated = false;
  const pagesPath = argValue(args, '--pages-control-plane');
  if (pagesPath && args.includes('--cloudflare-live'))
    throw new Error('pages_sources_mutually_exclusive');
  if (pagesPath) {
    const raw = JSON.parse(await readFile(resolve(pagesPath), 'utf8'));
    if (!raw?.project || !raw?.domain) throw new Error('invalid_pages_control_plane_evidence');
    pagesControlPlane = raw;
  }
  if (args.includes('--cloudflare-live')) {
    pagesControlPlane = await readCloudflareControlPlane();
    pagesControlPlaneAuthenticated = true;
  }
  const smoke = args.includes('--online') ? await runPublicSmoke() : {};
  const report = evaluateReadiness({
    candidateSha,
    candidateTreeClean,
    ...smoke,
    migrationStatus: compareMigrationVersions(localVersions, remoteVersions),
    pagesControlPlane,
    pagesControlPlaneAuthenticated,
  });
  if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else {
    console.log('HABITTA RELEASE A / read-only engineering preflight');
    console.log('Candidate: ' + candidateSha);
    for (const check of report.checks) {
      console.log(check.status.toUpperCase().padEnd(15) + check.id + ': ' + check.detail);
    }
    console.log('FINAL: NO_GO — evidence only; independent human gates remain mandatory.');
  }
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCLI()
    .then(() => {
      process.exitCode = 2;
    }) // NO_GO must not be mistaken for shell success.
    .catch((error) => {
      console.error('preflight_failed:' + error.message);
      process.exitCode = 1;
    });
}
