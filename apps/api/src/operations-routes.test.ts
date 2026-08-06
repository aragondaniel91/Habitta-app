import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const wrapperUrl = new URL('./operations-routes.ts', import.meta.url);
const coreUrl = new URL('./operations-core-routes.ts', import.meta.url);
const maintenanceUrl = new URL('./maintenance-routes.ts', import.meta.url);
const apiUrl = new URL('./index.ts', import.meta.url);

describe('operations and maintenance API routes', () => {
  it('keeps the authenticated operations router mounted once', async () => {
    const source = await readFile(apiUrl, 'utf8');
    expect(source).toContain("app.use('/v1/*'");
    expect(source).toContain("app.route('/v1/condominiums', operationsRoutes)");
  });

  it('preserves existing financial and governance RPC routes in the core module', async () => {
    const source = await readFile(coreUrl, 'utf8');
    expect(source).toContain("rpc(c, 'transition_expense'");
    expect(source).toContain("rpc(c, 'transition_governance_proposal'");
    expect(source).toContain("rpc(c, 'cast_governance_vote'");
    expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('registers maintenance routes without service-role credentials', async () => {
    const wrapper = await readFile(wrapperUrl, 'utf8');
    const source = await readFile(maintenanceUrl, 'utf8');
    expect(wrapper).toContain('registerMaintenanceRoutes(operationsRoutes)');
    expect(source).toContain("rpc(c, 'create_maintenance_asset'");
    expect(source).toContain("rpc(c, 'create_maintenance_plan'");
    expect(source).toContain("rpc(c, 'create_maintenance_work_order'");
    expect(source).toContain("rpc(c, 'generate_due_maintenance_work_orders'");
    expect(source).toContain("rpc(c, 'transition_maintenance_work_order'");
    expect(source).toContain("rpc(c, 'add_maintenance_service_log'");
    expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });
});
