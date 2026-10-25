import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const endpoint = process.env.LOCAL_SUPABASE_URL;
const adminKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const publicKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const address = process.env.LOCAL_DEMO_EMAIL ?? 'habitta-visual-admin@example.invalid';
const condoId = '22222222-2222-4222-8222-222222222221';

function requireLocalUrl(url) {
  if (!url) throw Error('LOCAL_SUPABASE_URL missing.');
  const target = new URL(url);
  if (!['127.0.0.1', 'localhost'].includes(target.hostname) || target.port !== '55421' || target.protocol !== 'http:') {
    throw Error('Refusing non-local/non-55421 Supabase URL.');
  }
  return target;
}
const target = requireLocalUrl(endpoint);
if (!adminKey || !publicKey) throw Error('Both local admin and local public keys must be provided in environment, never in source.');
if (!address.endsWith('@example.invalid')) throw Error('Use dedicated non-deliverable demonstration email only.');
const password = randomBytes(24).toString('base64url');
async function call(path, method, body) {
  const res = await fetch(new URL(path, target), {
    method,
    headers: { apikey: adminKey, Authorization: `Bearer ${adminKey}`, 'Content-Type':'application/json', Prefer:'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await res.text();
  if (!res.ok) throw Error(`${path}: HTTP ${res.status}. Provisioning stopped.`);
  return payload ? JSON.parse(payload) : {};
}
const member = await call('/auth/v1/admin/users', 'POST', {email: address, password, email_confirm: true});
const userId = member.user?.id ?? member.id;
if (!userId) throw Error('Supabase Auth returned no user ID.');
await call('/rest/v1/condominium_memberships', 'POST', {condominium_id: condoId, user_id: userId, role:'condominium_admin'});
const base = process.env.LOCAL_FRONTEND_ENV_PATH;
if (base) {
  await writeFile(base, `VITE_SUPABASE_URL=${target.origin}\nVITE_SUPABASE_ANON_KEY=${publicKey}\nVITE_APP_ENV=development\n`, {flag:'wx',mode:0o600});
}
console.log('LOCAL_DEMO_ADMIN_CREATED=true');
console.log(`DEMO_EMAIL=${address}`);
console.log(`DEMO_PASSWORD=${password}`);
console.log('REMINDER=Store credentials privately; remove test user after review.');
