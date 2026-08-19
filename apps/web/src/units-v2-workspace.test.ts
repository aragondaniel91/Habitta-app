import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { allowedUnitTypes, unitReferenceLabel } from './lib/unit-domain';

const pageUrl = new URL('./pages/UnitsPage.tsx', import.meta.url);
const drawerUrl = new URL('./features/units/UnitDetailDrawer.tsx', import.meta.url);

describe('Units V2 workspace', () => {
  it('loads the canonical directory with the established profile-array contract', async () => {
    const source = await readFile(pageUrl, 'utf8');
    expect(source).toContain('apiRequest<CondominiumProfile[]>');
    expect(source).toContain('profileRows[0] ?? null');
    expect(source).toContain('/units-directory');
    expect(source).toContain('UnitDetailDrawer');
    expect(source).not.toContain('window.confirm');
    expect(source).not.toContain('window.alert');
    expect(source).not.toContain('window.prompt');
  });

  it('keeps topology-specific controls and qualified unit labels on the shared domain helpers', async () => {
    const [page, drawer] = await Promise.all([
      readFile(pageUrl, 'utf8'),
      readFile(drawerUrl, 'utf8'),
    ]);
    expect(page).toContain('supportsBuildingStructure(topology)');
    expect(page).toContain('unitTypeOptions(topology)');
    expect(page).toContain('unitReferenceLabel');
    expect(drawer).toContain('unitReferenceLabel');
    expect(allowedUnitTypes('house_community')).toContain('house');
    expect(allowedUnitTypes('house_community')).not.toContain('apartment');
    expect(allowedUnitTypes('single_building')).not.toContain('house');
    expect(allowedUnitTypes('multi_building_complex')).not.toContain('house');
    expect(unitReferenceLabel({ buildingName: 'Torre II', code: '1-A' })).toBe('Torre II · 1-A');
  });
});
