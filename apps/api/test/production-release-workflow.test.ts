import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = new URL('../../../', import.meta.url);

// Production must deploy the exact Worker version emitted by the upload command itself.
describe('production release workflow hardening', () => {
  it('fails closed around production database identity, Stripe secrets and canonical reachability', async () => {
    const workflow = await readFile(
      new URL('.github/workflows/production-release.yml', root),
      'utf8',
    );

    expect(workflow).toContain('environment: production');
    expect(workflow).toContain('HABITTA_PROD_PROJECT_REF: kgsfaahixbcwcmykmhat');
    expect(workflow).toContain('BILLING_PROVIDER: stripe');
    expect(workflow).toContain('STRIPE_SECRET_KEY: ${{ secrets.STRIPE_SECRET_KEY }}');
    expect(workflow).toContain('STRIPE_WEBHOOK_SECRET: ${{ secrets.STRIPE_WEBHOOK_SECRET }}');
    expect(workflow).toMatch(
      /for name in [^\n]*STRIPE_SECRET_KEY[^\n]*STRIPE_WEBHOOK_SECRET[^\n]*; do/,
    );
    expect(workflow).toContain('node scripts/release/validate-production-release.mjs');
    expect(workflow).toContain('bash scripts/release/pre-migration-production-backup.sh');
    expect(workflow).toContain('habitta-integrations-prod');
    expect(workflow).toContain('habitta-integrations-dlq-prod');
    expect(workflow).toContain('habitta-database-backups-prod');
    expect(workflow).toContain('if ! grep -R -F "$SUPABASE_URL" apps/web/dist >/dev/null; then');
    expect(workflow).toContain('Smoke production Pages deployment and API wiring');
    expect(workflow).toContain('node scripts/release/verify-production-pages-control-plane.mjs');
    expect(workflow).toContain('/deployments/$PREVIOUS_PAGES_DEPLOYMENT/rollback');
    expect(workflow).toContain(
      'wrangler versions deploy "$PREVIOUS_WORKER_VERSION@100%" --env prod',
    );
    expect(workflow).not.toContain('canonical_domain_runner_403');
    expect(workflow).not.toContain('browser verification required');
    expect(workflow).not.toContain('fetch(`${canonicalUrl}/app/dashboard`');
    expect(workflow).not.toContain('HABITTA_DEV_PROJECT_REF');
  });

  it('uses Wrangler structured output for the uploaded production Worker version id', async () => {
    const workflow = await readFile(
      new URL('.github/workflows/production-release.yml', root),
      'utf8',
    );

    expect(workflow).toContain(
      'UPLOAD_OUTPUT_FILE="$RUNNER_TEMP/production-worker-version-upload.ndjson"',
    );
    expect(workflow).toContain('WRANGLER_OUTPUT_FILE_PATH="$UPLOAD_OUTPUT_FILE"');
    expect(workflow).toContain('select(.type == "version-upload")');
    expect(workflow).toContain('.version_id');
    expect(workflow).toContain(
      'Wrangler did not report exactly one uploaded production Worker version ID.',
    );
    expect(workflow).not.toContain('wrangler versions list --env prod --json');
    expect(workflow).not.toContain('VERSION_LIST_FILE');
  });

  it('applies and fail-closes production Worker cron triggers after deploying its version', async () => {
    const workflow = await readFile(
      new URL('.github/workflows/production-release.yml', root),
      'utf8',
    );

    const workerDeploy = workflow.indexOf('Bootstrap or update production Worker');
    const triggerDeploy = workflow.indexOf('Apply and verify production Worker cron triggers');
    const pagesDeploy = workflow.indexOf('Deploy production Pages');

    expect(triggerDeploy).toBeGreaterThan(workerDeploy);
    expect(triggerDeploy).toBeLessThan(pagesDeploy);
    expect(workflow).toContain('wrangler triggers deploy --env prod');
    expect(workflow).toContain(
      '/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/habitta-api-prod/schedules',
    );
    expect(workflow).toContain('.result.schedules[]?');
    expect(workflow).toContain('*/5 * * * *');
    expect(workflow).toContain(
      'Deploying a Worker version does not guarantee its cron triggers are applied.',
    );
    expect(workflow).toContain('exit 1');
    expect(workflow).toContain(
      'wrangler versions deploy "$PREVIOUS_WORKER_VERSION@100%" --env prod',
    );
  });

  it('surfaces Cloudflare Pages deployment errors without weakening the release fail-close', async () => {
    const workflow = await readFile(
      new URL('.github/workflows/production-release.yml', root),
      'utf8',
    );

    expect(workflow).toContain(
      'if DEPLOY_OUTPUT=$(pnpm --filter @habitta/api exec wrangler pages deploy',
    );
    expect(workflow).toContain('DEPLOY_EXIT=$?');
    expect(workflow).toContain('printf \'%s\\n\' "$DEPLOY_OUTPUT"');
    expect(workflow).toContain(
      'echo "::error::Cloudflare Pages deploy failed (exit $DEPLOY_EXIT)."',
    );
    expect(workflow).toContain('exit "$DEPLOY_EXIT"');
    expect(workflow).toContain('PAGES_DEPLOYED=true');
    expect(workflow).toContain('Roll back production edge deploys on release failure');
  });

  it('verifies static Pages releases without treating arbitrary edge failures as healthy', async () => {
    const workflow = await readFile(
      new URL('.github/workflows/static-sites-release.yml', root),
      'utf8',
    );

    expect(workflow).toContain('Prepare Pages verification context');
    expect(workflow).toContain('CLOUDFLARE_PAGES_PROJECT_NAME=$PAGES_PROJECT');
    expect(workflow).toContain('CLOUDFLARE_PAGES_PROD_URL=$EXPECTED_URL');
    expect(workflow).toContain('curl --connect-timeout 5 --max-time 15');
    expect(workflow).toContain('403)');
    expect(workflow).toContain(
      'Canonical domain denied this GitHub runner with HTTP 403; requiring Cloudflare control-plane verification next.',
    );
    expect(workflow).not.toContain('if [[ "$INPUT_TARGET" == admin-* ]]');
    expect(workflow).not.toContain(
      'Admin canonical domain denied this GitHub runner with HTTP 403; requiring Cloudflare control-plane verification next.',
    );
    expect(workflow).toContain('Verify Pages control plane');
    expect(workflow).toContain('node scripts/release/verify-production-pages-control-plane.mjs');
    expect(workflow).toContain(
      'Canonical domain returned an unexpected status: $EXPECTED_URL ($last_status)',
    );
    expect(workflow).not.toContain('curl -fsS "$EXPECTED_URL"');
  });

  it('keeps Supabase identity out of the static production Wrangler vars', async () => {
    const wrangler = await readFile(new URL('apps/api/wrangler.jsonc', root), 'utf8');
    const prodSection = wrangler.slice(wrangler.indexOf('"prod": {'));

    expect(prodSection).not.toContain('kgsfaahixbcwcmykmhat');
    expect(prodSection).not.toContain('habitta-web-prod.pages.dev');
    expect(prodSection).toContain('"APP_BASE_URL": "https://app.mihabitta.com"');
    expect(prodSection).toContain('"CORS_ALLOWED_ORIGINS": "https://app.mihabitta.com"');
  });

  it('pins scheduled production backups to the canonical project', async () => {
    const workflow = await readFile(new URL('.github/workflows/database-backup.yml', root), 'utf8');

    expect(workflow).toContain('SUPABASE_PROJECT_REF: ${{ vars.SUPABASE_PROJECT_REF }}');
    expect(workflow).toContain('HABITTA_PROD_PROJECT_REF: kgsfaahixbcwcmykmhat');
    expect(workflow).toContain(
      'Refusing production backup: SUPABASE_PROJECT_REF does not match Habitta Production.',
    );
    expect(workflow).not.toContain('HABITTA_DEV_PROJECT_REF');
  });
});

