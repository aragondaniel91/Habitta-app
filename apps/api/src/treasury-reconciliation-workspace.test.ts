import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const source = () => readFile(new URL('./treasury-routes.ts', import.meta.url), 'utf8');

describe('treasury reconciliation workspace API', () => {
  it('uses the authoritative paginated workspace RPC rather than a recent-movements subset', async () => {
    const routes = await source();
    expect(routes).toContain('reconciliations/:reconciliationId/workspace');
    expect(routes).toContain("rpc(c, 'get_treasury_reconciliation_workspace'");
    expect(routes).toContain('page_size: 50');
    expect(routes).toContain('page_offset: query.data.offset');
  });

  it('keeps matching and closing on their existing protected RPCs', async () => {
    const routes = await source();
    expect(routes).toContain("rpc(c, 'match_treasury_movement'");
    expect(routes).toContain("rpc(c, 'close_treasury_reconciliation'");
    expect(routes).not.toContain('/unmatch');
  });
});
