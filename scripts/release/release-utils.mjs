export const developmentResources = Object.freeze({
  worker: 'habitta-api-dev',
  queue: 'habitta-notifications-dev',
  dlq: 'habitta-notifications-dlq-dev',
  integrationQueue: 'habitta-integrations-dev',
  integrationDlq: 'habitta-integrations-dlq-dev',
  r2: 'habitta-payment-proofs-dev',
  pages: 'habitta-web-dev',
  environment: 'development',
});

export const validateDevelopmentRelease = (input) => {
  const errors = [];
  if (input.appEnv !== 'development') errors.push('app_environment_must_be_development');
  const safeDevelopmentEmailMode =
    input.appEnv === 'development' && ['disabled', 'sandbox'].includes(input.emailMode);
  if (!safeDevelopmentEmailMode) errors.push('notifications_email_must_be_disabled');
  if (input.projectRef && input.confirmProjectRef !== input.projectRef)
    errors.push('supabase_project_ref_mismatch');
  if (!input.worker?.includes('-dev') || input.worker.includes('production'))
    errors.push('invalid_development_worker');
  if (!input.pages?.includes('-dev') || input.pages.includes('production'))
    errors.push('invalid_development_pages');
  if (
    input.apiUrl &&
    (/localhost|production/.test(input.apiUrl) || !/^https:\/\//.test(input.apiUrl))
  )
    errors.push('invalid_development_api_url');
  return errors;
};

export const requireApplyConfirmation = (confirmation) =>
  confirmation === 'DEPLOY-HABITTA-DEVELOPMENT';

export const isMainReleaseRef = (ref, mainCommitShas = []) =>
  ref === 'main' || mainCommitShas.includes(ref);

export const sanitizedMetadata = ({ commit, versionId, timestamp, environment }) => ({
  commit,
  versionId,
  timestamp,
  environment,
});

export const requireWorkerVersionId = (versionId) =>
  Boolean(versionId && /^[a-zA-Z0-9_-]+$/.test(versionId));

export const rollbackWorkerPlan = (previousVersion) =>
  previousVersion ? [`wrangler versions deploy ${previousVersion}@100% --env dev`] : [];

export const activeWorkerVersion = (status) => {
  const active = (status.versions ?? []).filter((entry) => entry.percentage === 100);
  return active.length === 1 ? active[0].version_id : null;
};

export const workerVersionForTag = (versions, tag) => {
  const matches = versions.filter((entry) => entry.annotations?.['workers/tag'] === tag);
  return matches.length === 1 ? matches[0].id : null;
};
