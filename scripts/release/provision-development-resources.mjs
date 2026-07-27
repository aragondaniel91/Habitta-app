import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { developmentResources } from './release-utils.mjs';

export const resourcePlan = (existing = { queues: [], buckets: [], pages: [] }) => [
  ...[developmentResources.queue, developmentResources.dlq]
    .filter((name) => !existing.queues.includes(name))
    .map((name) => ({ kind: 'queue', name })),
  ...[developmentResources.r2]
    .filter((name) => !existing.buckets.includes(name))
    .map((name) => ({ kind: 'r2', name })),
  ...[developmentResources.pages]
    .filter((name) => !existing.pages.includes(name))
    .map((name) => ({ kind: 'pages', name })),
];

export const provisionDevelopmentResources = ({ apply = false, run = () => {}, existing } = {}) => {
  const plan = resourcePlan(existing);
  if (!apply) return plan;
  for (const resource of plan) {
    if (resource.kind === 'queue') run(['queues', 'create', resource.name]);
    if (resource.kind === 'r2') run(['r2', 'bucket', 'create', resource.name]);
    if (resource.kind === 'pages')
      run(['pages', 'project', 'create', resource.name, '--production-branch', 'development']);
  }
  return plan;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const apply = process.argv.includes('--apply');
  const run = (args) => {
    const result = spawnSync('pnpm', ['--filter', '@habitta/api', 'exec', 'wrangler', ...args], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    if (result.status !== 0) throw new Error('cloudflare_resource_operation_failed');
    return result.stdout;
  };
  if (apply) run(['whoami']);
  const existing = apply
    ? {
        queues: JSON.parse(run(['queues', 'list', '--json'])).map((item) => item.name),
        buckets: JSON.parse(run(['r2', 'bucket', 'list', '--json'])).map((item) => item.name),
        pages: JSON.parse(run(['pages', 'project', 'list', '--json'])).map((item) => item.name),
      }
    : undefined;
  const plan = provisionDevelopmentResources({ apply, run, existing });
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', resources: plan }, null, 2));
}
