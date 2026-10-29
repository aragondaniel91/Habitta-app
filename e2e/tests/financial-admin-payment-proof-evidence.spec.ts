import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const req = [
  'E2E_SUPABASE_URL',
  'E2E_SUPABASE_ANON_KEY',
  'E2E_FIXTURE_PASSWORD',
  'E2E_API_BASE_URL',
];
const primary = '22222222-2222-4222-8222-222222222221';

test('administrator sees real submitted proof, payer comments and reference in review', async ({
  page,
  request,
}) => {
  test.skip(
    req.some((key) => !process.env[key]),
    'Isolated finance lab only',
  );
  const auth = await request.post(
    process.env.E2E_SUPABASE_URL + '/auth/v1/token?grant_type=password',
    {
      headers: { apikey: process.env.E2E_SUPABASE_ANON_KEY! },
      data: {
        email: 'habitta-e2e-payer@example.invalid',
        password: process.env.E2E_FIXTURE_PASSWORD,
      },
    },
  );
  expect(auth.ok(), await auth.text()).toBe(true);
  const token = ((await auth.json()) as { access_token: string }).access_token;
  const unique = 'ADMIN-PROOF-' + Date.now();
  const note = 'Pago enviado por residente con comentario ' + unique;
  const base = process.env.E2E_API_BASE_URL + '/v1/condominiums/' + primary + '/payments';
  const headers = { Authorization: 'Bearer ' + token };
  const create = await request.post(base, {
    headers,
    data: {
      unitId: '33333333-3333-4333-8333-333333333331',
      paymentMethodId: '77777777-7777-4777-8777-777777777771',
      paymentDate: '2026-10-20',
      originalAmount: '8.27',
      originalCurrencyCode: 'USD',
      payerName: 'Residente QA',
      reference: unique,
      notes: note,
      idempotencyKey: unique,
    },
  });
  expect(create.status(), await create.text()).toBe(201);
  const created = (await create.json()) as { id: string };
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL3iwAAAABJRU5ErkJggg==',
    'base64',
  );
  const attached = await request.put(base + '/' + created.id + '/proof', {
    headers: { ...headers, 'Content-Type': 'image/png', 'X-Filename': 'evidence.png' },
    data: png,
  });
  expect(attached.status(), await attached.text()).toBe(201);
  const submit = await request.post(base + '/' + created.id + '/submit', { headers });
  expect(submit.ok(), await submit.text()).toBe(true);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill('habitta-e2e-admin@example.invalid');
  await page
    .locator('input[type="password"][autocomplete="current-password"]')
    .fill(process.env.E2E_FIXTURE_PASSWORD!);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL(/\/app\/dashboard/);
  await page.goto('/app/payments');
  await page.getByRole('tab', { name: /Revisión/ }).click();
  const review = page.locator('#bandeja-revision');
  await review.getByLabel('Buscar pago pendiente').fill(unique);
  const row = review.locator('.payments-review-list--priority button');
  await expect(row).toHaveCount(1);
  await row.click();
  const dialog = page.getByRole('dialog', { name: 'Revisar pago' });
  const evidence = dialog.getByRole('region', { name: 'Datos y comprobante del pago' });
  await expect(evidence).toBeVisible();
  await expect(evidence.getByText('Referencia de la operación')).toBeVisible();
  await expect(evidence.getByText(unique, { exact: true })).toBeVisible();
  await expect(evidence.getByText('Comentario para revisión')).toBeVisible();
  await expect(evidence.getByText(note, { exact: true })).toBeVisible();
  const preview = evidence.locator('img[alt="Comprobante del pago"]');
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute('src', /^blob:/);
  await expect(evidence.getByRole('button', { name: 'Abrir comprobante completo' })).toBeVisible();
  const ordering = await dialog.evaluate((element) => {
    const proof = element.querySelector('.payments-review__submitted-evidence');
    const allocations = element.querySelector('.payments-review__allocation');
    return Boolean(
      proof &&
      allocations &&
      proof.compareDocumentPosition(allocations) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
  expect(ordering).toBe(true);
  if (process.env.E2E_VISUAL_EVIDENCE_DIR) {
    mkdirSync(process.env.E2E_VISUAL_EVIDENCE_DIR, { recursive: true });
    await page.screenshot({
      path: join(process.env.E2E_VISUAL_EVIDENCE_DIR, 'review-evidence-desktop.png'),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(evidence.getByText(note, { exact: true })).toBeVisible();
  await expect(preview).toBeVisible();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 2)).toBe(
    true,
  );
  if (process.env.E2E_VISUAL_EVIDENCE_DIR) {
    await page.screenshot({
      path: join(process.env.E2E_VISUAL_EVIDENCE_DIR, 'review-evidence-mobile.png'),
      fullPage: true,
    });
  }
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
});
