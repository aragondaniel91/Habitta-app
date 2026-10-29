import { test } from 'node:test';
import assert from 'node:assert/strict';
import { developmentIsolationErrors, jwtProjectRef } from './assert-development-isolation.mjs';
import { validateWorkflowEnvironmentScoping } from './validate-development-release.mjs';

const PROD = 'kgsfaahixbcwcmykmhat';
const jwt = (payload) =>
  ['e30', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'sig'].join('.');

test('a fully separate development configuration passes', () => {
  assert.deepEqual(
    developmentIsolationErrors({
      SUPABASE_PROJECT_REF: 'devrefdevrefdevref00',
      SUPABASE_URL: 'https://devrefdevrefdevref00.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: jwt({ ref: 'devrefdevrefdevref00', role: 'service_role' }),
    }),
    [],
  );
});

test('the production ref, URL or keys are each refused on their own', () => {
  const dev = 'devrefdevrefdevref00';
  assert.equal(developmentIsolationErrors({ SUPABASE_PROJECT_REF: PROD }).length, 1);
  assert.match(
    developmentIsolationErrors({
      SUPABASE_PROJECT_REF: dev,
      VITE_SUPABASE_URL: `https://${PROD}.supabase.co`,
    })[0],
    /VITE_SUPABASE_URL/,
  );
  assert.match(
    developmentIsolationErrors({
      SUPABASE_PROJECT_REF: dev,
      SUPABASE_SERVICE_ROLE_KEY: jwt({ ref: PROD }),
    })[0],
    /SUPABASE_SERVICE_ROLE_KEY belongs to the production project/,
  );
});

test('an unset project ref fails closed and no value is echoed', () => {
  const errors = developmentIsolationErrors({ SUPABASE_SERVICE_ROLE_KEY: jwt({ ref: PROD }) });
  assert.ok(errors.some((e) => /not set/.test(e)));
  assert.ok(errors.every((e) => !e.includes('e30.')));
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
