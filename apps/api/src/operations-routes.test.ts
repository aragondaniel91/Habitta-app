import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const routeUrl = new URL('./operations-routes.ts', import.meta.url);
const apiUrl = new URL('./index.ts', import.meta.url);

describe('expenses and governance API routes', () => {
  it('mounts the operations router behind authenticated condominium routes', async () => {
    const source = await readFile(apiUrl, 'utf8');
    expect(source).toContain("app.use('/v1/*'");
    expect(source).toContain("app.route('/v1/condominiums', operationsRoutes)");
  });

  it('uses server-side transition RPCs and never a service-role key', async () => {
    const source = await readFile(routeUrl, 'utf8');
    expect(source).toContain("rpc(c, 'transition_expense'");
    expect(source).toContain("rpc(c, 'transition_governance_proposal'");
    expect(source).toContain("rpc(c, 'cast_governance_vote'");
    expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });
});
