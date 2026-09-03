import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const page = source('./pages/ResidentPaymentsPage.tsx');
const view = source('./pages/ResidentPaymentsView.tsx');
const css = source('./resident-payments.css');

describe('HAB-431 resident payments 2.0 keeps the resident experience compact and intentional', () => {
  it('has one primary registration action instead of competing hero CTAs', () => {
    expect(view.match(/onClick=\{onRegisterPayment\}/g) ?? []).toHaveLength(1);
    expect(view).toContain('Registrar pago');
    expect(view).not.toContain('Comenzar registro');
    expect(view).not.toContain('resident-payments__hero-grid');
    expect(view).not.toContain('resident-payments__metrics');
    expect(page).not.toContain('resident-payments__hero-grid');
  });

  it('shows follow-up status only when there is something real to follow', () => {
    expect(view).toContain('actionRequired > 0 || inValidation > 0');
    expect(view).toContain('actionRequired > 0 ?');
    expect(view).toContain('inValidation > 0 ?');
    expect(view).toContain('Pagos que necesitan seguimiento');
  });

  it('keeps the ledger and currency as the source of the resident balance', () => {
    expect(view).toContain('const outstanding = financialRows');
    expect(view).toContain('.filter((row) => row.currency_code === currency)');
    expect(view).toContain('Number(row.net_outstanding ?? 0)');
    expect(view).not.toContain('receivable.outstanding_amount');
    expect(view).toContain('Registrar o enviar un comprobante no reduce el saldo por sí solo.');
    expect(view).toContain('saldo hasta que el pago sea aprobado y aplicado de forma trazable.');
  });

  it('keeps readable multi-unit context without rendering a UUID as copy', () => {
    expect(view).toContain("unitOptions.length > 1\n      ? 'Todas mis unidades'");
    expect(view).toContain('{unit.label}');
    expect(view).toContain('residentUnitLabel(unitLabels, selectedUnitId)');
    expect(view).not.toMatch(/>\s*\{unit\.id\}\s*</);
  });

  it('makes history primary and payment methods secondary', () => {
    const history = view.indexOf('resident-payments__history-panel');
    const methods = view.indexOf('resident-payments__methods-panel');
    expect(history).toBeGreaterThan(-1);
    expect(methods).toBeGreaterThan(history);
    expect(view).toContain('resident-payments__method-empty');
    expect(view).not.toContain("actionLabel={canRegister ? 'Registrar mi primer pago'");
  });

  it('consumes HQ tokens and defines compact responsive behavior', () => {
    expect(css).toContain('var(--hq-space-5)');
    expect(css).toContain('var(--hq-control-standard)');
    expect(css).toContain('var(--hq-touch-target)');
    expect(css).toContain(".resident-payments__status[data-status='action']");
    expect(css).toContain('.resident-payments__history-panel .empty-state');
    expect(css).not.toContain('min-height: 240px');
    expect(css).toContain('@media (max-width: 900px)');
    expect(css).toContain('@media (max-width: 600px)');
    expect(css).toContain('@media (max-width: 390px)');
  });
});
