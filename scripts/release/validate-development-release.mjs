import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { developmentResources, validateDevelopmentRelease } from './release-utils.mjs';

export const HABITTA_PROD_PROJECT_REF = 'kgsfaahixbcwcmykmhat';

const parseJsonc = (source) => JSON.parse(source.replace(/,\s*([}\]])/g, '$1'));

export const validateDevelopmentSupabaseProjectRef = (projectRef) => {
  const normalized = String(projectRef ?? '').trim();
  if (!normalized) return [];
  return normalized === HABITTA_PROD_PROJECT_REF
    ? ['development_cannot_use_production_supabase_project']
    : [];
};

export const validateWranglerDevelopmentConfig = (source) => {
  const config = parseJsonc(source);
  const dev = config.env?.dev;
  const consumer = dev?.queues?.consumers?.find(
    (entry) => entry.queue === developmentResources.queue,
  );
  const errors = validateDevelopmentRelease({
    appEnv: dev?.vars?.APP_ENV,
    emailMode: dev?.vars?.NOTIFICATIONS_EMAIL_MODE,
    worker: dev?.name,
    pages: developmentResources.pages,
  });
  if (dev?.vars?.SUPABASE_URL) errors.push('development_supabase_url_must_be_runtime_only');
  if ((dev?.triggers?.crons ?? []).length) errors.push('parked_development_must_not_have_cron');
  if (dev?.r2_buckets?.[0]?.bucket_name !== developmentResources.r2)
    errors.push('missing_r2_binding');
  if (!consumer || consumer.dead_letter_queue !== developmentResources.dlq)
    errors.push('missing_queue_dlq_binding');
  if (!dev?.queues?.producers?.some((entry) => entry.binding === 'NOTIFICATION_QUEUE'))
    errors.push('missing_queue_producer');
  return errors;
};

export const validateMigrationOrder = (names) => {
  const versions = names.map((name) => Number.parseInt(name.slice(0, 14), 10));
  return versions.some((version, index) => index > 0 && version <= versions[index - 1])
    ? ['migrations_out_of_order']
    : [];
};

// Credentials that can reach production data, money or mail. Each must come from a GitHub
// environment, so that environment's protection rules decide who can use it.
const ENVIRONMENT_SCOPED_SECRET =
  /secrets\.(SUPABASE_(?:SERVICE_ROLE_KEY|DB_PASSWORD|ACCESS_TOKEN|ANON_KEY)|STRIPE_[A-Z_]+|ZEPTOMAIL_[A-Z_]+|BACKUP_ENCRYPTION_PASSPHRASE)\b/g;
const PRODUCTION_ONLY_SECRET = /^(STRIPE_|ZEPTOMAIL_|BACKUP_ENCRYPTION_PASSPHRASE)/;

export const validateWorkflowEnvironmentScoping = (file, source) => {
  const errors = [];
  const environments = new Set(
    [...source.matchAll(/^\s*environment:\s*['"]?([a-z-]+)['"]?\s*$/gm)].map((m) => m[1]),
  );
  const secrets = new Set([...source.matchAll(ENVIRONMENT_SCOPED_SECRET)].map((m) => m[1]));
  if (secrets.size && !environments.size)
    errors.push(`${file}: uses ${[...secrets].sort().join(', ')} without a GitHub environment`);
  if (environments.has('development')) {
    for (const secret of secrets)
      if (PRODUCTION_ONLY_SECRET.test(secret))
        errors.push(`${file}: development workflow references production-only ${secret}`);
  }
  if (environments.size > 1)
    errors.push(`${file}: mixes environments ${[...environments].join(', ')}`);
  // Migrations reach a live database only through the production release, or through a
  // development workflow that has proved it is not pointed at production.
  if (/supabase\s+db\s+push/.test(source) && !environments.has('production')) {
    const guard = source.indexOf('assert-development-isolation.mjs');
    const push = source.search(/supabase\s+db\s+push/);
    if (!environments.has('development') || guard === -1 || guard > push)
      errors.push(
        `${file}: runs supabase db push without the production environment or the development isolation guard`,
      );
  }
  if (/DEV-SHARES-PRODUCTION-DATABASE/.test(source))
    errors.push(`${file}: still offers the shared production database override`);
  return errors;
};

export const validateWorkflows = async (directory) => {
  const files = (await readdir(directory)).filter((f) => /\.ya?ml$/.test(f)).sort();
  const errors = [];
  for (const file of files)
    errors.push(
      ...validateWorkflowEnvironmentScoping(file, await readFile(new URL(file, directory), 'utf8')),
    );
  return errors;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const wrangler = await readFile(
    new URL('../../apps/api/wrangler.jsonc', import.meta.url),
    'utf8',
  );
  const errors = [
    ...validateWranglerDevelopmentConfig(wrangler),
    ...validateDevelopmentSupabaseProjectRef(process.env.SUPABASE_PROJECT_REF),
    ...(await validateWorkflows(new URL('../../.github/workflows/', import.meta.url))),
  ];
  if (errors.length) {
    console.error(`development release validation failed: ${errors.join(', ')}`);
    process.exitCode = 1;
  } else console.log('development release configuration is valid');
}
