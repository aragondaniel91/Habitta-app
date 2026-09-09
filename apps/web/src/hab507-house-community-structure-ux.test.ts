import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const unitsPage = readFileSync(new URL('./pages/UnitsPage.tsx', import.meta.url), 'utf8');
const structurePage = readFileSync(
  new URL('./pages/StructureManagementPage.tsx', import.meta.url),
  'utf8',
);

describe('HAB-507 house-community structure UX', () => {
  it('does not offer building-structure navigation to a house community', () => {
    expect(unitsPage).toContain('onConfigureStructure && supportsBuildingStructure(topology)');
  });

  it('keeps a direct structure deep link on house/unit management instead of buildings', () => {
    expect(structurePage).toContain(
      'const effectiveShowUnitManagement = showUnitManagement || houseMode;',
    );
    expect(structurePage).toContain("effectiveShowUnitManagement && activeView === 'units'");
    expect(structurePage).toContain(
      "if (houseMode && activeView === 'buildings') setActiveView('units')",
    );
  });

  it('shows declared-house setup progress instead of an irrelevant inactive-units metric', () => {
    expect(structurePage).toContain("'Casas declaradas'");
    expect(structurePage).toContain("'Pendientes de configurar'");
    expect(structurePage).toContain('Math.max(profile.declared_unit_count - units.length, 0)');
  });
});
