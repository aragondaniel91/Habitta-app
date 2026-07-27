import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const forbiddenNames = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_DB_PASSWORD',
  'CLOUDFLARE_API_TOKEN',
  'RESEND_API_KEY',
];
export const verifyWebBundleSecrets = async (directory, secretValues = []) => {
  const files = await readdir(directory, { recursive: true });
  const errors = [];
  for (const file of files) {
    if (typeof file !== 'string' || !/\.(js|css|html)$/.test(file)) continue;
    const content = await readFile(join(directory, file), 'utf8');
    for (const name of forbiddenNames)
      if (content.includes(name)) errors.push(`bundle_contains:${name}`);
    for (const secret of secretValues.filter(Boolean))
      if (content.includes(secret)) errors.push('bundle_contains_secret_value');
  }
  return errors;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const directory = process.argv[2] ?? 'apps/web/dist';
  const secrets = [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_DB_PASSWORD,
    process.env.CLOUDFLARE_API_TOKEN,
    process.env.RESEND_API_KEY,
  ];
  const errors = await verifyWebBundleSecrets(directory, secrets);
  if (errors.length) {
    console.error(`web bundle verification failed: ${[...new Set(errors)].join(', ')}`);
    process.exitCode = 1;
  } else console.log('web bundle contains no server secrets');
}
