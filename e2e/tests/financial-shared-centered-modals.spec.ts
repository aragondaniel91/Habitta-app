import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

test('shared finance drawers render as centered Habitta dialogs on desktop and mobile', async ({
  page,
}) => {
  test.skip(
    !process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD,
    'Laboratorio local autenticado',
  );
  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill(process.env.E2E_ADMIN_EMAIL!);
  await page
    .locator('input[type="password"][autocomplete="current-password"]')
    .fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL(/\/app\/dashboard/);
  const cases = [
    { path: '/app/expenses', button: 'Registrar gasto', slug: 'gastos' },
    { path: '/app/fees', button: 'Nueva cuota', slug: 'cuotas' },
  ];
  for (const section of cases) {
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
      await page.goto(section.path);
      await expect(page.getByRole('button', { name: section.button }).first()).toBeVisible();
      await page.getByRole('button', { name: section.button }).first().click();
      const dialog = page.locator('[role="dialog"].habitta-drawer-centered-panel').first();
      await expect(dialog).toBeVisible();
      const position = await dialog.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          middle: rect.left + rect.width / 2,
          viewport: window.innerWidth,
          overflow: element.scrollWidth - element.clientWidth,
        };
      });
      expect(Math.abs(position.middle - position.viewport / 2)).toBeLessThan(12);
      expect(position.overflow).toBeLessThanOrEqual(3);
      const dir = process.env.E2E_VISUAL_EVIDENCE_DIR;
      if (dir) {
        mkdirSync(dir, { recursive: true });
        await page.screenshot({
          path: join(dir, 'modal-shared-' + section.slug + '-' + width + '.png'),
          fullPage: true,
        });
      }
      await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
      await expect(dialog).toHaveCount(0);
    }
  }
});
