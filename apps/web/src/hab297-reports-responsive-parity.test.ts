import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const normalizeNewlines = (value: string) => value.replace(/\r\n/g, '\n');
const pageSource = normalizeNewlines(
  readFileSync(new URL('./pages/ReportsPage.tsx', import.meta.url), 'utf8'),
);
const cssSource = normalizeNewlines(
  readFileSync(new URL('./reports.css', import.meta.url), 'utf8'),
);

describe('HAB-297 Reports responsive parity', () => {
  it('uses the shared module header and explicit report controls', () => {
    expect(pageSource).toContain("import { PageHeader } from '../components/PageHeader'");
    expect(pageSource).toContain('title="Reportes y análisis"');
    expect(pageSource).toContain('aria-label="Período del reporte"');
    expect(pageSource).toContain('Exportar CSV');
    expect(cssSource).not.toContain('.reports-overview');
  });

  it('keeps currency selection explicit and touch friendly', () => {
    expect(pageSource).toContain('aria-label="Seleccionar moneda"');
    expect(pageSource).toContain('aria-pressed={selected === currency}');
    expect(pageSource).toContain('Cada reporte conserva libros y totales independientes.');
    expect(cssSource).toContain('.reports-currency-tabs button {');
    expect(cssSource).toContain('min-height: 44px;');
  });

  it('preserves independent currency calculations and honest data coverage', () => {
    expect(pageSource).toContain('getReportCurrencies(');
    expect(pageSource).toContain('getPeriodFinancialTotals(');
    expect(pageSource).toContain('getPortfolioTotals(');
    expect(pageSource).toContain('selectedCurrency');
    expect(pageSource).toContain('El reporte nunca completa cifras con valores simulados.');
  });

  it('keeps the desktop table and mobile unit cards as equivalent views', () => {
    expect(pageSource).toContain('className="reports-table-wrap"');
    expect(pageSource).toContain('className="reports-mobile-units"');
    expect(cssSource).toContain('@media (max-width: 720px)');
    expect(cssSource).toContain('.reports-table-wrap {\n    display: none;');
    expect(cssSource).toContain('.reports-mobile-units {\n    display: grid;');
  });

  it('covers desktop, tablet and narrow-mobile breakpoints', () => {
    expect(cssSource).toContain('@media (max-width: 1180px)');
    expect(cssSource).toContain('@media (max-width: 920px)');
    expect(cssSource).toContain('@media (max-width: 720px)');
    expect(cssSource).toContain('@media (max-width: 430px)');
    expect(cssSource).toContain('grid-template-columns: 1fr 1fr;');
  });
});
