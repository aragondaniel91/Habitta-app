import { expect, test, type Page } from '@playwright/test';

const requiredEnvironment = ['E2E_SUPABASE_URL', 'E2E_SUPABASE_ANON_KEY', 'E2E_FIXTURE_PASSWORD'];
const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);
const supabaseUrl = process.env.E2E_SUPABASE_URL;
const workerUrl = process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:8787';
const fixturePassword = process.env.E2E_FIXTURE_PASSWORD;

const ids = {
  condominium: '22222222-2222-4222-8222-222222222221',
  unit: '33333333-3333-4333-8333-333333333331',
  concept: '66666666-6666-4666-8666-666666666661',
  paymentMethod: '77777777-7777-4777-8777-777777777771',
};

const users = {
  author: 'habitta-e2e-admin@example.invalid',
  reviewer: 'habitta-e2e-reviewer@example.invalid',
};

const assertLocalUrl = (value: string, expectedPort: string, label: string) => {
  const url = new URL(value);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== expectedPort) {
    throw new Error(`${label} must target local infrastructure, received ${url.host}`);
  }
};

if (supabaseUrl) assertLocalUrl(supabaseUrl, '54321', 'Financial E2E Supabase');
assertLocalUrl(workerUrl, '8787', 'Financial E2E Worker');

async function login(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill(email);
  await page
    .locator('input[type="password"][autocomplete="current-password"]')
    .fill(fixturePassword!);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL(/\/app\/dashboard/);
}

test.describe('Dashboard de pagos — revisión independiente entre administradores', () => {
  test.skip(
    missingEnvironment.length > 0,
    `Supabase local y fixture financiero requeridos: ${missingEnvironment.join(', ')}`,
  );

  test('el autor no se autoaprueba y un revisor distinto aprueba desde la UI', async ({
    page,
    browser,
    request,
  }) => {
    const auth = await request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      headers: { apikey: process.env.E2E_SUPABASE_ANON_KEY!, 'Content-Type': 'application/json' },
      data: { email: users.author, password: fixturePassword },
    });
    expect(auth.ok(), await auth.text()).toBe(true);
    const authorToken = ((await auth.json()) as { access_token: string }).access_token;
    const run = Date.now();
    const chargeName = `E2E independencia admin ${run}`;
    const bankReference = `E2E-INDEPENDENT-${run}`;

    // The receivable is synthetic setup for the UI journey; the payment itself is created and
    // submitted through the administrator's browser session below.
    const receivable = await request.post(
      `${workerUrl}/v1/condominiums/${ids.condominium}/receivables`,
      {
        headers: { Authorization: `Bearer ${authorToken}` },
        data: {
          unitId: ids.unit,
          conceptId: ids.concept,
          description: chargeName,
          amount: '15.25',
          currencyCode: 'USD',
          issueDate: '2026-10-19',
        },
      },
    );
    expect(receivable.status(), await receivable.text()).toBe(201);

    await login(page, users.author);
    await page.goto('/app/payments');
    await page.getByRole('button', { name: 'Registrar pago' }).click();
    const capture = page.getByRole('dialog', { name: 'Registrar un pago' });
    await capture.getByRole('combobox').first().selectOption(ids.unit);
    await capture.getByRole('combobox').nth(1).selectOption('USD');
    await capture.getByLabel('Buscar cuota').fill(chargeName);
    await expect(
      capture.locator('.resident-payment-wizard__charges input[type="checkbox"]'),
    ).toHaveCount(1);
    await capture.getByText(chargeName, { exact: true }).click();
    await capture.getByRole('button', { name: 'Continuar' }).click();
    await capture.getByRole('button', { name: 'Continuar' }).click();
    await capture.getByRole('combobox').selectOption(ids.paymentMethod);
    await capture.getByLabel('Nombre del pagador').fill('Administrador E2E autor');
    await capture.getByLabel(/Referencia/).fill(bankReference);
    await capture.getByLabel('Seleccionar comprobante').setInputFiles({
      name: 'comprobante-independencia.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL3iwAAAABJRU5ErkJggg==',
        'base64',
      ),
    });
    await capture.getByRole('button', { name: 'Continuar' }).click();
    await capture.getByRole('button', { name: 'Enviar a revisión' }).click();
    await expect(page.getByText('Pago enviado a revisión.').first()).toBeVisible();

    await page.getByRole('tab', { name: 'Movimientos' }).click();
    await page.getByPlaceholder('Buscar pago…').fill(bankReference);
    const authorRow = page.locator('.payments-table tbody tr').filter({ hasText: bankReference });
    await expect(authorRow).toHaveCount(1);
    await authorRow.getByRole('button', { name: 'Revisar' }).click();
    const authorReview = page.getByRole('dialog', { name: 'Revisar pago' });
    await expect(authorReview.getByText('Requiere aprobación de otro revisor')).toBeVisible();
    await expect(authorReview.getByText('Este pago debe aprobarlo otro revisor.')).toBeVisible();
    await expect(authorReview.getByRole('button', { name: 'Aprobar pago' })).toHaveCount(0);
    await authorReview.getByRole('button', { name: 'Cerrar', exact: true }).click();

    const reviewerContext = await browser.newContext();
    const reviewerPage = await reviewerContext.newPage();
    try {
      await login(reviewerPage, users.reviewer);
      await reviewerPage.goto('/app/payments');
      await reviewerPage.getByRole('tab', { name: 'Revisión' }).click();
      const reviewQueue = reviewerPage.locator('#bandeja-revision');
      await reviewQueue.getByLabel('Buscar pago pendiente').fill(bankReference);
      const reviewerRow = reviewQueue
        .locator('.payments-review-table tbody tr')
        .filter({ hasText: bankReference });
      await expect(reviewerRow).toHaveCount(1);
      await reviewerRow.getByRole('button', { name: 'Revisar' }).click();
      const reviewerReview = reviewerPage.getByRole('dialog', { name: 'Revisar pago' });
      await expect(reviewerReview.getByRole('button', { name: 'Aprobar pago' })).toBeVisible();
      await reviewerReview.getByRole('button', { name: 'Aprobar pago' }).click();
      const confirmation = reviewerPage.getByRole('dialog', {
        name: 'Confirmar aprobación del pago',
      });
      await confirmation.getByRole('button', { name: 'Confirmar aprobación' }).click();
      await expect(
        reviewerPage.getByText('Pago aprobado, aplicado y registrado en tesorería.'),
      ).toBeVisible();

      await reviewerPage.getByRole('tab', { name: 'Movimientos' }).click();
      await reviewerPage.getByPlaceholder('Buscar pago…').fill(bankReference);
      const approvedRow = reviewerPage
        .locator('.payments-table tbody tr')
        .filter({ hasText: bankReference });
      await expect(approvedRow).toContainText('Aprobado');
      await approvedRow.getByRole('button', { name: 'Recibo' }).click();
      const receipt = reviewerPage.getByRole('dialog', { name: 'Recibo de pago' });
      await expect(receipt.getByText('Aprobado por', { exact: true })).toBeVisible();
      await expect(receipt.getByText('Habitta E2E reviewer', { exact: true })).toBeVisible();
      await expect(receipt.getByText('Habitta E2E administrator', { exact: true })).toBeVisible();
    } finally {
      await reviewerContext.close();
    }
  });
});
