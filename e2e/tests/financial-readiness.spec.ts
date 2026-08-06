import { expect, test } from '@playwright/test';

const requiredEnvironment = [
  'E2E_BASE_URL',
  'E2E_ADMIN_EMAIL',
  'E2E_ADMIN_PASSWORD',
  'E2E_CONDOMINIUM_NAME',
];
const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);

test.describe('Preparación del flujo financiero', () => {
  test.skip(
    missingEnvironment.length > 0,
    `Fixture financiero aislado pendiente: ${missingEnvironment.join(', ')}`,
  );

  test('el administrador autenticado puede abrir cuotas y pagos', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Correo electrónico').fill(process.env.E2E_ADMIN_EMAIL ?? '');
    await page.getByLabel('Contraseña').fill(process.env.E2E_ADMIN_PASSWORD ?? '');
    await page.getByRole('button', { name: /Iniciar sesión/ }).click();

    await page.waitForURL(/\/app\/dashboard/);
    await expect(page.getByText(process.env.E2E_CONDOMINIUM_NAME ?? '')).toBeVisible();

    await page.goto('/app/fees');
    await expect(page.getByRole('heading', { name: 'Cuotas y cuentas por cobrar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nueva cuota' })).toBeVisible();

    await page.goto('/app/payments');
    await expect(page.getByRole('heading', { name: 'Pagos y comprobantes' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Registrar pago' })).toBeVisible();
  });
});
