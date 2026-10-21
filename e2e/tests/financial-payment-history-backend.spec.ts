import { expect, test } from '@playwright/test';

test('Movimientos consulta al servidor por búsqueda y orden de unidad/método', async ({ page }) => {
  test.skip(
    !process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD,
    'Requiere laboratorio QA financiero aislado',
  );
  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill(process.env.E2E_ADMIN_EMAIL!);
  await page
    .locator('input[type="password"][autocomplete="current-password"]')
    .fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: /Iniciar sesión/ }).click();
  await page.waitForURL(/\/app\/dashboard/);
  await page.goto('/app/payments');
  await page.getByRole('tab', { name: 'Movimientos' }).click();

  const filters = page.locator('[aria-label="Filtros de movimientos"]');
  const awaitPayments = (selector: (url: URL) => boolean) =>
    page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname.includes('/payments') &&
        url.searchParams.get('pageSize') === '10' &&
        selector(url)
      );
    });

  const searchResult = awaitPayments((url) => url.searchParams.get('search') === 'QA');
  await filters.getByLabel('Buscar').fill('QA');
  const filtered = await searchResult;
  expect(filtered.status()).toBe(200);
  const filteredRows = (await filtered.json()) as { items: unknown[]; total: number };
  expect(filteredRows.items.length).toBeLessThanOrEqual(10);
  expect(filteredRows.total).toBeGreaterThanOrEqual(0);

  const methodResult = awaitPayments((url) => url.searchParams.get('sortBy') === 'method');
  await filters.getByLabel('Ordenar movimientos').selectOption('method-asc');
  const methods = await methodResult;
  expect(methods.status()).toBe(200);

  const unitResult = awaitPayments((url) => url.searchParams.get('sortBy') === 'unit');
  await filters.getByLabel('Ordenar movimientos').selectOption('unit-asc');
  const units = await unitResult;
  expect(units.status()).toBe(200);

  await expect(page.getByRole('alert')).toHaveCount(0);
});
