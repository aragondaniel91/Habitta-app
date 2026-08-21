import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./features/people/PeoplePanel.tsx', import.meta.url), 'utf8');
const createSaveFlow = source.slice(
  source.indexOf('const savePerson'),
  source.indexOf('const createOwnership'),
);

describe('HAB-235 People V2 atomic create', () => {
  it('creates a new person through one atomic mutation, then only refreshes reads', () => {
    expect(createSaveFlow).toContain('/people/create-with-context');
    expect(createSaveFlow).toContain("method: editingPersonId ? 'PATCH' : 'POST'");
    expect(createSaveFlow).toContain('initialRelationship,');
    expect(createSaveFlow).toMatch(/communication:\s+initialRelationship/);
    expect(createSaveFlow).not.toContain('/ownerships');
    expect(createSaveFlow).not.toContain('/occupancies');
    expect(createSaveFlow).not.toContain('communication-responsibilities');
    expect(createSaveFlow).toContain('await loadDirectory()');
    expect(createSaveFlow).toContain('await loadPersonContext(savedPerson.id)');
  });

  it('keeps identity document entry Venezuela-first while allowing a bounded custom type', () => {
    expect(source).toContain('<option value="Cédula V">Cédula V</option>');
    expect(source).toContain('<option value="Cédula E">Cédula E</option>');
    expect(source).toContain('<option value="RIF">RIF</option>');
    expect(source).toContain('<option value="Pasaporte">Pasaporte</option>');
    expect(source).toContain('<option value="Otro">Otro</option>');
    expect(source).toContain("personDraft.documentType === 'Otro'");
    expect(source).toContain('Tipo de documento personalizado');
    expect(source).toContain('maxLength={80}');
    expect(source).toMatch(
      /documentType:\s+personDraft\.documentType === 'Otro'\s+\? personDraft\.customDocumentType\s+: personDraft\.documentType/,
    );
  });

  it('shows unit and communication controls only for a unit-scoped initial relationship', () => {
    expect(source).toMatch(
      /\[\s*'owner',\s*'owner_occupant',\s*'tenant',\s*'family_member',\s*'authorized_occupant',?\s*\]\.includes\(initialContextDraft\.kind\)/,
    );
    expect(source).toContain("['owner', 'owner_occupant'].includes(initialContextDraft.kind)");
    expect(source).toMatch(/initialContextDraft\.unitId \?\s*\(\s*<>/);
    expect(source).toContain('directoryUnitLabel(unit, buildings)');
    expect(source).toContain('El saldo y los cargos siguen perteneciendo a la unidad.');
    expect(source).not.toContain('canSubmitPayment');
  });

  it('clears hidden relationship and communication state when the relationship kind changes', () => {
    expect(source).toMatch(
      /kind: event\.target\.value as InitialRelationshipKind,\s+unitId: '',\s+ownershipPercentage: '',\s+title: '',\s+financialRole: 'none',\s+generalRecipient: false,/,
    );
    expect(createSaveFlow).toContain('...(initialContextDraft.ownershipPercentage');
    expect(createSaveFlow).toContain('initialRelationship && initialContextDraft.unitId');
  });

  it('keeps validation and completion feedback inside the shared Drawer flow', () => {
    expect(source).toContain('required');
    expect(source).toContain('min="0.0001"');
    expect(source).toContain('max="100"');
    expect(source).toContain("'Persona creada.'");
    expect(source).toContain("'Persona y relación creadas correctamente.'");
    expect(source).not.toContain('Persona creada y lista para vincular.');
    expect(source).not.toContain('window.alert');
    expect(source).not.toContain('window.confirm');
    expect(source).not.toContain('window.prompt');
  });
});
