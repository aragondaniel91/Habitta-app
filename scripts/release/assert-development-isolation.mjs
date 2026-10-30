// Refuses a development release unless its configuration is proven to belong to a development
// Supabase project and proven NOT to reach Habitta Production.
//
// Runs inside the workflow, before any credential is used for real work. It fails closed: a
// missing setting, an unknown key format, or a check that cannot be completed (network, timeout,
// unexpected status) is a refusal, never a pass. Only setting names are printed, never values.
//
// Two layers:
//   static  - the project ref is a development ref; both URLs are exactly that project's URL;
//             JWT keys name that ref and the expected role; non-JWT keys have the expected prefix.
//   live    - each key is accepted by the development project AND refused by production; the
//             access token can see the development project and cannot see production. This is
//             what covers Supabase's non-JWT keys (sb_publishable_/sb_secret_), which carry no ref.
//
// Usage: node scripts/release/assert-development-isolation.mjs --mode plan|apply
import { fileURLToPath } from 'node:url';
import { HABITTA_PROD_PROJECT_REF } from './validate-development-release.mjs';

const REQUIRED = {
  plan: [
    'SUPABASE_PROJECT_REF',
    'SUPABASE_URL',
    'VITE_SUPABASE_URL',
    'SUPABASE_DB_PASSWORD',
    'SUPABASE_ACCESS_TOKEN',
  ],
  apply: [
    'SUPABASE_PROJECT_REF',
    'SUPABASE_URL',
    'VITE_SUPABASE_URL',
    'SUPABASE_DB_PASSWORD',
    'SUPABASE_ACCESS_TOKEN',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ],
};
const KEYS = {
  SUPABASE_ANON_KEY: { role: 'anon', prefix: 'sb_publishable_' },
  SUPABASE_SERVICE_ROLE_KEY: { role: 'service_role', prefix: 'sb_secret_' },
};

export const jwtClaims = (token) => {
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
};
export const jwtProjectRef = (token) => {
  const ref = jwtClaims(token)?.ref;
  return typeof ref === 'string' ? ref : null;
};

const projectUrl = (ref) => `https://${ref}.supabase.co`;

export const staticIsolationErrors = (env, mode = 'apply', prodRef = HABITTA_PROD_PROJECT_REF) => {
  const errors = [];
  const required = REQUIRED[mode];
  if (!required) return [`unknown mode ${mode}`];
  for (const name of required)
    if (!String(env[name] ?? '').trim())
      errors.push(`${name} is not set for the development environment`);
  const ref = String(env.SUPABASE_PROJECT_REF ?? '').trim();
  if (ref && ref === prodRef) errors.push('SUPABASE_PROJECT_REF is the production project');
  else if (ref && !/^[a-z]{20}$/.test(ref))
    errors.push('SUPABASE_PROJECT_REF is not a Supabase project ref');
  for (const name of ['SUPABASE_URL', 'VITE_SUPABASE_URL']) {
    const value = String(env[name] ?? '')
      .trim()
      .replace(/\/$/, '');
    if (!value) continue;
    if (value.includes(prodRef)) errors.push(`${name} points at the production project`);
    else if (ref && value !== projectUrl(ref))
      errors.push(`${name} is not the URL of SUPABASE_PROJECT_REF`);
  }
  for (const [name, expected] of Object.entries(KEYS)) {
    const value = String(env[name] ?? '').trim();
    if (!value) continue;
    const claims = jwtClaims(value);
    if (claims) {
      if (claims.ref === prodRef) errors.push(`${name} belongs to the production project`);
      else if (claims.ref !== ref) errors.push(`${name} does not belong to SUPABASE_PROJECT_REF`);
      if (claims.role !== expected.role) errors.push(`${name} is not a ${expected.role} key`);
    } else if (!value.startsWith(expected.prefix)) {
      errors.push(`${name} has an unrecognised format; its project cannot be verified`);
    }
  }
  return errors;
};

// One HTTP probe. Anything other than a definite answer is reported as "unverifiable".
const probe = async (fetchFn, url, headers, timeoutMs) => {
  try {
    const r = await fetchFn(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    return r.status;
  } catch {
    return null;
  }
};
const accepted = (s) => s === 200;
const refused = (s) => s === 401 || s === 403 || s === 404;

export const liveIsolationErrors = async (
  env,
  { fetchFn = fetch, prodRef = HABITTA_PROD_PROJECT_REF, timeoutMs = 10000 } = {},
) => {
  const errors = [];
  const ref = String(env.SUPABASE_PROJECT_REF).trim();
  const dev = projectUrl(ref);
  const prod = projectUrl(prodRef);
  const checks = [];
  if (env.SUPABASE_ANON_KEY) {
    const h = { apikey: env.SUPABASE_ANON_KEY };
    checks.push(['SUPABASE_ANON_KEY', `${dev}/auth/v1/settings`, `${prod}/auth/v1/settings`, h]);
  }
  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    const k = env.SUPABASE_SERVICE_ROLE_KEY;
    const h = { apikey: k, Authorization: `Bearer ${k}` };
    checks.push([
      'SUPABASE_SERVICE_ROLE_KEY',
      `${dev}/auth/v1/admin/users?page=1&per_page=1`,
      `${prod}/auth/v1/admin/users?page=1&per_page=1`,
      h,
    ]);
  }
  if (env.SUPABASE_ACCESS_TOKEN) {
    const h = { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` };
    checks.push([
      'SUPABASE_ACCESS_TOKEN',
      `https://api.supabase.com/v1/projects/${ref}`,
      `https://api.supabase.com/v1/projects/${prodRef}`,
      h,
    ]);
  }
  for (const [name, devUrl, prodUrl, headers] of checks) {
    const [d, p] = await Promise.all([
      probe(fetchFn, devUrl, headers, timeoutMs),
      probe(fetchFn, prodUrl, headers, timeoutMs),
    ]);
    if (!accepted(d))
      errors.push(
        `${name} could not be proven to belong to the development project (status ${d ?? 'no answer'})`,
      );
    if (accepted(p)) errors.push(`${name} is accepted by the production project`);
    else if (!refused(p))
      errors.push(
        `${name} could not be proven to be refused by production (status ${p ?? 'no answer'})`,
      );
  }
  return errors;
};

export const developmentIsolationErrors = async (env, opts = {}) => {
  const errors = staticIsolationErrors(env, opts.mode ?? 'apply', opts.prodRef);
  // A static failure already decides; live probes only run on a configuration that looks right.
  if (errors.length) return errors;
  return liveIsolationErrors(env, opts);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const modeArg = process.argv.indexOf('--mode');
  const mode = modeArg > -1 ? process.argv[modeArg + 1] : 'apply';
  const errors = await developmentIsolationErrors(process.env, { mode });
  if (errors.length) {
    for (const error of errors) console.error(`::error::${error}`);
    console.error(
      'Development must use its own Supabase project and credentials. Nothing was changed.',
    );
    process.exitCode = 1;
  } else
    console.log(
      `development configuration is isolated from production (${mode}, static and live checks)`,
    );
}
