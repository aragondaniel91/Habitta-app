import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

test('métodos de pago: tabla accesible, acciones CRUD y modales centrados', async ({ page }) => {
  test.skip(
    !process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD,
    'Solo laboratorio aislado',
  );
  const label = 'QA Metodocentrado ' + Date.now();
  const revised = label + ' editado';
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill(process.env.E2E_ADMIN_EMAIL!);
  await page
    .locator('input[type="password"][autocomplete="current-password"]')
    .fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL(/\/app\/dashboard/);
  await page.goto('/app/payments');
  await page.getByRole('tab', { name: 'Métodos de pago' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Métodos de pago' });
  const table = panel.locator('.payments-methods-table');
  await expect(table).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Acciones' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Configurar métodos' })).toBeVisible();
  await panel.getByRole('button', { name: 'Configurar métodos' }).click();
  const create = page.getByRole('dialog', { name: 'Configurar método de pago' });
  await expect(create).toBeVisible();
  await expect(create).toHaveClass(/app-dialog/);
  await create.getByLabel('Tipo', { exact: true }).selectOption('cash');
  await create.getByLabel('Nombre visible').fill(label);
  await create
    .getByLabel(/Lugar e instrucciones para entregar efectivo/)
    .fill('Entregar en recepción bajo verificación manual.');
  const proofDir = process.env.E2E_VISUAL_EVIDENCE_DIR;
  if (proofDir) {
    mkdirSync(proofDir, { recursive: true });
    await page.screenshot({
      path: join(proofDir, 'admin-methods-create-centered.png'),
      fullPage: true,
    });
  }
  await create.getByRole('button', { name: 'Crear método' }).click();
  await expect(create).toHaveCount(0);
  let row = table.getByRole('row').filter({ hasText: label });
  await expect(row).toHaveCount(1);
  await expect(row.getByRole('button', { name: 'Editar ' + label })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Desactivar ' + label })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Eliminar ' + label })).toBeVisible();
  await row.getByRole('button', { name: 'Editar ' + label }).click();
  const edit = page.getByRole('dialog', { name: 'Editar método de pago' });
  await expect(edit).toBeVisible();
  await expect(edit.getByLabel('Nombre visible')).toHaveValue(label);
  await edit.getByLabel('Nombre visible').fill(revised);
  await edit.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(edit).toHaveCount(0);
  row = table.getByRole('row').filter({ hasText: revised });
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: 'Desactivar ' + revised }).click();
  await expect(row.getByText('Inactivo', { exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'Activar ' + revised }).click();
  await expect(row.getByText('Activo', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(row.getByRole('button', { name: 'Editar ' + revised })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2),
  ).toBe(true);
  if (proofDir)
    await page.screenshot({ path: join(proofDir, 'admin-methods-mobile.png'), fullPage: true });
  await row.getByRole('button', { name: 'Eliminar ' + revised }).click();
  const confirm = page.getByRole('dialog', { name: 'Eliminar «' + revised + '»' });
  await expect(confirm).toBeVisible();
  await expect(confirm).toHaveClass(/app-dialog/);
  await confirm.getByRole('button', { name: 'Eliminar método' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(row).toHaveCount(0);
});
