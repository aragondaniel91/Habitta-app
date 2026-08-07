import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const flowUrl = new URL('./financial-payment-lifecycle.spec.ts', import.meta.url);

test('mantiene el flujo financiero autenticado limitado a Supabase local', async () => {
  const source = await readFile(flowUrl, 'utf8');

  expect(source).toContain("['127.0.0.1', 'localhost']");
  expect(source).toContain("target.port !== '54321'");
  expect(source).toContain('E2E_SUPABASE_ANON_KEY');
  expect(source).toContain('E2E_FIXTURE_PASSWORD');
  expect(source).toContain("expect(await balance(request, payer.access_token)).toBe(125)");
  expect(source).toContain("expect(await balance(request, payer.access_token)).toBe(0)");
  expect(source).toContain("next_status: 'correction_requested'");
  expect(source).toContain('expect(denied.ok()).toBe(false)');
  expect(source).toContain('payment_receipts');
});
