// Refuses a development release whose configuration resolves to Habitta Production.
//
// Runs before any credential is used. Every value it reads is checked against the production
// project ref; only setting names are ever printed, never their values. Supabase's legacy anon and
// service-role keys are JWTs that name their project in a `ref` claim, so a production key pasted
// into the development environment is caught even when every URL looks right.
import { fileURLToPath } from 'node:url';
import { HABITTA_PROD_PROJECT_REF } from './validate-development-release.mjs';

const URL_SETTINGS = ['SUPABASE_URL', 'VITE_SUPABASE_URL'];
const KEY_SETTINGS = ['SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];

export const jwtProjectRef = (token) => {
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return typeof payload.ref === 'string' ? payload.ref : null;
  } catch {
    return null;
  }
};

export const developmentIsolationErrors = (env, prodRef = HABITTA_PROD_PROJECT_REF) => {
  const errors = [];
  const ref = String(env.SUPABASE_PROJECT_REF ?? '').trim();
  if (!ref) errors.push('SUPABASE_PROJECT_REF is not set for the development environment');
  else if (ref === prodRef) errors.push('SUPABASE_PROJECT_REF is the production project');
  for (const name of URL_SETTINGS) {
    if (String(env[name] ?? '').includes(prodRef))
      errors.push(`${name} points at the production project`);
  }
  for (const name of KEY_SETTINGS) {
    if (jwtProjectRef(env[name]) === prodRef)
      errors.push(`${name} belongs to the production project`);
  }
  return errors;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = developmentIsolationErrors(process.env);
  if (errors.length) {
    for (const error of errors) console.error(`::error::${error}`);
    console.error('Development must use its own Supabase project. Nothing was changed.');
    process.exitCode = 1;
  } else console.log('development configuration is isolated from production');
}
