import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const provisionUrl = new URL('../scripts/provision-financial-fixture.mjs', import.meta.url);
const resetUrl = new URL('../scripts/reset-financial-fixture.mjs', import.meta.url);

test('limita el aprovisionamiento financiero a Supabase local', async () => {
  const source = await readFile(provisionUrl, 'utf8');

  expect(source).toContain("new Set(['127.0.0.1', 'localhost'])");
  expect(source).toContain("target.port !== '54321'");
  expect(source).toContain('SUPABASE_SERVICE_ROLE_KEY is required');
  expect(source).toContain('E2E_FIXTURE_PASSWORD must contain at least 12 characters');
  expect(source).not.toContain('habitta-web-prod.pages.dev');
});

test('limpia el fixture mediante reset local y confirmación exacta', async () => {
  const source = await readFile(resetUrl, 'utf8');

  expect(source).toContain("new Set(['127.0.0.1', 'localhost'])");
  expect(source).toContain("target.port !== '54321'");
  expect(source).toContain('E2E_CONFIRM_RESET must exactly equal');
  expect(source).toContain("spawnSync('supabase', ['db', 'reset', '--local']");
  expect(source).not.toContain("method: 'DELETE'");
});
