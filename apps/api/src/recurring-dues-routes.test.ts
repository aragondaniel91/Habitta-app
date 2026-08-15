import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('./recurring-dues-routes.ts', import.meta.url)),
  'utf8',
);
const appSource = readFileSync(fileURLToPath(new URL('./index.ts', import.meta.url)), 'utf8');

describe('HAB-185 recurring dues API contract', () => {
  it('mounts the recurring dues API under authenticated condominium routes', () => {
    expect(appSource).toContain("import { recurringDuesRoutes } from './recurring-dues-routes'");
    expect(appSource).toContain("app.route('/v1/condominiums', recurringDuesRoutes)");
  });

  it('exposes scopes, plans and runs without direct financial table writes', () => {
    expect(source).toContain("get('/:id/financial-scopes'");
    expect(source).toContain("post('/:id/financial-scopes'");
    expect(source).toContain("get('/:id/recurring-charge-plans'");
    expect(source).toContain("post('/:id/recurring-charge-plans'");
    expect(source).toContain("get('/:id/recurring-charge-runs'");
    expect(source).toContain("rpc(c, 'create_financial_scope'");
    expect(source).toContain("rpc(c, 'create_recurring_charge_plan'");
    expect(source).not.toMatch(
      /rest\(c,\s*`?(financial_scopes|recurring_charge_plans|recurring_charge_runs)[^)]*\{\s*method:\s*'(POST|PUT|PATCH|DELETE)'/s,
    );
  });

  it('keeps the recurring lifecycle review-gated', () => {
    expect(source).toContain("'prepare_recurring_charge_run'");
    expect(source).toContain("'post_recurring_charge_run'");
    expect(source).toContain("post('/:id/recurring-charge-runs/:runId/prepare'");
    expect(source).toContain("post('/:id/recurring-charge-runs/:runId/post'");
  });

  it('validates URL condominium scope before plan or run mutations', () => {
    expect(source).toContain(
      'recurring_charge_plans?id=eq.${planId}&condominium_id=eq.${condominiumId}&select=id',
    );
    expect(source).toContain(
      'recurring_charge_runs?id=eq.${runId}&condominium_id=eq.${condominiumId}&select=id',
    );
    expect(source).toContain("'Recurring plan not found in condominium'");
    expect(source).toContain("'Recurring run not found in condominium'");
  });

  it('preserves safe financial input boundaries', () => {
    expect(source).toContain("z.enum(['fixed_per_unit', 'participation_percentage'])");
    expect(source).toContain("z.enum(['condominium', 'building', 'custom'])");
    expect(source).toContain('dueDay must not precede issueDay');
    expect(source).toContain('regex(/^\\d{4}-(0[1-9]|1[0-2])$/)');
  });
});
