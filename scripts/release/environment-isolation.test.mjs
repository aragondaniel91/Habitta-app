import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  developmentIsolationErrors,
  jwtProjectRef,
  staticIsolationErrors,
} from './assert-development-isolation.mjs';
import { validateWorkflowEnvironmentScoping } from './validate-development-release.mjs';

const PROD = 'kgsfaahixbcwcmykmhat';
const DEV = 'devrefdevrefdevrefaa';
const jwt = (payload) =>
  ['e30', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'sig'].join('.');
const devEnv = (over = {}) => ({
  SUPABASE_PROJECT_REF: DEV,
  SUPABASE_URL: `https://${DEV}.supabase.co`,
  VITE_SUPABASE_URL: `https://${DEV}.supabase.co`,
  SUPABASE_DB_PASSWORD: 'x',
  SUPABASE_ACCESS_TOKEN: 'sbp_devtoken',
  SUPABASE_ANON_KEY: jwt({ ref: DEV, role: 'anon' }),
  SUPABASE_SERVICE_ROLE_KEY: jwt({ ref: DEV, role: 'service_role' }),
  ...over,
});
// A fake Supabase: each credential is accepted by exactly the projects listed for it.
const supabase =
  (owners = {}) =>
  async (url, init) => {
    const cred = init.headers.apikey ?? init.headers.Authorization?.replace('Bearer ', '');
    const project =
      url.match(/https:\/\/([a-z]{20})\.supabase\.co/)?.[1] ??
      url.match(/projects\/([a-z]{20})/)?.[1];
    return { status: (owners[cred] ?? [DEV]).includes(project) ? 200 : 401 };
  };

test('a fully separate development configuration passes static and live checks', async () => {
  assert.deepEqual(await developmentIsolationErrors(devEnv(), { fetchFn: supabase() }), []);
});

test('every critical setting is required; missing ones fail closed', async () => {
  const errors = await developmentIsolationErrors({}, { fetchFn: supabase() });
  for (const name of [
    'SUPABASE_PROJECT_REF',
    'SUPABASE_URL',
    'VITE_SUPABASE_URL',
    'SUPABASE_DB_PASSWORD',
    'SUPABASE_ACCESS_TOKEN',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ])
    assert.ok(
      errors.some((e) => e.startsWith(`${name} is not set`)),
      name,
    );
  assert.equal(staticIsolationErrors(devEnv({ SUPABASE_ANON_KEY: '' }), 'plan').length, 0);
});

test('production refs, URLs and JWT keys are refused; URLs must be the declared project', () => {
  assert.match(staticIsolationErrors(devEnv({ SUPABASE_PROJECT_REF: PROD }))[0], /production/);
  assert.match(
    staticIsolationErrors(devEnv({ VITE_SUPABASE_URL: `https://${PROD}.supabase.co` }))[0],
    /VITE_SUPABASE_URL points at the production/,
  );
  assert.match(
    staticIsolationErrors(devEnv({ SUPABASE_URL: 'https://otherotherotherother.supabase.co' }))[0],
    /not the URL of SUPABASE_PROJECT_REF/,
  );
  assert.match(
    staticIsolationErrors(
      devEnv({ SUPABASE_SERVICE_ROLE_KEY: jwt({ ref: PROD, role: 'service_role' }) }),
    )[0],
    /SUPABASE_SERVICE_ROLE_KEY belongs to the production project/,
  );
  assert.match(
    staticIsolationErrors(
      devEnv({ SUPABASE_ANON_KEY: jwt({ ref: DEV, role: 'service_role' }) }),
    )[0],
    /not a anon key/,
  );
});

