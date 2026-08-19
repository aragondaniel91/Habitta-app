import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const route = new URL('./topology-remediation-routes.ts', import.meta.url);
const operations = new URL('./operations-routes.ts', import.meta.url);
describe('topology remediation route contract', () => {
  it('mounts an authenticated RPC action without direct table writes', async () => {
    const [source, mounted] = await Promise.all([
      readFile(route, 'utf8'),
      readFile(operations, 'utf8'),
    ]);
    expect(mounted).toContain('topologyRemediationRoutes');
    expect(source).toContain("post('/:id/topology-remediation'");
    expect(source).toContain('uuidSchema');
    expect(source).toContain('condominiumTopologyRemediationSchema');
    expect(source).toContain('remediate_condominium_topology');
    expect(source).toContain("Authorization: `Bearer ${c.get('token')}`");
    expect(source).toContain('SUPABASE_ANON_KEY');
    expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(source).not.toContain('condominiums?');
    expect(source).toContain('requested_topology');
    expect(source).toContain('requested_unit_count');
    expect(source).toContain('requested_building_count');
    expect(source).toContain('409');
  });
});