// Behaviour of the cron-schedule capture, apply and restore steps, executed exactly as written in
// the workflow with Cloudflare (curl) and Wrangler (pnpm) replaced by recorded stand-ins.
const TOKEN = 'cf-token-must-never-be-printed';
const SCHEDULES_URL =
  'https://api.cloudflare.com/client/v4/accounts/acc-1/workers/scripts/habitta-api-prod/schedules';
const canRunSteps =
  process.platform !== 'win32' && spawnSync('bash', ['-c', 'command -v jq']).status === 0;

const CURL_STUB = [
  '#!/usr/bin/env bash',
  'method=GET; out=; fmt=; data=; url=; fail=false',
  'while [ $# -gt 0 ]; do',
  '  case "$1" in',
  '    -X) method=$2; shift 2 ;;',
  '    -o) out=$2; shift 2 ;;',
  '    -w) fmt=$2; shift 2 ;;',
  '    -H) case "$2" in *"$CLOUDFLARE_API_TOKEN"*) echo AUTH >>"$STUB/auth.log" ;; esac; shift 2 ;;',
  '    --data-binary) data=$2; shift 2 ;;',
  '    -*) case "$1" in -*f*) fail=true ;; esac; shift ;;',
  '    *) url=$1; shift ;;',
  '  esac',
  'done',
  'n=$(( $(cat "$STUB/count.$method" 2>/dev/null || echo 0) + 1 )); echo "$n" >"$STUB/count.$method"',
  'sent=; [ -n "$data" ] && sent=$(cat "${data#@}")',
  'echo "$method $url $sent" >>"$STUB/calls.log"',
  'f="$STUB/$method.$n"',
  '[ -f "$f" ] || { echo "curl: (7) no recorded response for $method #$n" >&2; exit 7; }',
  'code=$(head -1 "$f"); body=$(tail -n +2 "$f")',
  '[ "$code" = 000 ] && { echo \'curl: (7) Failed to connect\' >&2; exit 7; }',
  'if [ -n "$out" ]; then printf \'%s\' "$body" >"$out"; fi',
  'if [ "$fail" = true ] && [ "$code" -ge 400 ]; then echo "curl: (22) The requested URL returned error: $code" >&2; exit 22; fi',
  '[ -z "$out" ] && printf \'%s\' "$body"',
  '[ -n "$fmt" ] && printf \'%s\' "$code"',
  'exit 0',
  '',
].join('\n');
const PNPM_STUB = [
  '#!/usr/bin/env bash',
  'echo "PNPM $*" >>"$STUB/calls.log"',
  'case "$*" in *"triggers deploy"*) exit "${PNPM_TRIGGERS_EXIT:-0}" ;; *"versions deploy"*) exit "${PNPM_ROLLBACK_EXIT:-0}" ;; esac',
  'exit 0',
  '',
].join('\n');

