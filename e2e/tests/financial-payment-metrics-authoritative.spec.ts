import { expect, test } from '@playwright/test';

test.describe('HAB payment metrics — authoritative pending counts', () => {
  test.skip(
    !process.env.E2E_ADMIN_EMAIL ||
      !process.env.E2E_ADMIN_PASSWORD ||
      !process.env.E2E_SUPABASE_URL,
    'Only in the isolated financial QA laboratory',
  );

  async function signIn(page: import('@playwright/test').Page) {
    await page.goto('/');
    await page.getByLabel('Correo electrónico').fill(process.env.E2E_ADMIN_EMAIL!);
    await page
      .locator('input[type="password"][autocomplete="current-password"]')
      .fill(process.env.E2E_ADMIN_PASSWORD!);
    await page.getByRole('button', { name: /Iniciar sesión/ }).click();
    await page.waitForURL(/\/app\/dashboard/);
  }

  test('keeps pending cards and review badges complete when loaded review rows are incomplete', async ({
    page,
  }) => {
    let queueIntercepted = false;
    await page.route('**/payments/review-queue', (route) => {
      queueIntercepted = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await signIn(page);
    const summaryPromise = page.waitForResponse(
      (response) => response.url().includes('/payments/summary') && response.status() === 200,
    );
    await page.goto('/app/payments');
    const rows = (await (await summaryPromise).json()) as Array<{
      currency_code: string;
      pending_review_count: number;
    }>;
    const usd = rows.find((row) => row.currency_code === 'USD');
    expect(usd).toBeDefined();
    expect(usd!.pending_review_count).toBeGreaterThan(2);
    expect(queueIntercepted).toBe(true);
    const count = String(usd!.pending_review_count);
    await expect(
      page.locator('.payments-metrics-grid').getByRole('button', { name: /Por revisar/ }),
    ).toContainText(count);
    await expect(page.locator('.payments-section-heading')).toContainText(count + ' pendientes');
    await expect(page.getByRole('tab', { name: /Revisión/ })).toContainText(count);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.locator('.payments-metrics-grid').getByRole('button', { name: /Por revisar/ }),
    ).toContainText(count);
  });

  test('does not substitute loaded queue count when authoritative summary fails', async ({
    page,
  }) => {
    await page.route('**/payments/summary', (route) =>
      route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: '{"error":"QA synthetic outage"}',
      }),
    );
    await signIn(page);
    await page.goto('/app/payments');
    await expect(page.locator('.payments-metric-scope')).toContainText('no disponibles');
    await expect(
      page.locator('.payments-metrics-grid').getByRole('button', { name: /Por revisar/ }),
    ).toContainText('—');
    await expect(page.locator('.payments-section-heading')).toContainText('Total no disponible');
    await expect(page.getByRole('heading', { name: 'Bandeja de revisión' })).toBeVisible();
  });
});
