import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { developmentResources, validateDevelopmentRelease } from './release-utils.mjs';

const parseJsonc = (source) => JSON.parse(source.replace(/,\s*([}\]])/g, '$1'));
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const wrangler = await readFile(
    new URL('../../apps/api/wrangler.jsonc', import.meta.url),
    'utf8',
  );
  const errors = validateWranglerDevelopmentConfig(wrangler);
  if (errors.length) {
    console.error(`development release validation failed: ${errors.join(', ')}`);
    process.exitCode = 1;
  } else console.log('development release configuration is valid');
}
