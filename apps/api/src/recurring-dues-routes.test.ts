import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { recurringDomainFailureFromPostgrest } from './recurring-dues-routes';

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

describe('HAB-347 recurring dues domain errors', () => {
  it('maps incomplete participation to an actionable validation error', () => {
    expect(
      recurringDomainFailureFromPostgrest({
        message: 'all scoped units require a participation percentage',
      }),
    ).toEqual({
      status: 422,
      error: 'recurring_participation_incomplete',
      publicMessage:
        'Todas las unidades del ámbito necesitan una alícuota de participación antes de preparar la cuota.',
    });
  });

  it('maps plan validity and lifecycle conflicts without exposing database text', () => {
    expect(recurringDomainFailureFromPostgrest({ message: 'period outside active plan' })).toEqual({
      status: 409,
      error: 'recurring_period_outside_plan',
      publicMessage: 'Ese período está fuera de la vigencia del plan recurrente.',
    });
    expect(
      recurringDomainFailureFromPostgrest({
        message: 'recurring charge run must be reviewed before posting',
      }),
    ).toMatchObject({
      status: 409,
      error: 'recurring_run_requires_review',
    });
    expect(
      recurringDomainFailureFromPostgrest({
        message: 'only scheduled recurring runs can be prepared',
      }),
    ).toMatchObject({
      status: 409,
      error: 'recurring_run_not_preparable',
    });
  });

  it('maps authorization failures to forbidden', () => {
    expect(recurringDomainFailureFromPostgrest({ message: 'permission denied' })).toEqual({
      status: 403,
      error: 'recurring_dues_forbidden',
      publicMessage: 'No tienes permisos para realizar esta acción.',
    });
  });

  it('fails closed for unknown PostgREST or PostgreSQL messages', () => {
    expect(
      recurringDomainFailureFromPostgrest({
        message: 'duplicate key value violates unique constraint secret_internal_name',
        details: 'sensitive row data',
        hint: 'sensitive hint',
      }),
    ).toBeNull();
    expect(recurringDomainFailureFromPostgrest({ message: 123 })).toBeNull();
    expect(recurringDomainFailureFromPostgrest(null)).toBeNull();
    expect(source).toContain("return c.json({ error: 'recurring_dues_operation_failed' }, 400)");
    expect(source).not.toContain('publicMessage: message');
  });

  it('routes recurring RPC mutations through the safe response boundary', () => {
    expect(source).toContain('return rpcResult(c, response, 201)');
    expect(source).toContain('return rpcResult(c, response, 200)');
    expect(source).toContain("error: 'recurring_dues_upstream_failure'");
  });
});
