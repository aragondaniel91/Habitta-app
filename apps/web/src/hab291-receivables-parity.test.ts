import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const drawers = source('./pages/ReceivablesDrawersImpl.tsx');
const drawerCss = source('./receivables-drawers.css');
const responsiveCss = source('./receivables-responsive.css');
const parityMatrix = source('../../../docs/frontend/form-parity-matrix.md');

describe('HAB-291 Receivables responsive and form-parity closure', () => {
  it('uses the shared Drawer behavior without a second Escape listener', () => {
    expect(drawers).toContain("import { Drawer as SharedDrawer } from '../components/Drawer'");
    expect(drawers).toContain('prefix="receivables"');
    expect(drawers).not.toContain("window.addEventListener('keydown'");
    expect(drawerCss).toContain('.receivables-drawer__body');
    expect(drawerCss).not.toContain('.receivables-drawer__content');
  });

  it('moves compatible secondary workflows onto the premium form contract', () => {
    expect(drawers).toContain('className="receivables-reverse-form ux-form"');
    expect(drawers).toContain('className="receivables-form ux-form"');
    expect(drawers).toContain('className="receivables-statement-workspace ux-form"');
    expect(drawers).toContain('className="receivables-opening-workspace ux-form"');
    expect(drawers).toContain('<FormGrid>');
    expect(drawers).toContain('<FormActions>');
    expect(drawerCss).not.toContain('receivables-form-grid');
    expect(drawerCss).not.toContain('.receivables-form input,');
    expect(responsiveCss).not.toContain('receivables-preview-actions');
    expect(responsiveCss).not.toContain('receivables-form-grid');
  });

  it('keeps concept, reversal and opening-balance financial payloads unchanged', () => {
    expect(drawers).toContain("code: String(values.get('code') ?? '')");
    expect(drawers).toContain("name: String(values.get('name') ?? '')");
    expect(drawers).toContain("category: String(values.get('category') ?? '')");
    expect(drawers).toContain('...(description ? { description } : {})');
    expect(drawers).toContain('...(defaultCurrencyCode ? { defaultCurrencyCode } : {})');
    expect(drawers).toContain('...(defaultAmount ? { defaultAmount } : {})');
    expect(drawers).toContain('/charge-concepts`');
    expect(drawers).toContain('/receivables/${selectedReceivable.id}/reverse`');
    expect(drawers).toContain('JSON.stringify({ reason: reverseReason.trim() })');
    expect(drawers).toContain('const idempotencyKey = crypto.randomUUID()');
    expect(drawers).toContain('/opening-balances/preview`');
    expect(drawers).toContain('/opening-balances/commit`');
    expect(drawers).toContain('idempotencyKey: openingPreview.idempotencyKey');
    expect(drawers).toContain('filename: openingPreview.filename');
    expect(drawers).toContain('parseOpeningBalancesCsv(await openingFile.text())');
  });

  it('keeps responsive behavior intentional down to narrow phones', () => {
    expect(responsiveCss).toContain('@media (max-width: 1280px)');
    expect(responsiveCss).toContain('@media (max-width: 820px)');
    expect(responsiveCss).toContain('@media (max-width: 680px)');
    expect(responsiveCss).toContain('@media (max-width: 460px)');
    expect(responsiveCss).toContain('.receivables-metrics-grid');
    expect(responsiveCss).toContain('.receivables-tools-menu');
    expect(responsiveCss).toContain('grid-template-columns: 1fr');
  });

  it('does not introduce native alert, confirm or prompt dialogs', () => {
    expect(drawers).not.toContain('window.alert');
    expect(drawers).not.toContain('window.confirm');
    expect(drawers).not.toContain('window.prompt');
  });

  it('marks Receivables compliant only after the audited migration', () => {
    expect(parityMatrix).toContain('| Cuentas por cobrar |');
    expect(parityMatrix).toContain('| Cuentas por cobrar | Receivables');
    expect(parityMatrix).toContain('| compliant | Sí | Sí | Sí | Sí |');
    expect(parityMatrix).toContain('KPI 4→2→1');
  });
});
