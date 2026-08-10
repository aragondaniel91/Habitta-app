import { describe, expect, it } from 'vitest';
import { csvFileName, escapeCsv, toCsv } from './csv-export';

describe('CSV export', () => {
  it('quotes only the fields that would otherwise break the row', () => {
    expect(escapeCsv('Cuota agosto')).toBe('Cuota agosto');
    expect(escapeCsv('Cuota, agosto')).toBe('"Cuota, agosto"');
    expect(escapeCsv('Pago "adelantado"')).toBe('"Pago ""adelantado"""');
    expect(escapeCsv('Linea 1\nLinea 2')).toBe('"Linea 1\nLinea 2"');
  });

  it('keeps a description with commas inside a single field', () => {
    const csv = toCsv(['description', 'amount'], [['Cuota de agosto, torre A', '125.00']]);

    expect(csv).toBe('description,amount\n"Cuota de agosto, torre A",125.00');
    expect(csv.split('\n')).toHaveLength(2);
  });

  it('builds a filename that survives accents, spaces and punctuation', () => {
    expect(csvFileName('Residencias Habitta E2E', 'unidades', 'USD', '6m')).toBe(
      'habitta-residencias-habitta-e2e-unidades-usd-6m.csv',
    );
    // Accents fold into the base letter rather than becoming a separator, so a word stays one word.
    expect(csvFileName('Residencias Ñangara — Piso 3°')).toBe(
      'habitta-residencias-nangara-piso-3.csv',
    );
  });

  it('drops empty parts instead of leaving double separators', () => {
    expect(csvFileName('Condominio', '', 'usd')).toBe('habitta-condominio-usd.csv');
  });
});
