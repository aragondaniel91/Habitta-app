import { expect, test } from '@playwright/test';

test('Movimientos no presenta resultados parciales si falla la consulta global; permite reintentar', async ({
  page,
}) => {
  test.skip(
    !process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD,
    'Solo en QA financiero aislado',
  );
  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill(process.env.E2E_ADMIN_EMAIL!);
  await page
    .locator('input[type="password"][autocomplete="current-password"]')
    .fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: /Iniciar sesión/ }).click();
  await page.waitForURL(/\/app\/dashboard/);
  await page.goto('/app/payments');
  await expect(page.getByRole('tab', { name: 'Movimientos' })).toBeVisible();

  const badRequest = (url: URL) =>
    url.pathname.endsWith('/payments') && url.searchParams.get('pageSize') === '10';
  await page.route(
    (url) => badRequest(new URL(url.toString())),
    (route) =>
      route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Error temporal QA' }),
      }),
  );
  await page.getByRole('tab', { name: 'Movimientos' }).click();
  const warning = page.getByRole('alert');
  await expect(warning).toContainText('No se pudo consultar el historial completo');
  await expect(page.locator('.payments-table tbody tr')).toHaveCount(0);
  // This isolated test installs no other route overrides.
  await page.unrouteAll();
  await warning.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByRole('navigation', { name: 'Paginación de movimientos' })).toBeVisible();
  await expect(warning).toHaveCount(0);
});
