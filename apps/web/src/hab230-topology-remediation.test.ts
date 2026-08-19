import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
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
});
