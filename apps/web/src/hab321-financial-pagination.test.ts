import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

describe('HAB-321 live financial pagination', () => {
  it('pages the live payments history and keeps complete reference data explicit', async () => {
    // Payment pagination lives with the administrative history after the HAB-417 split. The
    // resident surface presents its own unit-scoped history and does not inherit this contract.
    const page = await read('./pages/AdminPaymentsPage.tsx');

    expect(page).toContain('const PAYMENTS_PAGE_SIZE = 50');
    expect(page).toContain('PaginatedResponse<Payment>');
    expect(page).toContain('data.paymentsPage.page + 1');
    expect(page).toContain('<FinancialPagination');
    expect(page).toContain('collectAllPages((page) =>');
    expect(page).toContain('/payment-methods');
    expect(page).toContain('/receivables');
    expect(page).toContain('data.paymentsPage.total} pagos cargados.');
    expect(page).toContain('/payments/summary');
    expect(page).toContain('summary?.approved_amount');
    expect(page).toContain('summary?.reversed_amount');
    expect(page).toContain('summary?.pending_review_count');
    expect(page).toContain('detail: data.reviewQueueAvailable ? pendingReviewCount : null');
    expect(page).not.toContain(
      'value={data.reviewQueueAvailable ? String(reviewQueueForCurrency.length)',
    );
    expect(page).not.toContain('getPaymentSummary(data.payments');
    expect(page).not.toContain(
      'apiRequest<Payment[]>(`/v1/condominiums/${condominiumId}/payments`, session)',
    );
  });

  it('pages the live receivables history without weakening server aggregate totals', async () => {
    const page = await read('./pages/ReceivablesPage.tsx');

    expect(page).toContain('const RECEIVABLES_PAGE_SIZE = 50');
    expect(page).toContain('PaginatedResponse<ReceivableItem>');
    expect(page).toContain('data.itemsPage.page + 1');
    expect(page).toContain('<FinancialPagination');
    expect(page).toContain('/receivables/summary');
    expect(page).toContain('/receivables/aging');
    expect(page).toContain('Los saldos y la antigüedad usan los agregados completos del servidor.');
    expect(page).toContain('collectAllPages((page) =>');
    expect(page).toContain('/charge-concepts');
  });

  it('keeps a shared responsive load-more control instead of hiding pagination', async () => {
    const component = await read('./components/FinancialPagination.tsx');
    const css = await read('./components/financial-pagination.css');

    expect(component).toContain('Mostrando <strong>{loaded}</strong> de <strong>{total}</strong>');
    expect(component).toContain("loading ? 'Cargando…' : 'Cargar más'");
    expect(component).toContain('Historial cargado por completo.');
    expect(css).toContain('@media (max-width: 560px)');
    expect(css).toContain('flex-direction: column');
  });
});
