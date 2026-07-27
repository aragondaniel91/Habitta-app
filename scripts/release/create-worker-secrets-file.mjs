import { chmod, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const workerSecretsContent = (env) => {
  const anon = env.SUPABASE_ANON_KEY;
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!anon || !service) throw new Error('worker_secrets_missing');
  return `SUPABASE_ANON_KEY=${anon}\nSUPABASE_SERVICE_ROLE_KEY=${service}\n`;
};

export const createWorkerSecretsFile = async (path, env = process.env) => {
  await writeFile(path, workerSecretsContent(env), { mode: 0o600 });
  await chmod(path, 0o600);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = process.argv[2];
  if (!path) throw new Error('worker_secrets_path_required');
  await createWorkerSecretsFile(path);
  console.log('worker secrets file created');
}
