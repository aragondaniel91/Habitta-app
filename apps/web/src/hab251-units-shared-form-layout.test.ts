import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const unitEditorSource = source('./features/units/UnitEditor.tsx');
const structureSource = source('./pages/StructureManagementPage.tsx');
const sharedStylesSource = source('./styles.css');
const parityMatrixSource = source('../../../docs/frontend/form-parity-matrix.md');

describe('HAB-251/HAB-262 Units shared form layout', () => {
  it('uses the shared FormGrid in both administrator unit/structure editors', () => {
    expect(unitEditorSource).toContain('FormActions, FormGrid, FormSection');
    expect(structureSource).toContain("import { FormGrid } from '../components/FormLayout'");
    expect(unitEditorSource).toContain('<FormGrid>');
    expect(structureSource).toContain('<FormGrid>');
    expect(unitEditorSource).not.toContain('className="structure-form-grid"');
    expect(structureSource).not.toContain('className="structure-form-grid"');
  });

  it('uses the shared workspace drawer and sticky action contract for the canonical unit editor', () => {
    expect(unitEditorSource).toContain("import { Drawer } from '../../components/Drawer'");
    expect(unitEditorSource).toContain('presentation="workspace"');
    expect(unitEditorSource).toContain('<FormSection');
    expect(unitEditorSource).toContain('<FormActions sticky>');
    expect(unitEditorSource).toContain('noValidate');
    expect(structureSource).toContain('<DialogFooter>');
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

  it('keeps Units compliant after the V3 workspace migration', () => {
    expect(parityMatrixSource).toContain(
      '| Unidades | Units V3 editor + Structure Management topology/building editor | compliant | Sí | Sí | Sí | Sí |',
    );
  });
});
