import { test, expect } from '@playwright/test';

test('Pagos inicia sin leer todas las cuotas; solicita saldos sólo al elegir unidad', async ({
  page,
  request,
}) => {
  test.skip(
    !process.env.E2E_ADMIN_EMAIL ||
      !process.env.E2E_ADMIN_PASSWORD ||
      !process.env.E2E_SUPABASE_URL ||
      !process.env.E2E_SUPABASE_ANON_KEY,
    'Solo laboratorio aislado',
  );
  const apiUrl = process.env.E2E_SUPABASE_URL!;
  const email = process.env.E2E_ADMIN_EMAIL!;
  const password = process.env.E2E_ADMIN_PASSWORD!;
  const auth = await request.post(apiUrl + '/auth/v1/token?grant_type=password', {
    headers: { apikey: process.env.E2E_SUPABASE_ANON_KEY! },
    data: { email, password },
  });
  expect(auth.ok(), await auth.text()).toBe(true);
  const unit = '33333333-3333-4333-8333-333333333331';
  const receivableRequests: string[] = [];
  page.on('request', (requestInfo) => {
    const url = new URL(requestInfo.url());
    if (
      page.url().includes('/app/payments') &&
      /\/v1\/condominiums\/[^/]+\/receivables$/.test(url.pathname)
    ) {
      receivableRequests.push(requestInfo.url());
    }
  });
  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.locator('input[type="password"][autocomplete="current-password"]').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL(/\/app\/dashboard/);
  await page.goto('/app/payments');
  await expect(page.getByRole('button', { name: 'Registrar pago' })).toBeVisible();
  expect(receivableRequests, 'opening the payments page must not scan all charges').toEqual([]);

  await page.getByRole('button', { name: 'Registrar pago' }).click();
  const dialog = page.getByRole('dialog', { name: 'Registrar un pago' });
  await expect(dialog).toBeVisible();
  expect(
    receivableRequests,
    'opening the wizard without unit selection should not fetch charges',
  ).toEqual([]);

  await dialog.getByRole('combobox').first().selectOption(unit);
  await expect(dialog.getByRole('combobox')).toHaveCount(2);
  expect(receivableRequests.length).toBeGreaterThan(0);
  for (const recorded of receivableRequests) {
    const url = new URL(recorded);
    expect(url.searchParams.get('unitId')).toBe(unit);
    expect(url.searchParams.get('page')).toBeTruthy();
    expect(url.searchParams.get('pageSize')).toBeTruthy();
  }
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();
});
