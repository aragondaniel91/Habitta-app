import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const unitEditorSource = source('./features/units/UnitEditor.tsx');
const structureSource = source('./pages/StructureManagementPage.tsx');
const sharedStylesSource = source('./styles.css');
const parityMatrixSource = source('../../../docs/frontend/form-parity-matrix.md');

describe('HAB-251 Units shared form layout', () => {
  it('uses the shared FormGrid in both administrator unit editors', () => {
    expect(unitEditorSource).toContain("import { FormGrid } from '../../components/FormLayout'");
    expect(structureSource).toContain("import { FormGrid } from '../components/FormLayout'");
    expect(unitEditorSource).toContain('<FormGrid>');
    expect(structureSource).toContain('<FormGrid>');
    expect(unitEditorSource).not.toContain('className="structure-form-grid"');
    expect(structureSource).not.toContain('className="structure-form-grid"');
  });

  it('keeps shared dialog actions and full-width topology/error notes', () => {
    expect(unitEditorSource).toContain('<DialogFooter>');
    expect(structureSource).toContain('<DialogFooter>');
    expect(unitEditorSource).toContain('className="structure-form-note" data-span="full"');
    expect(unitEditorSource).toContain('className="structure-message" data-span="full"');
    expect(structureSource).toContain('className="structure-form-note" data-span="full"');
  });

  it('inherits the shared responsive grid contract', () => {
    expect(sharedStylesSource).toContain(".form-grid[data-columns='2']");
    expect(sharedStylesSource).toContain(".form-grid > [data-span='full']");
    expect(sharedStylesSource).toContain('grid-template-columns: minmax(0, 1fr)');
  });

  it('preserves topology, UUID-backed building selection and archive semantics', () => {
    expect(unitEditorSource).toContain("buildingRequired = topology === 'multi_building_complex'");
    expect(unitEditorSource).toContain('const buildingId = houseCommunity');
    expect(unitEditorSource).toContain('? null');
    expect(unitEditorSource).toContain('buildings[0]?.id');
    expect(unitEditorSource).toContain('<option key={building.id} value={building.id}>');
    expect(unitEditorSource).toContain('ownershipPercentage > 100');
    expect(unitEditorSource).toContain('Inactiva / archivada');
    expect(structureSource).toContain('const selectedBuildingId = houseMode');
    expect(structureSource).toContain('buildings[0]?.id');
    expect(structureSource).toContain('<option key={building.id} value={building.id}>');
  });

  it('marks Units compliant only after the shared layout migration', () => {
    expect(parityMatrixSource).toContain(
      '| Unidades | Units V2 editor + Structure Management unit editor | compliant | Sí | Sí | Sí | Sí |',
    );
  });
});
