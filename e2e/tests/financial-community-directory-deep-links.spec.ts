import { expect, test, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill(process.env.E2E_ADMIN_EMAIL!);
  await page
    .locator('input[type="password"][autocomplete="current-password"]')
    .fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: /Iniciar sesión/ }).click();
  await page.waitForURL(/\/app\/dashboard/);
}

test.describe('HAB-PILOT-004: navegación Unidades ↔ Personas', () => {
  test.skip(
    !process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD,
    'Requiere el laboratorio financiero aislado',
  );

  test('abre perfil autorizado desde una unidad y regresa a la unidad sin perder el condominio', async ({
    page,
  }) => {
    await login(page);
    await page.goto('/app/units');
    const targetUnit = page.locator('.units-v3-row').filter({ hasText: 'E2E-A101' }).first();
    await expect(targetUnit).toBeVisible();
    await targetUnit.click();

    const detail = page.locator('.units-v3-detail');
    await expect(detail).toBeVisible();
    const personLink = detail.locator('a.units-v3-person-link').first();
    await expect(personLink).toBeVisible();
    const href = await personLink.getAttribute('href');
    expect(href).toMatch(/^\/app\/people\?person=[a-f\d-]{36}&condominium=[a-f\d-]{36}$/);
    await personLink.click();

    await expect(page).toHaveURL(/\/app\/people\?person=[a-f\d-]{36}&condominium=/);
    await expect(page.locator('.people-v3-profile')).toContainText('Habitta');
    const goBack = page.getByRole('button', { name: 'Abrir unidad' }).first();
    await expect(goBack).toBeVisible();
    await goBack.click();

    await expect(page).toHaveURL(/\/app\/units\?unit=[a-f\d-]{36}&condominium=/);
    await expect(page.locator('.units-v3-detail')).toContainText('Habitta E2E Payer');
  });

  test('un identificador ajeno no revela perfiles ni unidades', async ({ page }) => {
    await login(page);
    const missing = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await page.goto('/app/units?unit=' + missing);
    await expect(page.locator('.units-v3-row').first()).toBeVisible();
    await expect(page.locator('.units-v3-detail')).toHaveCount(0);

    await page.goto('/app/people?person=' + missing);
    await expect(page.locator('.people-v3-directory__item').first()).toBeVisible();
    await expect(page.locator('.people-v3-profile')).not.toContainText('Habitta E2E Payer');
  });
});
