const required = (value, name) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`missing_${name}`);
  return normalized;
};

export const validateProductionPagesState = ({
  project,
  domain,
  expectedCommit,
  expectedDomain,
}) => {
  const errors = [];
  const deployment = project?.canonical_deployment;

  if (!deployment?.id) errors.push('canonical_deployment_missing');
  if (deployment?.environment !== 'production') errors.push('canonical_deployment_not_production');
  if (deployment?.latest_stage?.status !== 'success')
    errors.push('canonical_deployment_not_successful');
  if (deployment?.deployment_trigger?.metadata?.commit_hash !== expectedCommit)
    errors.push('canonical_deployment_commit_mismatch');
  if (domain?.name !== expectedDomain) errors.push('canonical_domain_name_mismatch');
  if (domain?.status !== 'active') errors.push('canonical_domain_not_active');

  return errors;
};

const fetchCloudflareJson = async (url, token) => {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`cloudflare_api_${response.status}`);
  const payload = await response.json();
  if (payload?.success !== true) throw new Error('cloudflare_api_unsuccessful');
  return payload.result;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const accountId = required(process.env.CLOUDFLARE_ACCOUNT_ID, 'cloudflare_account_id');
  const token = required(process.env.CLOUDFLARE_API_TOKEN, 'cloudflare_api_token');
  const projectName = required(process.env.CLOUDFLARE_PAGES_PROJECT_NAME, 'pages_project_name');
  const expectedCommit = required(process.env.RELEASE_COMMIT, 'release_commit');
  const expectedDomain = new URL(required(process.env.CLOUDFLARE_PAGES_PROD_URL, 'pages_prod_url'))
    .hostname;
  const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}`;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let lastErrors = ['verification_not_started'];

  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      const [project, domain] = await Promise.all([
        fetchCloudflareJson(base, token),
        fetchCloudflareJson(`${base}/domains/${encodeURIComponent(expectedDomain)}`, token),
      ]);
      const errors = validateProductionPagesState({
        project,
        domain,
        expectedCommit,
        expectedDomain,
      });
      if (errors.length === 0) {
        console.log(
          `production Pages control plane is valid: domain=${expectedDomain} deployment=${project.canonical_deployment.id} commit=${expectedCommit}`,
        );
        process.exit(0);
      }
      lastErrors = errors;
    } catch (error) {
      lastErrors = [error instanceof Error ? error.message : String(error)];
    }

    if (attempt < 12) await sleep(5_000);
  }

  console.error(`production Pages control plane invalid: ${lastErrors.join(',')}`);
  process.exit(1);
}
