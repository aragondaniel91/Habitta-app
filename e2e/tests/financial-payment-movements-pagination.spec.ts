import { expect, test, type Page } from '@playwright/test';

const fakePayments = (total: number) =>
  Array.from({ length: total }, (_, index) => ({
    id: `98624000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    status: index % 12 === 0 ? 'approved' : 'submitted',
    original_amount: `${index + 10}.00`,
    original_currency_code: 'USD',
    payment_date: '2026-10-20',
    payer_name: `Pagador QA ${index + 1}`,
    unit_id: '33333333-3333-4333-8333-333333333331',
    payment_method_id: '55555555-5555-4555-8555-555555555551',
    reference: `QA-MOV-${index + 1}`,
  }));

// Deterministic API fixture: proves that 48 visible payments do not become 48 DOM rows.
// Uses the real authenticated UI while keeping all data and network overrides test-only.
async function mockPaymentHistory(page: Page, total: number) {
  const items = fakePayments(total);
  await page.route(/\/v1\/condominiums\/[^/]+\/payments\?/, (route) => {
    const url = new URL(route.request().url());
    const currentPage = Number(url.searchParams.get('page') ?? 1);
    const pageSize = Number(url.searchParams.get('pageSize') ?? 50);
    const totalPages = Math.ceil(items.length / pageSize);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
        page: currentPage,
        pageSize,
        total: items.length,
        totalPages,
        hasNextPage: currentPage < totalPages,
        hasPreviousPage: currentPage > 1,
      }),
    });
  });
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.locator('input[type="password"][autocomplete="current-password"]').fill(password);
  await page.getByRole('button', { name: /Iniciar sesión/ }).click();
  await page.waitForURL(/\/app\/dashboard/);
}

test.describe('Pagos — paginación visible de movimientos', () => {
  test.skip(
    !process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD,
    'Requiere el laboratorio financiero aislado',
  );

  test('48 pagos se reparten en 5 páginas; filtros y móvil respetan la página activa', async ({
    page,
  }) => {
    await signIn(page, process.env.E2E_ADMIN_EMAIL!, process.env.E2E_ADMIN_PASSWORD!);
    await mockPaymentHistory(page, 48);
    await page.goto('/app/payments');
    await page.getByRole('tab', { name: 'Movimientos' }).click();

    const tableRows = page.locator('.payments-table tbody tr');
    const mobileRows = page.locator('.payments-mobile-list > button');
    const pagination = page.getByRole('navigation', { name: 'Paginación de movimientos' });
    const prev = pagination.getByRole('button', { name: 'Anterior' });
    const next = pagination.getByRole('button', { name: 'Siguiente' });

    await expect(tableRows).toHaveCount(10);
    await expect(mobileRows).toHaveCount(10);
    await expect(pagination).toContainText('Mostrando 1–10 de 48');
    await expect(pagination).toContainText('Página 1 de 5');
    await expect(prev).toBeDisabled();

    const firstRow = await tableRows.first().innerText();
    await next.click();
    await expect(pagination).toContainText('Mostrando 11–20');
    await expect(tableRows).toHaveCount(10);
    expect(await tableRows.first().innerText()).not.toBe(firstRow);
    await prev.click();
    await expect(tableRows.first()).toContainText(firstRow.split('\n')[0]);

    await next.click();
    await page.getByRole('button', { name: 'Aprobados', exact: true }).click();
    await expect(pagination).toContainText('Página 1 de 1');
    await expect(tableRows).toHaveCount(4);
    await expect(next).toBeDisabled();

    await page.getByRole('button', { name: 'Todos', exact: true }).click();
    await expect(pagination).toContainText('Página 1 de 5');
    await expect(tableRows).toHaveCount(10);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(pagination).toBeVisible();
    await next.click();
    await expect(pagination).toContainText('Página 2 de 5');
    await expect(mobileRows).toHaveCount(10);
    for (let i = 0; i < 3; i += 1) await next.click();
    await expect(pagination).toContainText('Página 5 de 5');
    await expect(mobileRows).toHaveCount(8);
    await expect(next).toBeDisabled();
  });

  test('conserva Cargar más para el segundo lote de servidor sin desbordar la tabla', async ({
    page,
  }) => {
    await signIn(page, process.env.E2E_ADMIN_EMAIL!, process.env.E2E_ADMIN_PASSWORD!);
    await mockPaymentHistory(page, 57);
    await page.goto('/app/payments');
    await page.getByRole('tab', { name: 'Movimientos' }).click();

    const pagination = page.getByRole('navigation', { name: 'Paginación de movimientos' });
    await expect(page.locator('.financial-pagination')).toContainText('50 de 57');
    await expect(pagination).toContainText('Página 1 de 5');
    await expect(page.locator('.payments-table tbody tr')).toHaveCount(10);

    await page.getByRole('button', { name: 'Cargar más' }).click();
    await expect(page.locator('.financial-pagination')).toContainText('57 de 57');
    await expect(pagination).toContainText('Página 1 de 6');
    await expect(page.locator('.payments-table tbody tr')).toHaveCount(10);

    for (let i = 0; i < 5; i += 1) {
      await pagination.getByRole('button', { name: 'Siguiente' }).click();
    }
    await expect(pagination).toContainText('Página 6 de 6');
    await expect(page.locator('.payments-table tbody tr')).toHaveCount(7);
    await expect(pagination.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });
});