function stepScript(workflow: string, name: string): string {
  const lines = workflow.split('\n');
  const start = lines.findIndex((l) => l.trim() === `- name: ${name}`);
  if (start < 0) throw new Error(`step not found: ${name}`);
  const run = lines.findIndex((l, i) => i > start && l.trim() === 'run: |');
  const body: string[] = [];
  for (const line of lines.slice(run + 1)) {
    if (line.trim() !== '' && !line.startsWith('          ')) break;
    body.push(line.slice(10));
  }
  return body.join('\n');
}

type Response = { code: number | string; body?: unknown };
const schedules = (...crons: string[]) => ({
  success: true,
  errors: [],
  result: { schedules: crons.map((cron) => ({ cron, created_on: 'x', modified_on: 'x' })) },
});

// One release job: a shared runner temp dir and GITHUB_ENV, and the Cloudflare responses in order.
function releaseJob(responses: { GET?: Response[]; PUT?: Response[] }) {
  const dir = mkdtempSync(join(tmpdir(), 'habitta-cron-'));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'curl'), CURL_STUB, { mode: 0o755 });
  writeFileSync(join(bin, 'pnpm'), PNPM_STUB, { mode: 0o755 });
  for (const [method, list] of Object.entries(responses))
    list?.forEach((r, i) =>
      writeFileSync(
        join(dir, `${method}.${i + 1}`),
        `${r.code}\n${r.body === undefined ? '' : JSON.stringify(r.body)}`,
      ),
    );
  const githubEnv = join(dir, 'github_env');
  writeFileSync(githubEnv, '');
  const jobEnv: Record<string, string> = {};
  const read = (f: string) => {
    try {
      return readFileSync(join(dir, f), 'utf8');
    } catch {
      return '';
    }
  };
  return {
    env: jobEnv,
    calls: () => read('calls.log').trim().split('\n').filter(Boolean),
    authHeaders: () => read('auth.log').trim().split('\n').filter(Boolean).length,
    run(workflow: string, name: string, extra: Record<string, string> = {}) {
      const script = join(dir, 'step.sh');
      writeFileSync(script, stepScript(workflow, name));
      writeFileSync(githubEnv, '');
      // GitHub's default `run` shell on Linux: bash -e {0}.
      const r = spawnSync('bash', ['--noprofile', '--norc', '-e', script], {
        encoding: 'utf8',
        env: {
          PATH: `${bin}:${process.env.PATH}`,
          STUB: dir,
          RUNNER_TEMP: dir,
          GITHUB_ENV: githubEnv,
          CLOUDFLARE_API_TOKEN: TOKEN,
          CLOUDFLARE_ACCOUNT_ID: 'acc-1',
          ...jobEnv,
          ...extra,
        },
      });
      for (const line of readFileSync(githubEnv, 'utf8').split('\n')) {
        const eq = line.indexOf('=');
        if (eq > 0) jobEnv[line.slice(0, eq)] = line.slice(eq + 1);
      }
      const output = `${r.stdout}${r.stderr}`;
      expect(output).not.toContain(TOKEN);
      return { status: r.status, output };
    },
    previous: () => read('production-worker-previous-schedules.json'),
  };
}

