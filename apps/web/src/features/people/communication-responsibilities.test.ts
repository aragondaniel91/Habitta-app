import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const componentUrl = new URL('./CommunicationResponsibilities.tsx', import.meta.url);

describe('unit communication responsibilities', () => {
  it('keeps communication responsibility separate from payment authority', async () => {
    const source = await readFile(componentUrl, 'utf8');
    expect(source).toContain('Comunicaciones por unidad');
    expect(source).toContain('Principal');
    expect(source).toContain('Adicional');
    expect(source).toContain('No recibe información financiera');
    expect(source).toContain('Recibir comunicaciones generales');
    expect(source).toContain('El saldo y los cargos siguen perteneciendo a la unidad.');
    expect(source).toContain('El permiso para registrar pagos se');
    expect(source).toContain('determina por la relación activa de la persona con la unidad.');
    expect(source).toContain('directoryUnitLabel(unit, buildings)');
    expect(source).toContain('communication-responsibilities/${unitId}');
    expect(source).toContain('financialRole, generalRecipient');
    expect(source).not.toContain('window.alert');
    expect(source).not.toContain('window.confirm');
    expect(source).not.toContain('window.prompt');
    expect(source).not.toContain('canSubmitPayment');
  });
});
