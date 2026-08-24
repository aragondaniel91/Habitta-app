import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const count = (value: string, needle: string) => value.split(needle).length - 1;

const panel = source('./features/receivables/OwnershipTransferPanel.tsx');
const css = source('./hab186-financial-integrity.css');

describe('HAB-287 premium ownership-transfer form parity', () => {
  it('opts the transfer workflow into the premium shared form contract', () => {
    expect(panel).toContain('className="ownership-transfer-form ux-form"');
    expect(panel).toContain('<FormGrid className="ownership-transfer-owner-fields">');
    expect(count(panel, 'className="input"')).toBe(3);
    expect(count(panel, '<FormActions>')).toBe(1);
    expect(panel).not.toContain('className="ownership-transfer-actions"');
    expect(css).not.toContain('.ownership-transfer-actions');
  });

  it('preserves exact 100 percent ownership validation and duplicate-person rejection', () => {
    expect(panel).toContain('Math.abs(percentageTotal - 100) > 0.0001');
    expect(panel).toContain(
      'Las alícuotas de los nuevos propietarios deben sumar exactamente 100%.',
    );
    expect(panel).toContain(
      'new Set(owners.map((owner) => owner.personId)).size !== owners.length',
    );
    expect(panel).toContain('No puedes seleccionar la misma persona más de una vez.');
    expect(panel).toContain('Math.abs(percentageTotal - 100) < 0.0001');
  });

  it('preserves UUID-backed owner identity, percentages and primary-contact semantics', () => {
    expect(panel).toContain('personId: owner.personId');
    expect(panel).toContain('ownershipPercentage: Number(owner.percentage)');
    expect(panel).toContain('isPrimaryContact: owner.primary');
    expect(panel).toContain('<option key={person.id} value={person.id}>');
    expect(panel).not.toContain('personId: person.first_name');
    expect(panel).not.toContain('personId: owner.name');
  });

  it('keeps transfer metadata and the unit-scoped API route unchanged', () => {
    expect(panel).toContain('effectiveDate,');
    expect(panel).toContain('supportingDocumentReference: documentReference.trim()');
    expect(panel).toContain('notes: notes.trim()');
    expect(panel).toContain(
      '`/v1/condominiums/${condominiumId}/units/${unitId}/ownership-transfers`',
    );
    expect(panel).toContain("method: 'POST'");
  });

  it('keeps debt and financial history explicitly bound to the unit', () => {
    expect(panel).toContain('nunca mueve la deuda de la unidad');
    expect(panel).toMatch(/Cargos, pagos, saldos y movimientos no cambian\s+de unidad\./);
    expect(panel).toContain(
      'Transferencia registrada. La cuenta financiera y toda su historia permanecen en la unidad.',
    );
    expect(panel).toContain('previous_owners_snapshot');
    expect(panel).toContain('new_owners_snapshot');
  });
});