const CAPTURE = 'Capture production Worker cron schedules';
const APPLY = 'Apply and verify production Worker cron triggers';
const ROLLBACK = 'Roll back production edge deploys on release failure';
const deployed = { PREVIOUS_WORKER_VERSION: 'ver-old', WORKER_DEPLOYED: 'true' };

describe.skipIf(!canRunSteps)('production Worker cron schedules: capture, apply, restore', () => {
  const workflowText = () =>
    readFile(new URL('.github/workflows/production-release.yml', root), 'utf8');

  it('captures before any deploy or migration, and restores after the Worker version rollback', async () => {
    const w = await workflowText();
    const at = (s: string) => w.indexOf(s);
    expect(at(CAPTURE)).toBeGreaterThan(at('Capture production rollback targets'));
    expect(at(CAPTURE)).toBeLessThan(at('Apply reviewed Supabase migrations'));
    expect(at(CAPTURE)).toBeLessThan(at('Bootstrap or update production Worker'));
    const rollback = stepScript(w, ROLLBACK);
    expect(rollback.indexOf('-X PUT')).toBeGreaterThan(
      rollback.indexOf('wrangler versions deploy "$PREVIOUS_WORKER_VERSION@100%"'),
    );
  });

  it('success: captures the exact list, applies with wrangler and verifies */5 without touching the rollback', async () => {
    const w = await workflowText();
    const job = releaseJob({
      GET: [
        { code: 200, body: schedules('*/5 * * * *') },
        { code: 200, body: schedules('*/5 * * * *') },
      ],
    });
    expect(job.run(w, CAPTURE, { PREVIOUS_WORKER_VERSION: 'ver-old' }).status).toBe(0);
    expect(job.env.PREVIOUS_SCHEDULES_CAPTURED).toBe('true');
    expect(JSON.parse(job.previous())).toEqual([{ cron: '*/5 * * * *' }]);
    expect(job.run(w, APPLY, deployed).status).toBe(0);
    expect(job.calls()).toContain(
      'PNPM --filter @habitta/api exec wrangler triggers deploy --env prod',
    );
    expect(job.calls().filter((c) => c.startsWith('PUT'))).toEqual([]);
    expect(job.calls().every((c) => c.startsWith('PNPM') || c.includes(SCHEDULES_URL))).toBe(true);
    expect(job.authHeaders()).toBe(2);
  });

  it('verification error: the job fails and the rollback restores and verifies the previous schedules', async () => {
    const w = await workflowText();
    const job = releaseJob({
      GET: [
        { code: 200, body: schedules('0 * * * *') },
        { code: 200, body: schedules() },
        { code: 200, body: schedules('0 * * * *') },
      ],
      PUT: [{ code: 200, body: schedules('0 * * * *') }],
    });
    job.run(w, CAPTURE, { PREVIOUS_WORKER_VERSION: 'ver-old' });
    const apply = job.run(w, APPLY, deployed);
    expect(apply.status).not.toBe(0);
    expect(apply.output).toContain('Expected active cron schedule */5 * * * * was not returned');
    const rollback = job.run(w, ROLLBACK, deployed);
    expect(rollback.status).toBe(0);
    expect(rollback.output).toContain('restored and verified');
    const calls = job.calls();
    const versionRollback = calls.indexOf(
      'PNPM --filter @habitta/api exec wrangler versions deploy ver-old@100% --env prod --yes',
    );
    const put = calls.indexOf(`PUT ${SCHEDULES_URL} [{"cron":"0 * * * *"}]`);
    expect(versionRollback).toBeGreaterThan(-1);
    expect(put).toBeGreaterThan(versionRollback);
  });

  it('a failure in a later phase (smoke, Pages) also restores the schedules; restoring twice is harmless', async () => {
    const w = await workflowText();
    const job = releaseJob({
      GET: [
        { code: 200, body: schedules('0 3 * * *', '*/5 * * * *') },
        { code: 200, body: schedules('*/5 * * * *') },
        { code: 200, body: schedules('*/5 * * * *', '0 3 * * *') },
        { code: 200, body: schedules('*/5 * * * *', '0 3 * * *') },
      ],
      PUT: [
        { code: 200, body: schedules('0 3 * * *', '*/5 * * * *') },
        { code: 200, body: schedules('0 3 * * *', '*/5 * * * *') },
      ],
    });
    job.run(w, CAPTURE, { PREVIOUS_WORKER_VERSION: 'ver-old' });
    expect(job.run(w, APPLY, deployed).status).toBe(0);
    expect(job.run(w, ROLLBACK, deployed).status).toBe(0);
    expect(job.run(w, ROLLBACK, deployed).status).toBe(0);
    const puts = job.calls().filter((c) => c.startsWith('PUT'));
    expect(puts).toEqual([
      `PUT ${SCHEDULES_URL} [{"cron":"0 3 * * *"},{"cron":"*/5 * * * *"}]`,
      `PUT ${SCHEDULES_URL} [{"cron":"0 3 * * *"},{"cron":"*/5 * * * *"}]`,
    ]);
  });

  it('an empty previous list is preserved and restored as empty when wrangler fails to apply', async () => {
    const w = await workflowText();
    const job = releaseJob({
      GET: [
        { code: 200, body: schedules() },
        { code: 200, body: schedules() },
      ],
      PUT: [{ code: 200, body: schedules() }],
    });
    job.run(w, CAPTURE, { PREVIOUS_WORKER_VERSION: 'ver-old' });
    expect(job.previous()).toBe('[]\n');
    expect(job.run(w, APPLY, { ...deployed, PNPM_TRIGGERS_EXIT: '1' }).status).not.toBe(0);
    const rollback = job.run(w, ROLLBACK, deployed);
    expect(rollback.status).toBe(0);
    expect(job.calls()).toContain(`PUT ${SCHEDULES_URL} []`);
  });

  it('a failed restore is reported as an incomplete recovery and fails the job', async () => {
    const w = await workflowText();
    const cases: { PUT: Response[]; GET: Response[] }[] = [
      { PUT: [{ code: 500, body: { success: false } }], GET: [] },
      { PUT: [{ code: 200, body: { success: false } }], GET: [] },
      {
        PUT: [{ code: 200, body: schedules('0 * * * *') }],
        GET: [{ code: 200, body: schedules('*/5 * * * *') }],
      },
      { PUT: [{ code: 200, body: schedules('0 * * * *') }], GET: [{ code: '000' }] },
    ];
    for (const c of cases) {
      const job = releaseJob({
        GET: [{ code: 200, body: schedules('0 * * * *') }, ...c.GET],
        PUT: c.PUT,
      });
      job.run(w, CAPTURE, { PREVIOUS_WORKER_VERSION: 'ver-old' });
      const rollback = job.run(w, ROLLBACK, deployed);
      expect(rollback.status).toBe(1);
      expect(rollback.output).toContain('::error::RECOVERY INCOMPLETE');
      expect(rollback.output).toContain('Release rollback finished with an incomplete recovery.');
    }
  });

  it('fails closed before migrations when the existing schedules cannot be read; a first bootstrap has none', async () => {
    const w = await workflowText();
    for (const failure of [
      { code: 500, body: { success: false } },
      { code: 200, body: { success: false } },
      { code: '000' },
    ]) {
      const job = releaseJob({ GET: [failure] });
      const capture = job.run(w, CAPTURE, { PREVIOUS_WORKER_VERSION: 'ver-old' });
      expect(capture.status).toBe(1);
      expect(capture.output).toContain(
        'Refusing to release: could not capture the current cron schedules',
      );
      expect(job.env.PREVIOUS_SCHEDULES_CAPTURED).toBeUndefined();
    }
    const first = releaseJob({ GET: [{ code: 404, body: { success: false } }] });
    expect(first.run(w, CAPTURE, { PREVIOUS_WORKER_VERSION: '' }).status).toBe(0);
    expect(first.env.PREVIOUS_SCHEDULES_CAPTURED).toBe('false');
    expect(
      first.run(w, ROLLBACK, { WORKER_DEPLOYED: 'true', PREVIOUS_WORKER_VERSION: '' }).status,
    ).toBe(0);
    expect(first.calls().filter((c) => c.startsWith('PUT'))).toEqual([]);
    const missing = releaseJob({ GET: [{ code: 404, body: { success: false } }] });
    expect(missing.run(w, CAPTURE, { PREVIOUS_WORKER_VERSION: 'ver-old' }).status).toBe(1);
  });

  it('a Worker step that fails after deploying (before WORKER_DEPLOYED) still restores the schedules', async () => {
    const w = await workflowText();
    const job = releaseJob({
      GET: [
        { code: 200, body: schedules('0 * * * *') },
        { code: 200, body: schedules('0 * * * *') },
      ],
      PUT: [{ code: 200, body: schedules('0 * * * *') }],
    });
    job.run(w, CAPTURE, { PREVIOUS_WORKER_VERSION: '' });
    expect(job.env.PREVIOUS_SCHEDULES_CAPTURED).toBe('true');
    const rollback = job.run(w, ROLLBACK, { PREVIOUS_WORKER_VERSION: '' });
    expect(rollback.status).toBe(0);
    expect(job.calls()).toContain(`PUT ${SCHEDULES_URL} [{"cron":"0 * * * *"}]`);
  });

  it('a failed Worker version or Pages rollback is also an incomplete recovery that fails the job', async () => {
    const w = await workflowText();
    const worker = releaseJob({
      GET: [
        { code: 200, body: schedules('0 * * * *') },
        { code: 200, body: schedules('0 * * * *') },
      ],
      PUT: [{ code: 200, body: schedules('0 * * * *') }],
    });
    worker.run(w, CAPTURE, { PREVIOUS_WORKER_VERSION: 'ver-old' });
    const w1 = worker.run(w, ROLLBACK, { ...deployed, PNPM_ROLLBACK_EXIT: '1' });
    expect(w1.status).toBe(1);
    expect(w1.output).toContain('production Worker could not be rolled back to ver-old');
    expect(worker.calls().some((c) => c.startsWith('PUT'))).toBe(true);
    const pages = releaseJob({});
    const p1 = pages.run(w, ROLLBACK, {
      PAGES_DEPLOYED: 'true',
      PREVIOUS_PAGES_DEPLOYMENT: 'dep-old',
    });
    expect(p1.status).toBe(1);
    expect(p1.output).toContain('production Pages could not be rolled back to dep-old');
  });
});
