import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { allowedUnitTypes, defaultUnitType } from './lib/unit-domain';
import { getRouteFromPath } from './navigation';

const appUrl = new URL('./App.tsx', import.meta.url);
const pageUrl = new URL('./pages/StructureManagementPage.tsx', import.meta.url);
const mainUrl = new URL('./main.tsx', import.meta.url);

describe('physical structure management workspace', () => {
  it('routes Units to V2 while retaining an authenticated secondary structure workspace', async () => {
    const [app, main] = await Promise.all([readFile(appUrl, 'utf8'), readFile(mainUrl, 'utf8')]);

    expect(app).toContain("activeRoute.key === 'units'");
    expect(app).toContain('<UnitsPage');
    expect(app).toContain("'/app/units/structure'");
    expect(app).toContain('showUnitManagement={false}');
    expect(getRouteFromPath('/app/units').key).toBe('units');
    expect(getRouteFromPath('/app/units/structure').key).toBe('units');
    // The stylesheet ships inside the Units chunk rather than the initial bundle, since a resident
    // who never opens that module should not download its CSS either.
    expect(await readFile(pageUrl, 'utf8')).toContain("import '../structure-management.css'");
    expect(main).not.toContain("import './structure-management.css'");
  });

  it('keeps the secondary workspace focused on topology and buildings', async () => {
    const source = await readFile(pageUrl, 'utf8');
    expect(source).toContain('showUnitManagement = true');
    expect(source).toContain('Volver a Unidades');
    expect(source).toContain('showUnitManagement ? (');
    expect(source).toContain("{showUnitManagement && activeView === 'units'");
  });

  it('supports topology-aware building administration and non-destructive unit editing', async () => {
    const source = await readFile(pageUrl, 'utf8');

    expect(source).toContain("const houseMode = topology === 'house_community'");
    expect(source).toContain("const singleBuildingMode = topology === 'single_building'");
    expect(source).toContain('unitTypeOptions(topology)');
    expect(source).toContain('defaultUnitType(topology)');
    expect(defaultUnitType('house_community')).toBe('house');
    expect(allowedUnitTypes('single_building')).not.toContain('house');
    expect(allowedUnitTypes('multi_building_complex')).not.toContain('house');
    expect(source).toContain('Nueva torre o edificio');
    expect(source).toContain('Torres y edificios');
    expect(source).toContain('Casas y unidades');
    expect(source).toContain("method: building ? 'PATCH' : 'POST'");
    expect(source).toContain("method: unit ? 'PATCH' : 'POST'");
    expect(source).toContain('Inactiva / archivada');
    expect(source).toContain('Sin edificio asignado');
    expect(source).toContain(
      "import { Dialog, DialogBody, DialogFooter } from '../components/Dialog'",
    );
    expect(source).not.toContain('structure-dialog-backdrop');
    expect(source).not.toContain("method: 'DELETE'");
  });
});
