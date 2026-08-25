import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const pageUrl = new URL('./pages/PaymentsPage.tsx', import.meta.url);
const drawersUrl = new URL('./pages/PaymentsDrawers.tsx', import.meta.url);

async function source(url: URL) {
  return readFile(url, 'utf8');
}

describe('HAB-317 live approved-payment reversal', () => {
  it('keeps approved payments on the receipt surface and exposes reversal there', async () => {
    const [page, drawers] = await Promise.all([source(pageUrl), source(drawersUrl)]);

    expect(page).toContain("if (['approved', 'reversed'].includes(payment.status))");
    expect(page).toContain("setDrawer({ type: 'receipt', payment, receipt })");
    expect(drawers).toContain("import { ConfirmDialog } from '../components/Dialog'");
    expect(drawers).toContain("payment.status === 'approved' && manage");
    expect(drawers).toContain('Reversar pago aprobado');
    expect(drawers).toContain(
      `/v1/condominiums/\${condominiumId}/payments/\${payment.id}/reverse`,
    );
  });

  it('requires a reason, shared destructive confirmation and refreshes after success', async () => {
    const drawers = await source(drawersUrl);

    expect(drawers).toContain('reason.trim()');
    expect(drawers).toContain('<ConfirmDialog');
    expect(drawers).toContain('destructive');
    expect(drawers).toContain('confirmLabel="Reversar pago"');
    expect(drawers).toContain("body: JSON.stringify({ reason: reason.trim() })");
    expect(drawers).toContain("await onChanged('Pago reversado.')");
    expect(drawers).not.toContain('window.confirm(');
  });
});
