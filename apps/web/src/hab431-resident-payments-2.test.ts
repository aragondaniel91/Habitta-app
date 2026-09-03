import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const page = source('./pages/ResidentPaymentsPage.tsx');
const view = source('./pages/ResidentPaymentsView.tsx');
const css = source('./resident-payments.css');

describe('HAB-431 resident payments 2.0 keeps the resident experience compact and intentional', () => {
  it('has one primary registration action connected to the account summary', () => {
    expect(view.match(/onClick=\{onRegisterPayment\}/g) ?? []).toHaveLength(1);
    expect(view).toContain('resident-payments__account-action');
    expect(view).toContain('Registrar pago');
    expect(view).not.toContain('actions={');
    expect(view).not.toContain('Comenzar registro');
    expect(view).not.toContain('resident-payments__hero-grid');
    expect(view).not.toContain('resident-payments__metrics');
    expect(page).not.toContain('resident-payments__hero-grid');
  });

  it('only enables registration for the currency currently on screen', () => {
    expect(view).toContain('const activeMethods = data.methods.filter(');
    expect(view).toContain('method.is_active && method.currency_code === currency');
    expect(view).toContain('const canRegister = canRegisterPayment && activeMethods.length > 0;');
    expect(view).toContain('No hay un método activo para ${currency}.');
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

  it('makes history full-width and payment methods a compact secondary strip', () => {
    const methods = view.indexOf('resident-payments__methods-strip');
    const history = view.indexOf('resident-payments__history-panel');
    expect(methods).toBeGreaterThan(-1);
    expect(history).toBeGreaterThan(methods);
    expect(view).toContain('resident-payments__method-empty');
    expect(view).toContain('resident-payments__history-empty');
    expect(view).not.toContain('resident-payments__content-grid');
    expect(view).not.toContain('resident-payments__methods-panel');
    expect(view).not.toContain('<EmptyState');
  });

  it('consumes HQ tokens and defines compact responsive behavior', () => {
    expect(css).toContain('var(--hq-space-5)');
    expect(css).toContain('var(--hq-control-standard)');
    expect(css).toContain('var(--hq-touch-target)');
    expect(css).toContain(".resident-payments__status[data-status='action']");
    expect(css).toContain('.resident-payments__account-main');
    expect(css).toContain('.resident-payments__methods-strip');
    expect(css).toContain('.resident-payments__history-empty');
    expect(css).not.toContain('min-height: 240px');
    expect(css).toContain('@media (max-width: 900px)');
    expect(css).toContain('@media (max-width: 600px)');
    expect(css).toContain('@media (max-width: 390px)');
  });
});
