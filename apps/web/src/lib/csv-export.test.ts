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

  it('neutralizes leading formula triggers in user-controlled text', () => {
    expect(escapeCsv("=cmd|'/c calc'!A0")).toBe("'=cmd|'/c calc'!A0");
    expect(escapeCsv('+1-234-555-0000')).toBe("'+1-234-555-0000");
    expect(escapeCsv('-2+3')).toBe("'-2+3");
    expect(escapeCsv('@SUM(A1:A2)')).toBe("'@SUM(A1:A2)");
  });

  it('does not treat numeric amounts as formulas', () => {
    expect(escapeCsv('-125.00')).toBe('-125.00');
    expect(escapeCsv('125.00')).toBe('125.00');
    expect(escapeCsv(-125)).toBe('-125');
    expect(escapeCsv('+125')).toBe('+125');
  });

  it('still quotes a neutralized formula value that also contains a comma', () => {
    const csv = toCsv(
      ['unit_code', 'amount'],
      [['=HYPERLINK("http://evil","A1"), extra', '100.00']],
    );

    expect(csv).toBe('unit_code,amount\n"\'=HYPERLINK(""http://evil"",""A1""), extra",100.00');
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
