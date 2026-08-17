import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const routeUrl = new URL('./budget-routes.ts', import.meta.url);
const wrapperUrl = new URL('./operations-routes.ts', import.meta.url);

describe('budget API contract', () => {
  it('mounts the budget router in the authenticated condominium operations tree', async () => {
    const source = await readFile(wrapperUrl, 'utf8');
    expect(source).toContain("import { budgetRoutes } from './budget-routes'");
    expect(source).toContain("baseOperationsRoutes.route('/', budgetRoutes)");
  });

  it('uses server-side lifecycle RPCs and never a service-role credential', async () => {
    const source = await readFile(routeUrl, 'utf8');
    expect(source).toContain("rpc(c, 'create_budget_period'");
    expect(source).toContain("rpc(c, 'create_budget_revision'");
    expect(source).toContain("rpc(c, 'submit_budget_version'");
    expect(source).toContain("rpc(c, 'approve_budget_version'");
    expect(source).toContain("rpc(c, 'get_budget_actual_vs_budget'");
    expect(source).toContain("target_type: 'budget'");
    expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('keeps category/currency pairs unique before they reach PostgreSQL', async () => {
    const source = await readFile(routeUrl, 'utf8');
    expect(source).toContain('Budget category and currency pairs must be unique');
    expect(source).toContain('currencyCode.toUpperCase()');
  });
});
