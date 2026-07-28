import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { developmentResources } from './release-utils.mjs';

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';

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

export const existingResourcesFromCloudflare = ({ queuesResult, r2Result, pagesResult }) => ({
  queues: (Array.isArray(queuesResult) ? queuesResult : [])
    .map((item) => item?.queue_name ?? item?.name)
    .filter(Boolean),
  buckets: (Array.isArray(r2Result?.buckets)
    ? r2Result.buckets
    : Array.isArray(r2Result)
      ? r2Result
      : []
  )
    .map((item) => item?.name)
    .filter(Boolean),
  pages: Array.isArray(pagesResult)
    ? pagesResult.map((item) => item?.name).filter(Boolean)
    : pagesResult?.name
      ? [pagesResult.name]
      : [],
});

export const sanitizeCloudflareDiagnostic = (value, token = '') => {
  const hidden = token
    ? String(value ?? '')
        .split(token)
        .join('[REDACTED]')
    : String(value ?? '');
  return hidden.replace(/\s+/g, ' ').trim().slice(0, 500) || 'unknown_error';
};

const requireCredential = (name, value) => {
  if (!value) throw new Error(`cloudflare_credential_missing:${name}`);
  return value;
};

const cloudflareApi = async ({
  path,
  operation,
  token,
  accountId,
  fetchImpl = fetch,
  allowNotFound = false,
}) => {
  const response = await fetchImpl(`${CLOUDFLARE_API_BASE}/accounts/${accountId}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const raw = await response.text();
  if (allowNotFound && response.status === 404) return null;

  let payload;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(
      `cloudflare_api_invalid_json:${operation}:${sanitizeCloudflareDiagnostic(raw, token)}`,
    );
  }
  if (!response.ok || payload.success === false) {
    const errors = Array.isArray(payload.errors) ? payload.errors : [];
    const detail = errors.length
      ? errors.map((error) => `${error.code ?? 'unknown'}:${error.message ?? 'unknown'}`).join('|')
      : `${response.status}:${response.statusText}`;
    throw new Error(
      `cloudflare_api_failed:${operation}:${sanitizeCloudflareDiagnostic(detail, token)}`,
    );
  }
  return payload.result;
};

export const getCloudflarePagesProjectByName = async ({
  name,
  token,
  accountId,
  fetchImpl = fetch,
} = {}) => {
  const projectName = String(name ?? '').trim();
  if (!projectName) throw new Error('cloudflare_pages_project_name_missing');
  return cloudflareApi({
    path: `/pages/projects/${encodeURIComponent(projectName)}`,
    operation: 'pages_project_get',
    token,
    accountId,
    fetchImpl,
    allowNotFound: true,
  });
};

export const listExistingCloudflareResources = async ({
  token,
  accountId,
  fetchImpl = fetch,
} = {}) => {
  const resolvedToken = requireCredential('CLOUDFLARE_API_TOKEN', token);
  const resolvedAccountId = requireCredential('CLOUDFLARE_ACCOUNT_ID', accountId);
  const [queuesResult, r2Result, pagesResult] = await Promise.all([
    cloudflareApi({
      path: '/queues?per_page=100',
      operation: 'queues_list',
      token: resolvedToken,
      accountId: resolvedAccountId,
      fetchImpl,
    }),
    cloudflareApi({
      path: '/r2/buckets?per_page=100',
      operation: 'r2_buckets_list',
      token: resolvedToken,
      accountId: resolvedAccountId,
      fetchImpl,
    }),
    getCloudflarePagesProjectByName({
      name: developmentResources.pages,
      token: resolvedToken,
      accountId: resolvedAccountId,
      fetchImpl,
    }),
  ]);
  return existingResourcesFromCloudflare({ queuesResult, r2Result, pagesResult });
};

const requiredResourcesPresent = (existing) => resourcePlan(existing).length === 0;
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const apply = process.argv.includes('--apply');
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const run = (args) => {
    const result = spawnSync('pnpm', ['--filter', '@habitta/api', 'exec', 'wrangler', ...args], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    if (result.status !== 0) {
      const diagnostic = sanitizeCloudflareDiagnostic(result.stderr || result.stdout, token);
      throw new Error(`cloudflare_wrangler_failed:${args.join('_')}:${diagnostic}`);
    }
    return result.stdout;
  };

  const existing = apply ? await listExistingCloudflareResources({ token, accountId }) : undefined;
  const plan = provisionDevelopmentResources({ apply, run, existing });

  if (apply) {
    let verified = await listExistingCloudflareResources({ token, accountId });
    for (let attempt = 0; attempt < 4 && !requiredResourcesPresent(verified); attempt += 1) {
      await delay(1000);
      verified = await listExistingCloudflareResources({ token, accountId });
    }
    const missing = resourcePlan(verified);
    if (missing.length)
      throw new Error(
        `cloudflare_resource_verification_failed:${missing
          .map((resource) => `${resource.kind}:${resource.name}`)
          .join(',')}`,
      );
  }

  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', resources: plan }, null, 2));
}
