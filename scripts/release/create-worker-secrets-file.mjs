import { chmod, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const workerSecretsContent = (env) => {
  const anon = env.SUPABASE_ANON_KEY;
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  const emailMode = env.NOTIFICATIONS_EMAIL_MODE ?? 'disabled';
  const zeptoMailToken = env.ZEPTOMAIL_SEND_TOKEN;
  if (!anon || !service) throw new Error('worker_secrets_missing');
  if (emailMode !== 'disabled' && !zeptoMailToken) throw new Error('worker_email_secret_missing');
  return JSON.stringify({
    SUPABASE_ANON_KEY: anon,
    SUPABASE_SERVICE_ROLE_KEY: service,
    ...(emailMode !== 'disabled' ? { ZEPTOMAIL_SEND_TOKEN: zeptoMailToken } : {}),
  });
};

export const createWorkerSecretsFile = async (path, env = process.env) => {
  await writeFile(path, workerSecretsContent(env), { mode: 0o600 });
  await chmod(path, 0o600);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = process.argv[2];
  if (!path) throw new Error('worker_secrets_path_required');
  await createWorkerSecretsFile(path);
  console.log('worker secrets file created without exposing values');
}
