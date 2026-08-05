import { describe, expect, it } from 'vitest';
import { createTemplateCsv, parseCsv, validateImportRows } from './csv';

describe('guided CSV imports', () => {
  it('parses BOM, quoted commas and escaped quotes', () => {
    const parsed = parseCsv(
      '\uFEFFunit_code,first_name,last_name,email,phone,relationship,ownership_percentage\n' +
        'A-101,"Ana, María","Pérez ""Principal""",ana@example.com,,owner,100',
    );

    expect(parsed.headers).toEqual([
      'unit_code',
      'first_name',
      'last_name',
      'email',
      'phone',
      'relationship',
      'ownership_percentage',
    ]);
    expect(parsed.rows[0]).toMatchObject({
      unit_code: 'A-101',
      first_name: 'Ana, María',
      last_name: 'Pérez "Principal"',
    });
  });

  it('detects semicolon-separated exports from spreadsheet applications', () => {
    const parsed = parseCsv(
      'unit_code;balance_type;amount;currency_code;effective_date;description\n' +
        'A-101;debit;125.50;USD;2026-08-01;Saldo anterior',
    );

    expect(parsed.rows[0]?.currency_code).toBe('USD');
    expect(validateImportRows('opening_balances', parsed)[0]?.errors).toEqual([]);
  });

  it('rejects missing columns before preview', () => {
    const parsed = parseCsv('unit_code,first_name\nA-101,Ana');

    expect(() => validateImportRows('people', parsed)).toThrow(
      /Faltan columnas obligatorias/,
    );
  });

  it('detects duplicate unit codes and invalid percentages', () => {
    const parsed = parseCsv(
      'building_name,unit_code,unit_type,floor,ownership_percentage,status\n' +
        'Torre A,A-101,apartment,1,150,active\n' +
        'Torre A,A-101,apartment,1,2.5,active',
    );
    const rows = validateImportRows('units', parsed);

    expect(rows[0]?.errors).toContain('ownership_percentage debe ser mayor que 0 y hasta 100');
    expect(rows[1]?.errors).toContain('unit_code está duplicado dentro del archivo');
  });

  it('generates an editable template with the exact supported headers', () => {
    const template = createTemplateCsv('people');
    const parsed = parseCsv(template);

    expect(parsed.headers).toEqual([
      'unit_code',
      'first_name',
      'last_name',
      'email',
      'phone',
      'relationship',
      'ownership_percentage',
    ]);
    expect(parsed.rows).toHaveLength(1);
  });
});
