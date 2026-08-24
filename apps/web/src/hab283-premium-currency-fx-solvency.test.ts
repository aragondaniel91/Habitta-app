import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const count = (value: string, needle: string) => value.split(needle).length - 1;

const panel = source('./features/receivables/FinancialIntegrityPanel.tsx');
const css = source('./hab186-financial-integrity.css');

describe('HAB-283 premium currency, FX and solvency policy forms', () => {
  it('opts all three financial policy forms into the premium form contract', () => {
    expect(count(panel, 'className="financial-integrity-card ux-form"')).toBe(3);
    expect(count(panel, '<FormActions>')).toBe(3);
    expect(panel).toContain('<FormGrid columns={3}>');
    expect(count(panel, 'className="input"')).toBe(14);
    expect(panel).not.toContain('financial-integrity-inline');
    expect(css).not.toContain('.financial-integrity-inline');
  });

  it('preserves currency policy normalization and payload semantics', () => {
    expect(panel).toContain(".map((value) => value.trim().toUpperCase())");
    expect(panel).toContain('accountingCurrencyCode: accountingCurrency.toUpperCase()');
    expect(panel).toContain('acceptedCurrencyCodes: normalizedAccepted');
    expect(panel).toContain('conversionMode,');
    expect(panel).toContain('defaultRateSource: defaultSource.trim() || undefined');
    expect(panel).toContain('maxRateAgeDays: Number(maxRateAgeDays)');
    expect(panel).toContain('<option value="disabled">Desactivada</option>');
    expect(panel).toContain(
      '<option value="approved_rates_only">Solo con tasas aprobadas</option>',
    );
    expect(panel).toContain(
      'Política de moneda actualizada. Ningún saldo histórico fue convertido o revalorizado.',
    );
  });

  it('preserves solvency evaluation fields without consolidating currencies', () => {
    expect(panel).toContain('balanceBasis,');
    expect(panel).toContain('graceDays: Number(graceDays)');
    expect(panel).toContain('tolerancePerCurrency: Number(tolerance)');
    expect(panel).toContain('certificateValidityDays: Number(validityDays)');
    expect(panel).toContain('<option value="outstanding">Todo saldo pendiente</option>');
    expect(panel).toContain('<option value="overdue">Solo saldo vencido</option>');
    expect(panel).toContain('nunca contra un total');
    expect(panel).toContain('no se consolida entre monedas');
    expect(panel).toContain('Los certificados emitidos permanecen inmutables.');
  });

  it('preserves exact approved-rate evidence and no-silent-conversion behavior', () => {
    expect(panel).toContain('fromCurrencyCode: fromCurrency.toUpperCase()');
    expect(panel).toContain('toCurrencyCode: toCurrency.toUpperCase()');
    expect(panel).toContain('rate,');
    expect(panel).toContain('effectiveOn,');
    expect(panel).toContain('rateAt,');
    expect(panel).toContain('source: source.trim()');
    expect(panel).toContain('sourceReference: sourceReference.trim() || undefined');
    expect(panel).toContain("disabled={busy === 'rate' || conversionMode !== 'approved_rates_only'}");
    expect(panel).toContain(
      'Tasa aprobada y congelada. Las transacciones futuras pueden referenciar este snapshot; las históricas no cambian.',
    );
  });

  it('keeps every financial API route and method unchanged', () => {
    expect(panel).toContain('`/v1/condominiums/${condominiumId}/currency-policy`');
    expect(panel).toContain('`/v1/condominiums/${condominiumId}/solvency-policy`');
    expect(panel).toContain('`/v1/condominiums/${condominiumId}/exchange-rates`');
    expect(count(panel, "method: 'PUT'")).toBe(2);
    expect(count(panel, "method: 'POST'")).toBe(1);
  });
});
