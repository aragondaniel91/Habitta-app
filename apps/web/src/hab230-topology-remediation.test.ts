import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { topologyRemediationPayload } from './pages/StructureManagementPage';
const source = readFileSync(
  new URL('./pages/StructureManagementPage.tsx', import.meta.url),
  'utf8',
);
describe('HAB-230 topology remediation UI contract', () => {
  it('is limited to legacy condominium admins and uses the Worker action', () => {
    expect(source).toContain("roles.includes('condominium_admin')");
    expect(source).toContain("topology === 'unspecified' && canRemediate");
    expect(source).toContain('Definir tipo de propiedad');
    expect(source).toContain('/topology-remediation');
    expect(source).toContain("method: 'POST'");
    expect(source).toContain('await loadStructure()');
    expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(source).not.toContain('supabase.rpc');
    expect(source).not.toContain('window.alert');
  });
  it('offers only resolved topologies and retains technical structure untouched', () => {
    expect(source).not.toContain('<option value="unspecified">');
    expect(source).toContain('Cantidad declarada de casas');
    expect(source).toContain('Cantidad declarada de edificios o torres');
    expect(source).not.toContain("method: 'DELETE'");
  });
  it('does not submit stale hidden counts', () => {
    expect(topologyRemediationPayload('house_community', 4, 3)).toEqual({
      propertyTopology: 'house_community',
      declaredUnitCount: 4,
      declaredBuildingCount: null,
    });
    expect(topologyRemediationPayload('multi_building_complex', 4, 3)).toEqual({
      propertyTopology: 'multi_building_complex',
      declaredUnitCount: null,
      declaredBuildingCount: 3,
    });
    expect(topologyRemediationPayload('single_building', 4, 3).declaredBuildingCount).toBeNull();
    expect(topologyRemediationPayload('mixed', 4, 3)).toEqual({
      propertyTopology: 'mixed',
      declaredUnitCount: 4,
      declaredBuildingCount: 3,
    });
  });
});
