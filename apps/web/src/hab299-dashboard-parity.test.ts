import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(new URL('./pages/AdministrativeDashboard.tsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('./dashboard.css', import.meta.url), 'utf8');
const mobileCssSource = readFileSync(new URL('./dashboard-mobile.css', import.meta.url), 'utf8');

describe('HAB-299 Administrative Dashboard premium parity', () => {
  it('keeps the shared PageHeader and intentional live-data status', () => {
    expect(pageSource).toContain("import { PageHeader } from '../components/PageHeader'");
    expect(pageSource).toContain('className="dashboard-header-status"');
    expect(cssSource).toContain('.dashboard-header-status {');
    expect(cssSource).not.toContain('.dashboard-overview-heading');
    expect(mobileCssSource).not.toContain('.dashboard-overview-heading');
  });

  it('keeps the Dashboard topology neutral instead of assuming towers', () => {
    expect(pageSource).not.toContain('DashboardBuilding');
    expect(pageSource).not.toContain('/buildings');
    expect(pageSource).not.toContain('data.buildings');
    expect(pageSource).not.toContain('Torres');
    expect(pageSource).not.toContain("'torres'");
    expect(pageSource).toContain('unidad registrada');
    expect(pageSource).toContain('Personas activas');
    expect(cssSource).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
  });

  it('preserves financial sources and independent-currency behavior', () => {
    expect(pageSource).toContain('/receivables/summary');
    expect(pageSource).toContain('/receivables/aging');
    expect(pageSource).toContain('/receivables`');
    expect(pageSource).toContain('/payments`');
    expect(pageSource).toContain('getDashboardCurrencies(');
    expect(pageSource).toContain('buildMonthlyFinancialSeries(');
    expect(pageSource).toContain('sin mezclar monedas');
    expect(pageSource).toContain('No se muestran valores simulados.');
  });

  it('preserves review-queue authorization degradation', () => {
    expect(pageSource).toContain('/payments/review-queue');
    expect(pageSource).toContain('requestError.status === 403');
    expect(pageSource).toContain('available: false');
    expect(pageSource).toContain('Bandeja de pagos restringida');
  });

  it('keeps currency controls touch friendly and responsive', () => {
    expect(cssSource).toContain('.dashboard-currency-tabs button {');
    expect(cssSource).toContain('min-height: 44px;');
    expect(cssSource).toContain('@media (max-width: 1280px)');
    expect(cssSource).toContain('@media (max-width: 820px)');
    expect(cssSource).toContain('@media (max-width: 640px)');
    expect(mobileCssSource).toContain('@media (max-width: 760px)');
  });
});
