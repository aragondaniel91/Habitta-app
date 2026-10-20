import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const required = ['E2E_SUPABASE_URL', 'E2E_SUPABASE_ANON_KEY', 'E2E_FIXTURE_PASSWORD'];
const missing = required.filter((name) => !process.env[name]);
const authUrl = process.env.E2E_SUPABASE_URL ?? '';
const key = process.env.E2E_SUPABASE_ANON_KEY ?? '';
const password = process.env.E2E_FIXTURE_PASSWORD ?? '';
const API = process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:8787';
const condominium = '22222222-2222-4222-8222-222222222221';
const unit = '33333333-3333-4333-8333-333333333331';
const concept = '66666666-6666-4666-8666-666666666661';

test.describe('Asistente de pagos de residente — navegador autenticado', () => {
  test.skip(missing.length > 0, 'Requiere una instancia local aislada y fixture autenticado');

  test('crea una propuesta con cargos reales, la envía y abre el detalle sin acciones de aprobación', async ({
    page,
    request,
  }) => {
    const admin = await request.post(`${authUrl}/auth/v1/token?grant_type=password`, {
      headers: { apikey: key },
      data: { email: 'habitta-e2e-admin@example.invalid', password },
    });
    expect(admin.ok(), await admin.text()).toBe(true);
    const adminToken = ((await admin.json()) as { access_token: string }).access_token;

    // Seed through the same API an administrator uses, rather than inserting fake UI data.
    const unique = Date.now();
    const created = await request.post(`${API}/v1/condominiums/${condominium}/receivables`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        unitId: unit,
        conceptId: concept,
        description: `Cuota de prueba del asistente ${unique}`,
        amount: '42.01',
        currencyCode: 'USD',
        issueDate: '2026-10-19',
      },
    });
    expect(created.status(), await created.text()).toBe(201);
    const charge = ((await created.json()) as { item: { id: string } }).item;
    const second = await request.post(`${API}/v1/condominiums/${condominium}/receivables`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        unitId: unit,
        conceptId: concept,
        description: `Fondo de reserva de prueba ${unique}`,
        amount: '80.00',
        currencyCode: 'USD',
        issueDate: '2026-10-19',
      },
    });
    expect(second.status(), await second.text()).toBe(201);
    const secondCharge = ((await second.json()) as { item: { id: string } }).item;

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByLabel('Correo electrónico').fill('habitta-e2e-payer@example.invalid');
    await page.locator('input[type="password"][autocomplete="current-password"]').fill(password);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.waitForURL(/\/app\/dashboard/);
    await page.goto('/app/payments');
    await expect(page.getByRole('heading', { name: 'Mis pagos' })).toBeVisible();

    await page.getByRole('button', { name: 'Registrar pago' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toHaveAccessibleName('Registrar un pago');
    await expect(dialog.getByText('Unidad y cargos')).toBeVisible();

    const unitSelect = dialog.getByRole('combobox').first();
    await unitSelect.selectOption(unit);
    const currency = dialog.getByRole('combobox').nth(1);
    await currency.selectOption('USD');
    await dialog.getByLabel('Tipo de cargo').selectOption('regular_dues');
    await dialog.getByLabel('Concepto').selectOption(concept);
    await dialog.getByLabel('Buscar cuota').fill(`Cuota de prueba del asistente ${unique}`);
    if (process.env.E2E_VISUAL_EVIDENCE_DIR) {
      mkdirSync(process.env.E2E_VISUAL_EVIDENCE_DIR, { recursive: true });
      await page.screenshot({
        path: join(process.env.E2E_VISUAL_EVIDENCE_DIR, 'resident-concept-filters-mobile.png'),
        fullPage: true,
      });
    }
    await expect(
      dialog.locator('.resident-payment-wizard__charges input[type="checkbox"]'),
    ).toHaveCount(1);
    await dialog.getByText(`Cuota de prueba del asistente ${unique}`).click();
    await dialog.getByLabel('Buscar cuota').fill('');
    await dialog.getByText(`Fondo de reserva de prueba ${unique}`).click();
    await dialog.getByRole('button', { name: 'Continuar' }).click();

    await expect(dialog.getByText('¿Cuánto deseas pagar?')).toBeVisible();
    await dialog.getByLabel('Personalizar por cuota').check();
    await dialog
      .getByLabel(`Abono para Cuota de prueba del asistente ${unique} (USD)`)
      .fill('42.01');
    await dialog.getByLabel(`Abono para Fondo de reserva de prueba ${unique} (USD)`).fill('40.00');
    await expect(dialog.getByText('Total: 82.01 USD')).toBeVisible();
    await expect(dialog.locator('.resident-payment-wizard__per-charge-row')).toHaveCount(2);
    const evidenceDir = process.env.E2E_VISUAL_EVIDENCE_DIR;
    if (evidenceDir) mkdirSync(evidenceDir, { recursive: true });
    const screenshotPath = (name: string) =>
      evidenceDir ? join(evidenceDir, name) : join('test-results', name);
    await page.screenshot({
      path: screenshotPath('resident-per-charge-mobile.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(dialog.getByRole('heading', { name: 'Define el monto por cuota' })).toBeVisible();
    await page.screenshot({
      path: screenshotPath('resident-per-charge-desktop.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });

    // Fractional cents in a specific charge cannot silently round into an accepted amount.
    await dialog.getByLabel(`Abono para Fondo de reserva de prueba ${unique} (USD)`).fill('40.001');
    await expect(dialog.getByText(/máximo dos decimales/).first()).toBeVisible();
    await dialog.getByLabel(`Abono para Fondo de reserva de prueba ${unique} (USD)`).fill('40.00');
    await dialog.getByRole('button', { name: 'Continuar' }).click();

    await dialog.getByRole('combobox').selectOption('77777777-7777-4777-8777-777777777771');
    await dialog.getByLabel('Nombre del pagador').fill('Residente QA');
    await dialog.getByLabel(/Referencia/).fill(`E2E-WIZARD-${unique}`);
    await dialog.locator('input[type="file"]').setInputFiles({
      name: 'comprobante-piloto.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL3iwAAAABJRU5ErkJggg==',
        'base64',
      ),
    });
    await expect(
      dialog.getByText('Comprobante seleccionado: comprobante-piloto.png'),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Continuar' }).click();

    await expect(dialog.getByText('Confirma tu propuesta')).toBeVisible();
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: screenshotPath('resident-wizard-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 800 });
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: screenshotPath('resident-wizard-desktop.png'), fullPage: true });
    const createPaymentResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith('/payments') &&
        response.request().method() === 'POST' &&
        response.status() === 201,
    );
    await dialog.getByRole('button', { name: 'Enviar a revisión' }).click();
    const createdPayment = (await (await createPaymentResponse).json()) as { id: string };
    expect(createdPayment.id).toBeTruthy();

    await expect(page.getByText(/Pago enviado a revisión/)).toBeVisible();
    const submittedRow = page
      .locator('.resident-payments__history article')
      .filter({ hasText: `E2E-WIZARD-${unique}` });
    await expect(submittedRow).toHaveCount(1);
    await expect(submittedRow.getByRole('button', { name: 'Ver detalle' })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await submittedRow.getByRole('button', { name: 'Ver detalle' }).click();
    const detailDialog = page.getByRole('dialog', { name: 'Detalle del pago' });
    await expect(detailDialog).toBeVisible();
    await expect(detailDialog).toHaveClass(/payments-drawer--centered/);
    await expect(detailDialog.locator('.payments-detail__proposal tbody tr')).toHaveCount(2);
    await expect(detailDialog.getByText('Total propuesto:')).toBeVisible();
    expect(await detailDialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(
      true,
    );
    await page.screenshot({ path: screenshotPath('resident-detail-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(detailDialog.getByRole('columnheader', { name: 'Cuota' })).toBeVisible();
    await expect(detailDialog.getByRole('columnheader', { name: 'Propuesto' })).toBeVisible();
    await page.screenshot({ path: screenshotPath('resident-detail-desktop.png'), fullPage: true });
    await expect(page.getByRole('button', { name: /Aprobar pago|Rechazar pago/ })).toHaveCount(0);
    await detailDialog.getByLabel('Nuevo comprobante').setInputFiles({
      name: 'comprobante-corregido.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL3iwAAAABJRU5ErkJggg==',
        'base64',
      ),
    });
    await detailDialog.getByRole('button', { name: 'Guardar nuevo comprobante' }).click();
    await expect(detailDialog.getByText(/Se conservó la versión anterior/)).toBeVisible();
    await expect(detailDialog.getByText(/se reemplazó 1 vez/)).toBeVisible();
    if (process.env.E2E_VISUAL_EVIDENCE_DIR) {
      await page.screenshot({
        path: join(process.env.E2E_VISUAL_EVIDENCE_DIR, 'resident-proof-replaced-desktop.png'),
        fullPage: true,
      });
    }
    const payerSession = await request.post(`${authUrl}/auth/v1/token?grant_type=password`, {
      headers: { apikey: key },
      data: { email: 'habitta-e2e-payer@example.invalid', password },
    });
    expect(payerSession.ok()).toBe(true);
    const payerToken = ((await payerSession.json()) as { access_token: string }).access_token;
    const savedProof = await request.get(
      `${API}/v1/condominiums/${condominium}/payments/${createdPayment.id}/proof`,
      {
        headers: { Authorization: `Bearer ${payerToken}` },
      },
    );
    expect(savedProof.status(), await savedProof.text()).toBe(200);
    expect(savedProof.headers()['content-type']).toContain('image/png');
    await expect
      .poll(
        async () => {
          const result = await request.get(
            `${API}/v1/condominiums/${condominium}/payments/${createdPayment.id}/proof/history`,
            {
              headers: { Authorization: `Bearer ${payerToken}` },
            },
          );
          if (!result.ok()) return `HTTP ${result.status()}`;
          const versions = (await result.json()) as Array<{
            original_filename: string;
            superseded_at: string | null;
          }>;
          if (versions.length !== 2) return `versions=${versions.length}`;
          return versions.some(
            (version) =>
              version.original_filename === 'comprobante-piloto.png' &&
              version.superseded_at !== null,
          ) &&
            versions.some(
              (version) =>
                version.original_filename === 'comprobante-corregido.png' &&
                version.superseded_at === null,
            )
            ? 'versioned'
            : 'metadata-mismatch';
        },
        { timeout: 10000 },
      )
      .toBe('versioned');
    const deniedProofHistory = await request.get(
      `${API}/v1/condominiums/${condominium}/payments/${createdPayment.id}/proof/history`,
    );
    expect(deniedProofHistory.status()).toBe(401);
    const storedIntent = await request.get(
      `${API}/v1/condominiums/${condominium}/payments/${createdPayment.id}/allocation-intent`,
      { headers: { Authorization: `Bearer ${payerToken}` } },
    );
    expect(storedIntent.ok(), await storedIntent.text()).toBe(true);
    const proposalData = (await storedIntent.json()) as {
      proposals: Array<{ receivable_item_id: string; payment_amount: string }>;
    };
    const amountsByCharge = new Map(
      proposalData.proposals.map((item) => [item.receivable_item_id, item.payment_amount]),
    );
    expect(amountsByCharge.size).toBe(2);
    expect(amountsByCharge.get(charge.id)).toBe('42.01');
    expect(amountsByCharge.get(secondCharge.id)).toBe('40.00');

    // The draft proposal and submitted payment must never mutate the ledger.
    const outstanding = await request.get(
      `${API}/v1/condominiums/${condominium}/receivables/${charge.id}`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    expect(outstanding.ok(), await outstanding.text()).toBe(true);
    const rows = (await outstanding.json()) as { outstanding_amount: string }[];
    expect(Number(rows[0]?.outstanding_amount)).toBe(42.01);
    const secondBalance = await request.get(
      `${API}/v1/condominiums/${condominium}/receivables/${secondCharge.id}`,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      },
    );
    expect(secondBalance.ok()).toBe(true);
    const secondRows = (await secondBalance.json()) as { outstanding_amount: string }[];
    expect(Number(secondRows[0]?.outstanding_amount)).toBe(80);
  });

  test('trata pagos sin comprobante como estado vacío y mantiene protegida su lectura', async ({
    request,
  }) => {
    const authResponse = await request.post(`${authUrl}/auth/v1/token?grant_type=password`, {
      headers: { apikey: key },
      data: { email: 'habitta-e2e-payer@example.invalid', password },
    });
    expect(authResponse.ok()).toBe(true);
    const token = ((await authResponse.json()) as { access_token: string }).access_token;
    const created = await request.post(`${API}/v1/condominiums/${condominium}/payments`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        unitId: unit,
        paymentMethodId: '77777777-7777-4777-8777-777777777771',
        paymentDate: '2026-10-19',
        originalAmount: '0.01',
        originalCurrencyCode: 'USD',
        payerName: 'Pago sin comprobante',
        reference: 'E2E-SIN-COMPROBANTE',
        idempotencyKey: `e2e-no-proof-${Date.now()}`,
      },
    });
    expect(created.status(), await created.text()).toBe(201);
    const draft = (await created.json()) as { id: string };
    const proofUrl = `${API}/v1/condominiums/${condominium}/payments/${draft.id}/proof`;
    const noProof = await request.get(proofUrl, { headers: { Authorization: `Bearer ${token}` } });
    expect(noProof.status(), await noProof.text()).toBe(204);
    expect(await noProof.text()).toBe('');
    const unauthorized = await request.get(proofUrl);
    expect(unauthorized.status()).toBe(401);
  });
});
