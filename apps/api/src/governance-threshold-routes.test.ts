import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const routeUrl = new URL('./governance-threshold-routes.ts', import.meta.url);
const wrapperUrl = new URL('./operations-routes.ts', import.meta.url);

describe('governance approval threshold API', () => {
  it('routes threshold-aware governance creation before the legacy fallback router', async () => {
    const source = await readFile(wrapperUrl, 'utf8');
    expect(source.indexOf("operationsRoutes.route('/', governanceThresholdRoutes)")).toBeGreaterThan(-1);
    expect(source.indexOf("operationsRoutes.route('/', baseOperationsRoutes)")).toBeGreaterThan(-1);
    expect(source.indexOf("operationsRoutes.route('/', governanceThresholdRoutes)")).toBeLessThan(
      source.indexOf("operationsRoutes.route('/', baseOperationsRoutes)"),
    );
  });

  it('uses server-side RPCs for create and draft-only rule changes', async () => {
    const source = await readFile(routeUrl, 'utf8');
    expect(source).toContain("rpc(c, 'create_governance_proposal_v2'");
    expect(source).toContain("rpc(c, 'configure_governance_voting_rules'");
    expect(source).toContain('approvalThresholdPercentage');
    expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });
});
