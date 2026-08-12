import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const requiredQueue = (config, name, errors) => {
  const producers = config?.queues?.producers ?? [];
  const consumers = config?.queues?.consumers ?? [];
  if (
    !producers.some(
      (producer) => producer.binding === 'NOTIFICATION_QUEUE' && producer.queue === name,
    )
  )
    errors.push(`missing_notification_producer:${name}`);
  const consumer = consumers.find((entry) => entry.queue === name);
  if (!consumer) errors.push(`missing_notification_consumer:${name}`);
  else {
    if (consumer.max_batch_size !== 10) errors.push(`invalid_batch_size:${name}`);
    if (consumer.max_retries !== 5) errors.push(`invalid_max_retries:${name}`);
    if (consumer.max_concurrency !== 1) errors.push(`invalid_max_concurrency:${name}`);
    if (!consumer.dead_letter_queue) errors.push(`missing_dead_letter_queue:${name}`);
  }
};
const requiredR2 = (config, bucketName, errors) => {
  if (
    !(config?.r2_buckets ?? []).some(
      (bucket) => bucket.binding === 'PAYMENT_PROOFS' && bucket.bucket_name === bucketName,
    )
  )
    errors.push(`missing_payment_proofs_binding:${bucketName}`);
};

const parseJsonc = (source) => JSON.parse(source.replace(/,\s*([}\]])/g, '$1'));

export const validateNotificationsConfig = (wranglerSource, devVarsSource) => {
  const errors = [];
  let config;
  try {
    config = parseJsonc(wranglerSource);
  } catch {
    return ['wrangler_config_not_parseable'];
  }
  requiredQueue(config, 'habitta-notifications-local', errors);
  requiredR2(config, 'habitta-payment-proofs-local', errors);
  if (config.vars?.NOTIFICATIONS_EMAIL_PROVIDER !== 'zeptomail')
    errors.push('invalid_default_email_provider');
  const dev = config.env?.dev;
  if (!dev || dev.name !== 'habitta-api-dev') errors.push('missing_dev_environment');
  else {
    requiredQueue(dev, 'habitta-notifications-dev', errors);
    requiredR2(dev, 'habitta-payment-proofs-dev', errors);
    const consumer = dev.queues?.consumers?.find(
      (entry) => entry.queue === 'habitta-notifications-dev',
    );
    if (consumer?.dead_letter_queue !== 'habitta-notifications-dlq-dev')
      errors.push('invalid_dev_dead_letter_queue');
    if (!['disabled', 'sandbox'].includes(dev.vars?.NOTIFICATIONS_EMAIL_MODE))
      errors.push('unsafe_dev_email_mode');
    if (dev.vars?.NOTIFICATIONS_EMAIL_PROVIDER !== 'zeptomail')
      errors.push('invalid_dev_email_provider');
    const requiredSecrets = new Set(dev.secrets?.required ?? []);
    for (const secret of [
      'SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'ZEPTOMAIL_SEND_TOKEN',
    ]) {
      if (!requiredSecrets.has(secret)) errors.push(`missing_required_secret:${secret}`);
    }
  }

  const prod = config.env?.prod;
  if (!prod || prod.name !== 'habitta-api-prod') errors.push('missing_prod_environment');
  else {
    requiredQueue(prod, 'habitta-notifications-prod', errors);
    requiredR2(prod, 'habitta-payment-proofs-prod', errors);
    const consumer = prod.queues?.consumers?.find(
      (entry) => entry.queue === 'habitta-notifications-prod',
    );
    if (consumer?.dead_letter_queue !== 'habitta-notifications-dlq-prod')
      errors.push('invalid_prod_dead_letter_queue');
    if (prod.vars?.NOTIFICATIONS_EMAIL_MODE !== 'live') errors.push('invalid_prod_email_mode');
    if (prod.vars?.NOTIFICATIONS_EMAIL_PROVIDER !== 'zeptomail')
      errors.push('invalid_prod_email_provider');
    if (prod.vars?.APP_ENV !== 'production') errors.push('invalid_prod_app_environment');
    if (prod.vars?.APP_BASE_URL !== 'https://habitta-web-prod.pages.dev')
      errors.push('invalid_prod_app_base_url');
    const requiredSecrets = new Set(prod.secrets?.required ?? []);
    for (const secret of ['SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
      if (!requiredSecrets.has(secret)) errors.push(`missing_prod_required_secret:${secret}`);
    }
    if (requiredSecrets.has('ZEPTOMAIL_SEND_TOKEN'))
      errors.push('prod_zeptomail_secret_must_be_mode_gated');
  }

  // Habitta currently has one hosted Supabase project. Treat that project as production-owned.
  // When preview and production share it, only production may run the notification scheduler so
  // workers cannot compete for the same pending deliveries. Development keeps its queue bindings
  // for explicit tests, but scheduled claims must remain disabled.
  const sharesHostedDatabase =
    Boolean(dev?.vars?.SUPABASE_URL) && dev?.vars?.SUPABASE_URL === prod?.vars?.SUPABASE_URL;
  if (sharesHostedDatabase) {
    if ((dev?.triggers?.crons ?? []).length) errors.push('unsafe_dev_cron_on_shared_database');
    if (!(prod?.triggers?.crons ?? []).includes('*/5 * * * *'))
      errors.push('missing_prod_notification_cron');
  } else {
    if (!(dev?.triggers?.crons ?? []).includes('*/5 * * * *'))
      errors.push('missing_notification_cron');
    if (!(prod?.triggers?.crons ?? []).includes('*/5 * * * *'))
      errors.push('missing_prod_notification_cron');
  }

  if (config.vars?.NOTIFICATIONS_EMAIL_MODE !== 'disabled')
    errors.push('unsafe_default_email_mode');
  const secretAssignment =
    /^(SUPABASE_(?:ANON|SERVICE_ROLE)_KEY|RESEND_API_KEY|ZEPTOMAIL_SEND_TOKEN)=(?!\s*$).+/m;
  if (secretAssignment.test(devVarsSource)) errors.push('example_contains_secret_value');
  return errors;
};

export const checkNotificationsConfig = async () => {
  const [wranglerSource, devVarsSource] = await Promise.all([
    readFile(new URL('../../apps/api/wrangler.jsonc', import.meta.url), 'utf8'),
    readFile(new URL('../../apps/api/.dev.vars.example', import.meta.url), 'utf8'),
  ]);
  return validateNotificationsConfig(wranglerSource, devVarsSource);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = await checkNotificationsConfig();
  if (errors.length) {
    console.error(`notifications configuration invalid: ${errors.join(', ')}`);
    process.exitCode = 1;
  } else console.log('notifications configuration is valid');
}
