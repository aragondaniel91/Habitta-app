import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const specUrl = new URL('./financial-worker-api.spec.ts', import.meta.url);
const configUrl = new URL('../playwright.config.ts', import.meta.url);
const workflowUrl = new URL('../../.github/workflows/financial-e2e.yml', import.meta.url);

test('mantiene el ciclo por Worker limitado a Supabase y Worker locales', async () => {
  const source = await readFile(specUrl, 'utf8');

  expect(source).toContain("['127.0.0.1', 'localhost']");
  expect(source).toContain("target.port !== '54321'");
  expect(source).toContain('Financial E2E requires a local Worker');
  expect(source).toContain('E2E_SUPABASE_ANON_KEY');
  expect(source).toContain('E2E_FIXTURE_PASSWORD');
});

test('arranca el Worker local solo cuando existen credenciales de Supabase', async () => {
  const source = await readFile(configUrl, 'utf8');

  expect(source).toContain('wrangler dev --local --port 8787');
  expect(source).toContain('Boolean(process.env.E2E_SUPABASE_URL)');
  expect(source).toContain('Boolean(process.env.E2E_SUPABASE_ANON_KEY)');
});

test('ejecuta el E2E financiero de verdad y ante cambios en la API', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');

  // Filtering on a package outside the pnpm workspace matched nothing and exited 0, so every
  // step passed without running. npm --prefix is the form playwright.yml already proves works.
  expect(workflow).not.toContain('run: pnpm --filter @habitta/e2e');
  expect(workflow).toContain('npm install --prefix e2e');
  expect(workflow).toContain('npm --prefix e2e run test:financial');
  expect(workflow).toContain("- 'apps/api/**'");
  expect(workflow).toContain("- 'packages/**'");
});
