import { expect, test, type Locator, type Page } from '@playwright/test';

const requiredEnvironment = ['E2E_SUPABASE_URL', 'E2E_SUPABASE_ANON_KEY', 'E2E_FIXTURE_PASSWORD'];
const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);
const password = process.env.E2E_FIXTURE_PASSWORD ?? '';
const baseUrl = process.env.E2E_BASE_URL;

if (baseUrl && new URL(baseUrl).hostname === 'habitta-web-prod.pages.dev') {
  throw new Error('Authenticated form layout E2E must not run against production.');
}

const administrator = 'habitta-e2e-admin@example.invalid';

const assertNoHorizontalOverflow = async (page: Page, dialog?: Locator) => {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);

  if (dialog) {
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
      true,
    );
  }
};

const signInAsAdministrator = async (page: Page) => {
  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill(administrator);
  await page.locator('input[type="password"][autocomplete="current-password"]').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL(/\/app\/dashboard/);
};

const openAtMobileSize = async (page: Page, path: string, opener: RegExp | string) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(path);
  const button = page.getByRole('button', { name: opener }).first();
  await expect(button).toBeVisible();
  await button.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return { button, dialog };
};

test.describe('Formularios administrativos autenticados', () => {
  test.skip(
    missingEnvironment.length > 0,
    `Supabase local y fixture financiero requeridos: ${missingEnvironment.join(', ')}`,
  );

  test('People conserva foco, teclado, retorno y layout móvil dentro del Drawer', async ({
    page,
  }) => {
    await signInAsAdministrator(page);
    const { button: opener, dialog } = await openAtMobileSize(page, '/app/people', 'Nueva persona');

    await expect(dialog).toHaveAccessibleName('Nueva persona');
    const firstInput = dialog.getByRole('textbox', { name: 'Nombre', exact: true });
    await expect(firstInput).toBeFocused();
    await expect(dialog.locator('.form-section')).toHaveCount(2);
    await expect(dialog.locator('.form-grid')).toHaveCount(1);
    await expect(dialog.getByLabel('Relación')).toBeVisible();
    await expect(dialog.locator('.form-actions')).toBeVisible();

    const cancel = dialog.getByRole('button', { name: 'Cancelar' });
    await expect(cancel).toHaveAttribute('type', 'button');
    await expect(cancel).toBeInViewport();
    await assertNoHorizontalOverflow(page, dialog);

    const focusables = dialog.locator(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const focusableCount = await focusables.count();
    let wrappedToFirstInput = false;
    for (let index = 0; index <= focusableCount; index += 1) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(
        true,
      );
      if (await firstInput.evaluate((element) => element === document.activeElement)) {
        wrappedToFirstInput = true;
      }
    }
    expect(wrappedToFirstInput).toBe(true);

    await cancel.click();
    await expect(dialog).toBeHidden();

    await opener.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('Payments muestra el drawer y acciones compartidas sin overflow móvil', async ({ page }) => {
    await signInAsAdministrator(page);
    const { dialog } = await openAtMobileSize(page, '/app/payments', 'Registrar pago');

    await expect(dialog).toHaveAccessibleName('Registrar pago');
    for (const label of ['Unidad', 'Método de pago', 'Fecha del pago', 'Monto']) {
      await expect(dialog.getByLabel(label)).toBeVisible();
    }
    await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeInViewport();
    await expect(dialog.getByRole('button', { name: 'Continuar al comprobante' })).toBeInViewport();
    await expect(dialog.locator('.form-grid')).toBeVisible();
    await expect(dialog.locator('.form-actions')).toBeVisible();
    await assertNoHorizontalOverflow(page, dialog);

    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();
  });

  test('Expenses conserva sus acciones sin crear un borrador ni desbordar en móvil', async ({
    page,
  }) => {
    await signInAsAdministrator(page);
    const { dialog } = await openAtMobileSize(page, '/app/expenses', 'Registrar gasto');

    await expect(dialog).toHaveAccessibleName('Registrar gasto');
    for (const label of ['Descripción', 'Categoría', 'Fecha del gasto', 'Monto']) {
      await expect(dialog.getByLabel(label)).toBeVisible();
    }
    await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeInViewport();
    await expect(dialog.getByRole('button', { name: 'Continuar al comprobante' })).toBeInViewport();
    await expect(dialog.locator('.form-grid')).toHaveCount(4);
    await expect(dialog.locator('.form-actions')).toBeVisible();
    await assertNoHorizontalOverflow(page, dialog);

    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();
  });

  test('Treasury abre la cuenta nueva con grid y acciones alcanzables en móvil', async ({
    page,
  }) => {
    await signInAsAdministrator(page);
    const { dialog } = await openAtMobileSize(page, '/app/treasury', 'Nueva cuenta');

    await expect(dialog).toHaveAccessibleName('Nueva cuenta');
    await expect(dialog.getByLabel('Nombre')).toBeVisible();
    await expect(dialog.getByLabel('Tipo')).toBeVisible();
    await expect(dialog.getByLabel('Moneda')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeInViewport();
    await expect(dialog.getByRole('button', { name: 'Crear cuenta' })).toBeInViewport();
    await expect(dialog.locator('.form-grid')).toBeVisible();
    await expect(dialog.locator('.form-actions')).toBeVisible();
    await assertNoHorizontalOverflow(page, dialog);

    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();
  });

  test('Receivables usa Drawer y formulario premium sin overflow móvil', async ({ page }) => {
    await signInAsAdministrator(page);
    const { button: opener, dialog } = await openAtMobileSize(
      page,
      '/app/fees',
      'Nuevo concepto',
    );

    await expect(dialog).toHaveAccessibleName('Crear concepto de cobro');
    for (const label of [
      'Código',
      'Categoría',
      'Nombre',
      'Descripción',
      'Moneda sugerida',
      'Monto sugerido',
    ]) {
      await expect(dialog.getByLabel(label)).toBeVisible();
    }
    await expect(dialog.locator('.form-grid')).toHaveCount(2);
    await expect(dialog.locator('.form-actions')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Crear concepto' })).toBeInViewport();

    const controls = dialog.locator('.input, .select, textarea');
    for (let index = 0; index < (await controls.count()); index += 1) {
      expect(
        await controls.nth(index).evaluate((element) => element.getBoundingClientRect().height),
      ).toBeGreaterThanOrEqual(47);
    }
    await assertNoHorizontalOverflow(page, dialog);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('Receivables baja KPI y herramientas a una columna en teléfono estrecho', async ({
    page,
  }) => {
    await signInAsAdministrator(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/app/fees');

    const metrics = page.locator('.receivables-metrics-grid');
    const tools = page.locator('.receivables-tools-menu');
    await expect(metrics).toBeVisible();
    await expect(tools).toBeVisible();
    expect(
      await metrics.evaluate(
        (element) => getComputedStyle(element).gridTemplateColumns.split(' ').length,
      ),
    ).toBe(1);
    expect(
      await tools.evaluate(
        (element) => getComputedStyle(element).gridTemplateColumns.split(' ').length,
      ),
    ).toBe(1);
    await assertNoHorizontalOverflow(page);
  });
});
