import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const fixtureUrl = new URL('../fixtures/financial.fixture.json', import.meta.url);
const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));
const supabaseUrl = process.env.SUPABASE_URL;
const confirmation = process.env.E2E_CONFIRM_RESET;

const fail = (message) => {
  throw new Error(`Financial E2E reset refused: ${message}`);
};

if (!supabaseUrl) fail('SUPABASE_URL is required');

const target = new URL(supabaseUrl);
const localHosts = new Set(['127.0.0.1', 'localhost']);
if (!localHosts.has(target.hostname) || target.port !== '54321') {
  fail(`only the local Supabase API at localhost:54321 is allowed, received ${target.host}`);
}

if (confirmation !== fixture.fixtureId) {
  fail(`E2E_CONFIRM_RESET must exactly equal ${fixture.fixtureId}`);
}

const result = spawnSync('supabase', ['db', 'reset', '--local'], {
  cwd: new URL('../../', import.meta.url),
  encoding: 'utf8',
  stdio: 'inherit',
});

if (result.error) {
  fail(`could not start the Supabase CLI: ${result.error.message}`);
}

if (result.status !== 0) {
  fail(`supabase db reset exited with status ${result.status}`);
}

console.log(`local Supabase reset completed for ${fixture.fixtureId}`);
