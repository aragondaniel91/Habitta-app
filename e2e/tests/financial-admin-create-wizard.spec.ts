import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

test('administrador envía pago por cuota mediante asistente compartido', async ({
  page,
  request,
}) => {
  test.skip(
    !process.env.E2E_ADMIN_EMAIL ||
      !process.env.E2E_ADMIN_PASSWORD ||
      !process.env.E2E_SUPABASE_ANON_KEY ||
      !process.env.E2E_SUPABASE_URL,
    'Solo laboratorio',
  );
  const email = process.env.E2E_ADMIN_EMAIL!;
  const password = process.env.E2E_ADMIN_PASSWORD!;
  const url = process.env.E2E_SUPABASE_URL!;
  const auth = await request.post(url + '/auth/v1/token?grant_type=password', {
    headers: { apikey: process.env.E2E_SUPABASE_ANON_KEY! },
    data: { email, password },
  });
  expect(auth.ok(), await auth.text()).toBe(true);
  const token = ((await auth.json()) as { access_token: string }).access_token;
  const condo = '22222222-2222-4222-8222-222222222221';
  const unit = '33333333-3333-4333-8333-333333333331';
  const chargeName = 'Pago administrativo prueba ' + Date.now();
  const bankReference = 'QA-ADMIN-' + Date.now();
  const api = process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:8787';
  const receivable = await request.post(api + '/v1/condominiums/' + condo + '/receivables', {
    headers: { Authorization: 'Bearer ' + token },
    data: {
      unitId: unit,
      conceptId: '66666666-6666-4666-8666-666666666661',
      description: chargeName,
      amount: '15.25',
      currencyCode: 'USD',
      issueDate: '2026-10-19',
    },
  });
  expect(receivable.status(), await receivable.text()).toBe(201);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.locator('input[type="password"][autocomplete="current-password"]').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL(/\/app\/dashboard/);
  await page.goto('/app/payments');
  await page.getByRole('button', { name: 'Registrar pago' }).click();
  const dialog = page.getByRole('dialog', { name: 'Registrar un pago' });
  await dialog.getByRole('combobox').first().selectOption(unit);
  await dialog.getByRole('combobox').nth(1).selectOption('USD');
  await dialog.getByLabel('Buscar cuota').fill(chargeName);
  await expect(
    dialog.locator('.resident-payment-wizard__charges input[type="checkbox"]'),
  ).toHaveCount(1);
  await dialog.getByText(chargeName, { exact: true }).click();
  await dialog.getByRole('button', { name: 'Continuar' }).click();
  await expect(dialog.getByText('Total: 15.25 USD')).toBeVisible();
  await dialog.getByRole('button', { name: 'Continuar' }).click();
  await dialog.getByRole('combobox').selectOption('77777777-7777-4777-8777-777777777771');
  await dialog.getByLabel('Nombre del pagador').fill('Administrador QA');
  await dialog.getByLabel(/Referencia/).fill(bankReference);
  await dialog
    .getByLabel('Información adicional (opcional)')
    .fill('Recibido en la oficina de administración.');
  await dialog.getByLabel('Seleccionar comprobante').setInputFiles({
    name: 'comprobante-admin.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL3iwAAAABJRU5ErkJggg==',
      'base64',
    ),
  });
  await dialog.getByRole('button', { name: 'Continuar' }).click();
  await expect(dialog.getByText('Confirma tu propuesta')).toBeVisible();
  const dir = process.env.E2E_VISUAL_EVIDENCE_DIR;
  if (dir) {
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: join(dir, 'admin-guided-payment-desktop.png'), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 2)).toBe(true);
  if (dir)
    await page.screenshot({ path: join(dir, 'admin-guided-payment-mobile.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Enviar a revisión' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Pago enviado a revisión.').first()).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('tab', { name: 'Movimientos' }).click();
  await page.getByPlaceholder('Buscar pago…').fill(bankReference);
  const row = page.locator('.payments-table tbody tr').filter({ hasText: bankReference });
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: 'Revisar' }).click();
  const review = page.getByRole('dialog', { name: 'Revisar pago' });
  await expect(review).toBeVisible();
  await expect(review.getByText('Información adicional', { exact: true })).toBeVisible();
  await expect(review.getByText('Recibido en la oficina de administración.')).toBeVisible();
  await expect(review.getByText(chargeName, { exact: true })).toBeVisible();
  // No se invoca aprobación ni se escribe en libro mayor.
});
