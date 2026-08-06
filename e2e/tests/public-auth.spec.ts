import { expect, test } from '@playwright/test';

const collectPageErrors = (pageErrors: Error[]) => (error: Error) => pageErrors.push(error);

test.describe('Acceso público de Habitta', () => {
  test('muestra el inicio de sesión sin errores de JavaScript', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', collectPageErrors(pageErrors));

    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Bienvenido a Habitta' })).toBeVisible();
    await expect(page.getByLabel('Correo electrónico')).toBeVisible();
    await expect(page.getByLabel('Contraseña')).toBeVisible();
    await expect(page.getByRole('button', { name: /Iniciar sesión/ })).toBeEnabled();
    await expect(page.getByText('Gestión de condominios')).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test('permite recorrer registro y recuperación sin perder el acceso', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(
      page.getByRole('heading', { name: 'Crea tu cuenta administrativa' }),
    ).toBeVisible();
    await expect(page.getByLabel('Nombre y apellido')).toBeVisible();
    await expect(page.getByLabel('Confirmar contraseña')).toBeVisible();

    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.getByRole('button', { name: '¿Olvidaste tu contraseña?' }).click();
    await expect(page.getByRole('heading', { name: 'Recupera tu contraseña' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Enviar enlace de recuperación/ })).toBeVisible();
  });

  test('mantiene protegida una ruta administrativa sin sesión', async ({ page }) => {
    await page.goto('/app/payments');

    await expect(page.getByRole('heading', { name: 'Bienvenido a Habitta' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Iniciar sesión/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pagos y comprobantes' })).toHaveCount(0);
  });
});
