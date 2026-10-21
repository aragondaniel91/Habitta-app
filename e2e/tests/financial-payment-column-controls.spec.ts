import { test, expect } from '@playwright/test';

test.describe('Pagos — columnas, filtros y orden', () => {
  test.skip(
    !process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD,
    'Solo para laboratorio QA aislado',
  );

  async function enterPayments(page: import('@playwright/test').Page) {
    await page.goto('/');
    await page.getByLabel('Correo electrónico').fill(process.env.E2E_ADMIN_EMAIL!);
    await page
      .locator('input[type="password"][autocomplete="current-password"]')
      .fill(process.env.E2E_ADMIN_PASSWORD!);
    await page.getByRole('button', { name: /Iniciar sesión/ }).click();
    await page.waitForURL(/\/app\/dashboard/);
    await page.goto('/app/payments');
  }

  test('Movimientos: encabezados ordenables, filtros y paginación responsive', async ({ page }) => {
    await enterPayments(page);
    await page.getByRole('tab', { name: 'Movimientos' }).click();
    const table = page.locator('.payments-table:not(.payments-review-table)');
    const rows = table.locator('tbody tr');
    const toolbar = page.locator('[aria-label="Filtros de movimientos"]');
    const nav = page.getByRole('navigation', { name: 'Paginación de movimientos' });
    await expect(rows).toHaveCount(10);

    const dateHeader = table.getByRole('columnheader', { name: /Fecha/ });
    await expect(dateHeader).toHaveAttribute('aria-sort', 'descending');
    await dateHeader.getByRole('button').click();
    await expect(dateHeader).toHaveAttribute('aria-sort', 'ascending');
    await expect(nav).toContainText('Página 1 de');

    await table
      .getByRole('columnheader', { name: /Unidad/ })
      .getByRole('button')
      .click();
    await expect(table.getByRole('columnheader', { name: /Unidad/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    await toolbar.getByLabel('Ordenar movimientos').selectOption('amount-desc');
    await expect(table.getByRole('columnheader', { name: /Monto/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    );

    // Range outside the lab dataset must empty the page rather than leak other rows.
    await toolbar.getByLabel('Desde').fill('2035-01-01');
    await expect(rows).toHaveCount(0);
    await toolbar.getByRole('button', { name: 'Limpiar filtros' }).click();
    await expect(rows).toHaveCount(10);
    await expect(nav).toContainText('Página 1 de');

    const unit = await toolbar
      .getByLabel('Unidad')
      .locator('option:not([value=""])')
      .first()
      .getAttribute('value');
    expect(unit).toBeTruthy();
    await toolbar.getByLabel('Unidad').selectOption(unit!);
    await expect.poll(async () => rows.count()).toBeGreaterThan(0);
    await expect(rows).toHaveCount(Math.min(await rows.count(), 10));

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(toolbar.getByLabel('Ordenar movimientos')).toBeVisible();
    await expect(page.locator('.payments-mobile-list > button').first()).toBeVisible();
    await expect(nav).toBeVisible();
  });

  test('Revisión: columnas visibles y filtros de unidad, fecha y estado', async ({ page }) => {
    await enterPayments(page);
    const toolbar = page.locator('[aria-label="Filtros de revisión"]');
    const table = page.locator('.payments-review-table');
    const nav = page.locator('.payments-review-pagination');

    await expect(table).toBeVisible();
    await expect(table.locator('tbody tr')).toHaveCount(10);
    for (const name of ['Unidad', 'Pagador', 'Fecha', 'Estado', 'Monto']) {
      await expect(table.getByRole('columnheader', { name: new RegExp(name) })).toBeVisible();
    }
    await table
      .getByRole('columnheader', { name: /Unidad/ })
      .getByRole('button')
      .click();
    await expect(table.getByRole('columnheader', { name: /Unidad/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );

    await toolbar.getByLabel('Estado').selectOption('under_review');
    await expect(nav).toContainText('Página 1 de');
    await toolbar.getByLabel('Desde').fill('2035-01-01');
    await expect(table.locator('tbody tr')).toHaveCount(0);
    await expect(
      page.getByText('No hay pagos pendientes que coincidan con la búsqueda.'),
    ).toBeVisible();
    await toolbar.getByRole('button', { name: 'Limpiar filtros' }).click();
    await expect(table.locator('tbody tr')).toHaveCount(10);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.payments-review-list--priority button').first()).toBeVisible();
    await expect(toolbar.getByLabel('Ordenar revisión')).toBeVisible();
  });
});
