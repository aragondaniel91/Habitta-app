import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

describe('HAB-262 Units UX redesign', () => {
  it('routes the live Units module to UnitsPage while keeping structure management separate', async () => {
    const route = await read('./pages/CommunityDirectoryPage.tsx');

    expect(route).toContain("import { UnitsPage } from './UnitsPage';");
    expect(route).toContain('<UnitsPage');
    expect(route).toContain('onConfigureStructure={() => setStructureOpen(true)}');
    expect(route).toContain('showUnitManagement={false}');
    expect(route).toContain('onBackToUnits={() => setStructureOpen(false)}');
  });

  it('uses the canonical aggregate directory and shows unit-centric operational summaries', async () => {
    const page = await read('./pages/UnitsPage.tsx');

    expect(page).toContain('/units-directory');
    expect(page).toContain('WorkspaceMetrics');
    expect(page).toContain('Con propietarios');
    expect(page).toContain('Ocupadas');
    expect(page).toContain('personSummary(unit.owners)');
    expect(page).toContain('participationSummary(unit)');
    expect(page).toContain('personSummary(unit.occupancies)');
    expect(page).toContain('unitReferenceLabel');
    expect(page).toContain('supportsBuildingStructure(topology)');
    expect(page).toContain('unitTypeOptions(topology)');
  });

  it('keeps detail history auditable with the existing unit owner and occupancy APIs', async () => {
    const detail = await read('./features/units/UnitDetailDrawer.tsx');

    expect(detail).toContain("['summary', 'Resumen']");
    expect(detail).toContain("['ownership', 'Propiedad']");
    expect(detail).toContain("['occupancy', 'Ocupación']");
    expect(detail).toContain("['actions', 'Acciones']");
    expect(detail).toContain('/units/${unit.id}/owners');
    expect(detail).toContain('/units/${unit.id}/occupancies');
    expect(detail).toContain('/people`');
    expect(detail).toContain("current ? 'Actual' : 'Histórica'");
    expect(detail).toContain('pagos, cuotas, propietarios, ocupaciones y movimientos');
  });

  it('uses shared drawer/form primitives with custom validation and UUID-backed buildings', async () => {
    const editor = await read('./features/units/UnitEditor.tsx');

    expect(editor).toContain("import { Drawer } from '../../components/Drawer';");
    expect(editor).toContain('FormActions, FormGrid, FormSection');
    expect(editor).toContain('presentation="workspace"');
    expect(editor).toContain('noValidate');
    expect(editor).toContain('Escribe el código o número de la unidad.');
    expect(editor).toContain('La alícuota debe ser mayor que 0 y hasta 100.');
    expect(editor).toContain("buildingRequired = topology === 'multi_building_complex'");
    expect(editor).toContain('buildings[0]?.id');
    expect(editor).toContain('<option key={building.id} value={building.id}>');
    expect(editor).toContain('<FormActions sticky>');
    expect(editor).not.toContain('window.alert');
    expect(editor).not.toContain('window.confirm');
    expect(editor).not.toContain('window.prompt');
  });

  it('has explicit desktop, tablet and mobile responsive contracts', async () => {
    const css = await read('./units-v3.css');

    expect(css).toContain('.units-v3-list__head');
    expect(css).toContain('.units-v3-row');
    expect(css).toContain('.units-v3-detail-facts');
    expect(css).toContain('@media (max-width: 1180px)');
    expect(css).toContain('@media (max-width: 860px)');
    expect(css).toContain('@media (max-width: 560px)');
    expect(css).toContain('grid-template-columns: 1fr');
  });
});
