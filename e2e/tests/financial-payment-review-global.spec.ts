import { expect, test, type Page } from '@playwright/test';

async function signIn(page: Page) {
  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill(process.env.E2E_ADMIN_EMAIL!);
  await page
    .locator('input[type="password"][autocomplete="current-password"]')
    .fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: /Iniciar sesión/ }).click();
  await page.waitForURL(/\/app\/dashboard/);
}

const payments = Array.from({ length: 48 }, (_, index) => ({
  id: `98625000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  condominium_id: '22222222-2222-4222-8222-222222222221',
  unit_id: '33333333-3333-4333-8333-333333333331',
  payment_method_id: '55555555-5555-4555-8555-555555555551',
  payer_name: `Revisor QA ${String(index + 1).padStart(2, '0')}`,
  payment_date: '2026-10-20',
  original_amount: `${index + 10}.00`,
  original_currency_code: 'USD',
  reference: `QA-REVIEW-${index + 1}`,
  status: index % 2 ? 'under_review' : 'submitted',
  can_approve: index % 2 === 0,
}));

function fixtureReviewQueue(page: Page) {
  return page.route('**/payments/review-queue?*', async (route) => {
    const url = new URL(route.request().url());
    const n = Number(url.searchParams.get('page') ?? 1);
    const size = Number(url.searchParams.get('pageSize') ?? 10);
    const status = url.searchParams.get('status');
    const currency = url.searchParams.get('currencyCode');
    const search = (url.searchParams.get('search') ?? '').toLowerCase();
    const filtered = payments.filter(
      (p) =>
        (!status || p.status === status) &&
        (!currency || p.original_currency_code === currency) &&
        (!search || [p.payer_name, p.reference].some((v) => v.toLowerCase().includes(search))),
    );
    const totalPages = Math.ceil(filtered.length / size);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: filtered.slice((n - 1) * size, n * size),
        total: filtered.length,
        page: n,
        pageSize: size,
        totalPages,
        hasNextPage: n < totalPages,
        hasPreviousPage: n > 1,
      }),
    });
  });
}

test.describe('Bandeja de revisión — paginación global y aislamiento', () => {
  test.skip(
    !process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD,
    'Solo en entorno QA aislado',
  );

  test('48 pagos se distribuyen en 5 páginas y conservan filtros en móvil', async ({ page }) => {
    await signIn(page);
    await fixtureReviewQueue(page);
    await page.goto('/app/payments');

    const nav = page.locator('.payments-review-pagination');
    const rows = page.locator('.payments-review-table tbody tr');
    await expect(nav).toContainText('Mostrando 1–10 de 48');
    await expect(nav).toContainText('Página 1 de 5');
    await expect(rows).toHaveCount(10);
    const next = nav.getByRole('button', { name: 'Siguiente' });
    await next.click();
    await expect(nav).toContainText('Página 2 de 5');
    await expect(rows).toHaveCount(10);

    const filters = page.locator('[aria-label="Filtros de revisión"]');
    await filters.getByLabel('Estado').selectOption('under_review');
    await expect(nav).toContainText('Página 1 de 3');
    await expect(nav).toContainText('de 24');
    await filters.getByLabel('Estado').selectOption('');
    await expect(nav).toContainText('Página 1 de 5');

    await page.setViewportSize({ width: 390, height: 844 });
    for (let i = 0; i < 4; i++) await next.click();
    await expect(nav).toContainText('Página 5 de 5');
    await expect(page.locator('.payments-review-list--priority > button')).toHaveCount(8);
    await expect(next).toBeDisabled();
  });

  test('rechaza la visualización al recibir 403, sin fuga de registros', async ({ page }) => {
    await signIn(page);
    await page.route('**/payments/review-queue?*', (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: '{"error":"Forbidden"}',
      }),
    );
    await page.goto('/app/payments');
    await expect(page.locator('.payments-review-panel')).toContainText('Acceso restringido');
    await expect(page.locator('.payments-review-table tbody tr')).toHaveCount(0);
    await expect(page.locator('.payments-review-pagination')).toHaveCount(0);
  });
});
