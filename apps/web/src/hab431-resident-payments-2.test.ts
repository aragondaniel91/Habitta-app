import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const page = source('./pages/ResidentPaymentsPage.tsx');
const view = source('./pages/ResidentPaymentsView.tsx');
const css = source('./resident-payments.css');
const historyPolish = source('./resident-payments-history-polish.css');

describe('HAB-431 resident payments approved HQ experience', () => {
  it('keeps one primary registration action connected to the financial summary', () => {
    expect(view.match(/onClick=\{onRegisterPayment\}/g) ?? []).toHaveLength(1);
    expect(view).toContain('resident-payments__account-action');
    expect(view).toContain('Registro no disponible');
    expect(view).toContain('Registrar pago');
    expect(view).not.toContain('actions={');
    expect(view).not.toContain('Comenzar registro');
    expect(view).not.toContain('resident-payments__hero-grid');
    expect(view).not.toContain('resident-payments__metrics');
    expect(page).not.toContain('resident-payments__hero-grid');
  });

  it('moves unit selection into a clear context bar instead of the financial card', () => {
    const context = view.indexOf('resident-payments__context-shell');
    const account = view.indexOf('resident-payments__account-shell');
    expect(context).toBeGreaterThan(-1);
    expect(account).toBeGreaterThan(context);
    expect(view).toContain('Condominio seleccionado');
    expect(view).toContain('Estoy viendo');
    expect(view).toContain('Unidad que deseas consultar');
    expect(view).toContain('Todas mis unidades');
    expect(view).toContain('resident-payments__unit-select');
  });

  it('only enables registration for the currency currently on screen', () => {
    expect(view).toContain('const activeMethods = data.methods.filter(');
    expect(view).toContain('method.is_active && method.currency_code === currency');
    expect(view).toContain('const canRegister = canRegisterPayment && activeMethods.length > 0;');
    expect(view).toContain(
      'Se habilitará cuando la administración publique un método para esta moneda.',
    );
    expect(view).toContain('disabled={!canRegister}');
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

  it('integrates methods into the account surface and gives history an intentional empty state', () => {
    const methods = view.indexOf('resident-payments__methods-compact');
    const history = view.indexOf('resident-payments__history-panel');
    expect(methods).toBeGreaterThan(-1);
    expect(history).toBeGreaterThan(methods);
    expect(view).toContain('resident-payments__method-empty');
    expect(view).toContain('{currency} todavía no tiene un método de pago');
    expect(view).not.toContain("'Sin métodos'");
    expect(view).toContain('resident-payments__history-illustration');
    expect(view).toContain('resident-payments__history-help');
    expect(view).toContain('Más información sobre pagos');
    expect(view).not.toContain('resident-payments__methods-strip');
    expect(view).not.toContain('resident-payments__content-grid');
    expect(view).not.toContain('<EmptyState');
  });

  it('uses HQ tokens and large touch targets across desktop, tablet, and mobile', () => {
    const historyEmpty =
      css.match(/\.resident-payments__history-empty\s*\{([\s\S]*?)\}/)?.[1] ?? '';
    const historyIllustration =
      css.match(/\.resident-payments__history-illustration\s*\{([\s\S]*?)\}/)?.[1] ?? '';

    expect(css).toContain('var(--hq-space-5)');
    expect(css).toContain('var(--hq-control-standard)');
    expect(css).toContain('var(--hq-touch-target)');
    expect(css).toContain('.resident-payments__context-shell');
    expect(css).toContain('.resident-payments__account-main');
    expect(css).toContain('.resident-payments__methods-compact');
    expect(historyEmpty).toContain('max-width: 660px');
    expect(historyEmpty).not.toContain('max-width: 760px');
    expect(historyIllustration).toContain('min-height: 112px');
    expect(historyIllustration).not.toContain('min-height: 150px');
    expect(css).not.toContain('min-height: 240px');
    expect(css).not.toContain('--hq-success-soft');
    expect(css).toContain('@media (max-width: 1100px)');
    expect(css).toContain('@media (max-width: 760px)');
    expect(css).toContain('@media (max-width: 600px)');
    expect(css).toContain('@media (max-width: 390px)');
  });

  it('keeps the history typography aligned and gives header and footer deliberate spacing', () => {
    expect(historyPolish).toContain(
      'resident-payments__history-panel .resident-payments__section-heading',
    );
    expect(historyPolish).toContain('align-items: center');
    expect(historyPolish).toContain(
      'padding: var(--hq-space-5) var(--hq-space-6) var(--hq-space-4)',
    );
    expect(historyPolish).toContain('resident-payments__history-meta');
    expect(historyPolish).toContain('display: flex');
    expect(historyPolish).toContain('resident-payments__history-empty-copy');
    expect(historyPolish).toContain('line-height: 1.6');
    expect(historyPolish).toContain('> .financial-pagination');
    expect(historyPolish).toContain('background: var(--hq-surface-subtle)');
    expect(historyPolish).toContain('@media (max-width: 600px)');
    expect(historyPolish).not.toContain('min-height: 240px');
  });
});
