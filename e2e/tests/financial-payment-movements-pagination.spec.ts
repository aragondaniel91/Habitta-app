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

// Deterministic API fixture: the server, not React, filters, sorts and counts.
async function mockPaymentHistory(page: Page, total: number) {
  const all = fakePayments(total);
  await page.route(/\/v1\/condominiums\/[^/]+\/payments\?/, (route) => {
    const url = new URL(route.request().url());
    const pageNum = Number(url.searchParams.get('page') ?? 1);
    const pageSize = Number(url.searchParams.get('pageSize') ?? 50);
    const group = url.searchParams.get('statusGroup') ?? '';
    const status = url.searchParams.get('status') ?? '';
    const currency = url.searchParams.get('currencyCode') ?? '';
    const unit = url.searchParams.get('unitId') ?? '';
    const from = url.searchParams.get('dateFrom') ?? '';
    const to = url.searchParams.get('dateTo') ?? '';
    const query = (url.searchParams.get('search') ?? '').toLocaleLowerCase();
    const sortBy = url.searchParams.get('sortBy') ?? 'date';
    const sortDir = url.searchParams.get('sortDir') ?? 'desc';
    const filtered = all
      .filter(
        (p) =>
          (!currency || p.original_currency_code === currency) &&
          (!status || p.status === status) &&
          (!unit || p.unit_id === unit) &&
          (!from || p.payment_date >= from) &&
          (!to || p.payment_date <= to) &&
          (!query ||
            [p.payer_name, p.reference].some((v) => v.toLocaleLowerCase().includes(query))) &&
          (!group ||
            (group === 'pending'
              ? ['submitted', 'under_review'].includes(p.status)
              : group === 'approved'
                ? p.status === 'approved'
                : group === 'reversed'
                  ? p.status === 'reversed'
                  : ['draft', 'correction_requested'].includes(p.status))),
      )
      .sort((a, b) => {
        let compared = 0;
        if (sortBy === 'amount') compared = Number(a.original_amount) - Number(b.original_amount);
        else if (sortBy === 'payer') compared = a.payer_name.localeCompare(b.payer_name);
        else if (sortBy === 'status') compared = a.status.localeCompare(b.status);
        return (sortDir === 'asc' ? compared : -compared) || b.id.localeCompare(a.id);
      });
    const pages = Math.ceil(filtered.length / pageSize);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: filtered.slice((pageNum - 1) * pageSize, pageNum * pageSize),
        page: pageNum,
        pageSize,
        total: filtered.length,
        totalPages: pages,
        hasNextPage: pageNum < pages,
        hasPreviousPage: pageNum > 1,
      }),
    });
  });
}

async function signIn(page: Page) {
  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill(process.env.E2E_ADMIN_EMAIL!);
  await page
    .locator('input[type="password"][autocomplete="current-password"]')
    .fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: /Iniciar sesión/ }).click();
  await page.waitForURL(/\/app\/dashboard/);
}

test.describe('Pagos — paginación global desde API', () => {
  test.skip(
    !process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD,
    'Requiere el laboratorio financiero aislado',
  );

  test('48 pagos se reparten en 5 páginas con filtros globales y móvil', async ({ page }) => {
    await signIn(page);
    await mockPaymentHistory(page, 48);
    await page.goto('/app/payments');
    await page.getByRole('tab', { name: 'Movimientos' }).click();

    const rows = page.locator('.payments-table tbody tr');
    const mobileRows = page.locator('.payments-mobile-list > button');
    const nav = page.getByRole('navigation', { name: 'Paginación de movimientos' });
    const prev = nav.getByRole('button', { name: 'Anterior' });
    const next = nav.getByRole('button', { name: 'Siguiente' });
    await expect(rows).toHaveCount(10);
    await expect(nav).toContainText('Mostrando 1–10 de 48');
    await expect(nav).toContainText('Página 1 de 5');
    await expect(prev).toBeDisabled();

    await next.click();
    await expect(nav).toContainText('Mostrando 11–20');
    await expect(rows).toHaveCount(10);
    await prev.click();
    await expect(nav).toContainText('Página 1 de 5');

    await page.getByRole('button', { name: 'Aprobados', exact: true }).click();
    await expect(nav).toContainText('Página 1 de 1');
    await expect(rows).toHaveCount(4);
    await expect(next).toBeDisabled();
    await page.getByRole('button', { name: 'Todos', exact: true }).click();
    await expect(nav).toContainText('Página 1 de 5');

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(nav).toBeVisible();
    await next.click();
    await expect(nav).toContainText('Página 2 de 5');
    await expect(mobileRows).toHaveCount(10);
    for (let i = 0; i < 3; i++) await next.click();
    await expect(nav).toContainText('Página 5 de 5');
    await expect(mobileRows).toHaveCount(8);
    await expect(next).toBeDisabled();
  });

  test('57 pagos: el total global aparece inmediatamente sin Cargar más', async ({ page }) => {
    await signIn(page);
    await mockPaymentHistory(page, 57);
    await page.goto('/app/payments');
    await page.getByRole('tab', { name: 'Movimientos' }).click();
    const nav = page.getByRole('navigation', { name: 'Paginación de movimientos' });
    const rows = page.locator('.payments-table tbody tr');
    await expect(nav).toContainText('Página 1 de 6');
    await expect(nav).toContainText('de 57 coincidencias totales');
    await expect(rows).toHaveCount(10);
    await expect(page.getByRole('button', { name: 'Cargar más' })).toHaveCount(0);
    for (let i = 0; i < 5; i++) await nav.getByRole('button', { name: 'Siguiente' }).click();
    await expect(nav).toContainText('Página 6 de 6');
    await expect(rows).toHaveCount(7);
    await expect(nav.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });
});