test('non-JWT keys need the expected prefix and are proven live, both ways', async () => {
  assert.match(
    staticIsolationErrors(devEnv({ SUPABASE_SERVICE_ROLE_KEY: 'mystery-key' }))[0],
    /unrecognised format/,
  );
  const env = devEnv({
    SUPABASE_ANON_KEY: 'sb_publishable_dev',
    SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_dev',
  });
  assert.deepEqual(await developmentIsolationErrors(env, { fetchFn: supabase() }), []);
  // A production secret pasted into development: refused by dev, accepted by prod.
  const leaked = devEnv({ SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_prod' });
  const errors = await developmentIsolationErrors(leaked, {
    fetchFn: supabase({ sb_secret_prod: [PROD] }),
  });
  assert.ok(errors.some((e) => /SUPABASE_SERVICE_ROLE_KEY could not be proven to belong/.test(e)));
  assert.ok(
    errors.some((e) => /SUPABASE_SERVICE_ROLE_KEY is accepted by the production project/.test(e)),
  );
});

test('an access token that can also reach production is refused', async () => {
  const errors = await developmentIsolationErrors(devEnv(), {
    fetchFn: supabase({ sbp_devtoken: [DEV, PROD] }),
  });
  assert.deepEqual(errors, ['SUPABASE_ACCESS_TOKEN is accepted by the production project']);
});

test('a check that cannot complete is a refusal, never a pass', async () => {
  const errors = await developmentIsolationErrors(devEnv(), {
    fetchFn: async () => {
      throw new Error('network down');
    },
  });
  assert.ok(errors.length >= 3);
  assert.ok(errors.every((e) => /no answer/.test(e)));
  const odd = await developmentIsolationErrors(devEnv(), {
    fetchFn: async () => ({ status: 500 }),
  });
  assert.ok(odd.some((e) => /could not be proven/.test(e)));
});

test('no value is ever echoed', async () => {
  const env = devEnv({ SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_prod_VALUE' });
  const errors = await developmentIsolationErrors(env, {
    fetchFn: supabase({ sb_secret_prod_VALUE: [PROD] }),
  });
  assert.ok(errors.every((e) => !e.includes('VALUE') && !e.includes('e30.')));
});

test('non-JWT keys are not mistaken for a project ref', () => {
  assert.equal(jwtProjectRef('sb_secret_abc'), null);
  assert.equal(jwtProjectRef(''), null);
});

const job = (env, body) =>
  `jobs:\n  x:\n    ${env ? `environment: ${env}\n    ` : ''}steps:\n${body}`;

test('production credentials outside a GitHub environment are rejected', () => {
  const errors = validateWorkflowEnvironmentScoping(
    'w.yml',
    job(null, '      - run: echo ${{ secrets.SUPABASE_DB_PASSWORD }}'),
  );
  assert.match(errors[0], /without a GitHub environment/);
});

test('development workflows cannot reference production-only secrets', () => {
  const errors = validateWorkflowEnvironmentScoping(
    'w.yml',
    job('development', '      - run: echo ${{ secrets.STRIPE_SECRET_KEY }}'),
  );
  assert.match(errors[0], /production-only STRIPE_SECRET_KEY/);
});

test('db push in development requires the isolation guard first', () => {
  const unguarded = job('development', '      - run: supabase db push');
  assert.match(validateWorkflowEnvironmentScoping('w.yml', unguarded)[0], /isolation guard/);
  const guarded = job(
    'development',
    '      - run: node scripts/release/assert-development-isolation.mjs\n      - run: supabase db push',
  );
  assert.deepEqual(validateWorkflowEnvironmentScoping('w.yml', guarded), []);
  const late = job(
    'development',
    '      - run: supabase db push\n      - run: node scripts/release/assert-development-isolation.mjs',
  );
  assert.equal(validateWorkflowEnvironmentScoping('w.yml', late).length, 1);
});

test('db push under the production environment is the release path and allowed', () => {
  assert.deepEqual(
    validateWorkflowEnvironmentScoping('w.yml', job('production', '      - run: supabase db push')),
    [],
  );
});

test('the shared-database override phrase can never come back', () => {
  const errors = validateWorkflowEnvironmentScoping(
    'w.yml',
    job('development', '      - run: test "$X" = DEV-SHARES-PRODUCTION-DATABASE'),
  );
  assert.match(errors[0], /shared production database override/);
});
