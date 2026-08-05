import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const routeUrl = new URL('./treasury-routes.ts', import.meta.url);
const apiUrl = new URL('./index.ts', import.meta.url);

describe('treasury API routes', () => {
  it('mounts treasury behind authenticated condominium routes', async () => {
    const source = await readFile(apiUrl, 'utf8');
    expect(source).toContain("app.use('/v1/*'");
    expect(source).toContain("app.route('/v1/condominiums', treasuryRoutes)");
  });

  it('uses transactional treasury RPCs and no service role key', async () => {
    const source = await readFile(routeUrl, 'utf8');
    expect(source).toContain("rpc(c, 'create_treasury_account'");
    expect(source).toContain("rpc(c, 'record_treasury_movement'");
    expect(source).toContain("rpc(c, 'create_treasury_transfer'");
    expect(source).toContain("rpc(c, 'reverse_treasury_movement'");
    expect(source).toContain("rpc(c, 'close_treasury_reconciliation'");
    expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });
});
