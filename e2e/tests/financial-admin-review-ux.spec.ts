import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

test.describe('Pagos administrador — prioridad y revisión central', () => {
  test.skip(
    !process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD,
    'Solo contra el laboratorio autenticado y aislado',
  );

  test('prioriza pendientes, filtra por estado y permite revisión central sin modificar saldos', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.getByLabel('Correo electrónico').fill(process.env.E2E_ADMIN_EMAIL!);
    await page
      .locator('input[type="password"][autocomplete="current-password"]')
      .fill(process.env.E2E_ADMIN_PASSWORD!);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.waitForURL(/\/app\/dashboard/);
    await page.goto('/app/payments');

    await expect(page.getByRole('heading', { name: 'Pagos y comprobantes' })).toBeVisible();
    await page.getByRole('button', { name: 'Registrar pago' }).click();
    const createDialog = page.getByRole('dialog', { name: 'Registrar un pago' });
    await expect(createDialog).toBeVisible();
    await expect(createDialog.getByText('Unidad y cargos')).toBeVisible();
    await expect(createDialog.getByText('Monto', { exact: true })).toBeVisible();
    await expect(createDialog.getByText('Método', { exact: true })).toBeVisible();
    await expect(createDialog.getByText('Confirmar', { exact: true })).toBeVisible();
    await expect(createDialog.getByLabel('Unidad del pago')).toBeVisible();
    await createDialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(createDialog).toHaveCount(0);
    await expect(page.getByText('Moneda de los pagos')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Métodos', exact: true })).toHaveCount(0);
    const review = page.locator('#bandeja-revision');
    await expect(review).toBeVisible();
    const overview = page.locator('.payments-metrics-grid');
    const metricBeforeReview = await overview.evaluate(
      (node, reviewSelector) =>
        !!(
          node.compareDocumentPosition(document.querySelector(reviewSelector)!) &
          Node.DOCUMENT_POSITION_FOLLOWING
        ),
      '#bandeja-revision',
    );
    expect(metricBeforeReview).toBe(true);
    await expect(overview.getByRole('button')).toHaveCount(4);

    await page.getByRole('tab', { name: 'Movimientos' }).click();
    await expect(page.getByRole('tabpanel', { name: 'Movimientos' })).toBeVisible();
    const filters = page.locator('.payments-quick-filters');
    await expect(filters.getByRole('button')).toHaveCount(5);
    await filters.getByRole('button', { name: 'Por revisar' }).click();
    await expect(filters.getByRole('button', { name: 'Por revisar' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await filters.getByRole('button', { name: 'Aprobados' }).click();
    await expect(filters.getByRole('button', { name: 'Aprobados' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await filters.getByRole('button', { name: 'Todos' }).click();
    await expect(filters.getByRole('button', { name: 'Todos' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.getByRole('tab', { name: 'Métodos de pago' }).click();
    await expect(page.getByRole('tabpanel', { name: 'Métodos de pago' })).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByText('Métodos configurados')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Configurar métodos' })).toBeVisible();

    await overview.getByRole('button', { name: /Pagos aprobados/ }).click();
    await expect(page.getByRole('tab', { name: 'Movimientos' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(overview.getByRole('button', { name: /Pagos aprobados/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await overview.getByRole('button', { name: /Pagos reversados/ }).click();
    await expect(overview.getByRole('button', { name: /Pagos reversados/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await overview.getByRole('button', { name: /Mis registros por completar/ }).click();
    await expect(page.getByRole('tab', { name: /Revisión/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(
      page.getByText('No tienes capturas propias pendientes de completar o corregir.'),
    ).toBeVisible();
    await overview.getByRole('button', { name: /Por revisar/ }).click();
    await expect(review).toBeVisible();

    const evidence = process.env.E2E_VISUAL_EVIDENCE_DIR;
    if (evidence) {
      mkdirSync(evidence, { recursive: true });
      await page.screenshot({ path: join(evidence, 'admin-payments-desktop.png'), fullPage: true });
    }

    await page.getByRole('tab', { name: /Revisión/ }).click();
    await expect(page.getByRole('tabpanel', { name: /Revisión/ })).toBeVisible();
    const queue = review.locator('.payments-review-table tbody tr');
    const available = await queue.count();
    expect(available).toBeGreaterThan(0);
    expect(available).toBeLessThanOrEqual(10);
    const pager = review.locator('.payments-review-pagination');
    await expect(pager).toContainText('Mostrando 1–');
    await expect(pager).toContainText('de ');
    await pager.getByRole('button', { name: 'Siguiente' }).click();
    await expect(pager).toContainText('Mostrando 11–');
    await pager.getByRole('button', { name: 'Anterior' }).click();
    await expect(pager).toContainText('Mostrando 1–');
    await review.getByLabel('Buscar pago pendiente').fill('no-existe-pago-zzzzz');
    await expect(
      review.getByText('No hay pagos pendientes que coincidan con la búsqueda.'),
    ).toBeVisible();
    await review.getByLabel('Buscar pago pendiente').fill('');
    await queue.first().getByRole('button', { name: 'Revisar' }).click();
    const dialog = page.getByRole('dialog', { name: 'Revisar pago' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveClass(/payments-drawer--centered/);
    await expect(dialog.getByText('Propuesta del residente')).toBeVisible();
    const submittedEvidence = dialog.getByRole('region', { name: 'Datos y comprobante del pago' });
    await expect(submittedEvidence).toBeVisible();
    await expect(submittedEvidence.getByText('Comprobante adjunto')).toBeVisible();
    await expect(submittedEvidence.getByText('Referencia del pago')).toBeVisible();
    await expect(submittedEvidence.getByText('Comentarios del pagador')).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Solicitar corrección/ })).toBeVisible();
    if (evidence) {
      await page.screenshot({ path: join(evidence, 'admin-review-desktop.png'), fullPage: true });
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 2)).toBe(true);
    if (evidence) {
      await page.screenshot({ path: join(evidence, 'admin-review-mobile.png'), fullPage: true });
    }
    await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  });
});
