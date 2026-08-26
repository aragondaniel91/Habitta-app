import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  normalizeRecurringMoneyInput,
  recurringDomainFailureFromPostgrest,
} from './recurring-dues-routes';
import { app as securityApp } from './security-entry';

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
    expect(source).toContain("patch('/:id/recurring-charge-plans/:planId'");
    expect(source).toContain("get('/:id/recurring-charge-runs'");
    expect(source).toContain("rpc(c, 'create_financial_scope'");
    expect(source).toContain("rpc(c, 'create_recurring_charge_plan'");
    expect(source).toContain("rpc(c, 'update_recurring_charge_plan'");
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

describe('HAB-349 recurring numeric amount compatibility', () => {
  it('normalizes canonical JSON numbers emitted by PostgREST into the existing money string contract', () => {
    expect(normalizeRecurringMoneyInput(30)).toBe('30');
    expect(normalizeRecurringMoneyInput(30.5)).toBe('30.5');
    expect(normalizeRecurringMoneyInput(0.29)).toBe('0.29');
    expect(normalizeRecurringMoneyInput('30.00')).toBe('30.00');
    expect(source).toContain('z.preprocess(\n  normalizeRecurringMoneyInput');
    expect(source).toContain('amount: moneySchema');
  });

  it('does not coerce imprecise, non-positive, non-finite, or unsafe numeric amounts', () => {
    expect(normalizeRecurringMoneyInput(30.123)).toBe(30.123);
    expect(normalizeRecurringMoneyInput(0)).toBe(0);
    expect(normalizeRecurringMoneyInput(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
    expect(normalizeRecurringMoneyInput(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('HAB-352 recurring plan edits', () => {
  it('uses a condominium-scoped PATCH route backed only by the secured update RPC', () => {
    expect(source).toContain("patch('/:id/recurring-charge-plans/:planId'");
    expect(source).toContain("rpc(c, 'update_recurring_charge_plan'");
    expect(source).toContain('target_plan: planId');
    expect(source).toContain('return rpcResult(c, response, 200)');
  });

  it('maps edit lifecycle conflicts to actionable safe messages', () => {
    expect(
      recurringDomainFailureFromPostgrest({ message: 'recurring plan has pending review run' }),
    ).toEqual({
      status: 409,
      error: 'recurring_plan_pending_review',
      publicMessage:
        'Hay una cuota de este plan pendiente de revisión. Publícala o resuélvela antes de editar la configuración.',
    });
    expect(
      recurringDomainFailureFromPostgrest({
        message: 'posted recurring history outside edited plan',
      }),
    ).toMatchObject({ status: 409, error: 'recurring_plan_posted_history_conflict' });
    expect(
      recurringDomainFailureFromPostgrest({
        message: 'scheduled recurring period outside edited plan',
      }),
    ).toMatchObject({ status: 409, error: 'recurring_plan_scheduled_period_conflict' });
  });
});

const CONDOMINIUM = '00000000-0000-4000-8000-000000000355';
const SCOPE = '00000000-0000-4000-8000-000000000356';

type UpstreamHandler = (url: string, init?: RequestInit) => Response;

const withUpstream = (handler: UpstreamHandler) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.includes('/auth/v1/user'))
      return new Response(JSON.stringify({ id: CONDOMINIUM }), { status: 200 });
    return handler(url, init);
  });

const patchScope = (body: unknown) =>
  securityApp.fetch(
    new Request(`http://api.test/v1/condominiums/${CONDOMINIUM}/financial-scopes/${SCOPE}`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    {
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_ANON_KEY: 'anon',
      APP_ENV: 'production',
    } as never,
  );

const PLAN = '00000000-0000-4000-8000-000000000359';

const patchPlanStatus = (body: unknown) =>
  securityApp.fetch(
    new Request(
      `http://api.test/v1/condominiums/${CONDOMINIUM}/recurring-charge-plans/${PLAN}/status`,
      {
        method: 'PATCH',
        headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    ),
    {
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_ANON_KEY: 'anon',
      APP_ENV: 'production',
    } as never,
  );

const validScopeBody = {
  code: 'general',
  name: 'Condominio general',
  kind: 'condominium',
  isActive: true,
};

describe('HAB-355 financial scope edit API contract', () => {
  afterEach(() => vi.restoreAllMocks());

  it('exposes a guarded PATCH that only reaches the protected RPC', () => {
    expect(source).toContain("patch('/:id/financial-scopes/:scopeId'");
    expect(source).toContain("rpc(c, 'update_financial_scope'");
    expect(source).toContain('target_scope: scopeId');
    expect(source).toContain(
      'financial_scopes?id=eq.${scopeId}&condominium_id=eq.${condominiumId}&select=id',
    );
    expect(source).toContain("'Financial scope not found in condominium'");
  });

  it('never writes financial scope tables directly', () => {
    expect(source).not.toMatch(
      /rest\(c,\s*`?(financial_scopes|financial_scope_units)[^)]*\{\s*method:\s*'(POST|PUT|PATCH|DELETE)'/s,
    );
    expect(source).not.toContain("method: 'DELETE'");
  });

  it('prefills custom membership without an N+1 lookup', () => {
    expect(source).toContain('select=*,financial_scope_units(unit_id)');
  });

  it('rejects a scope from another condominium before calling the RPC', async () => {
    const calls: string[] = [];
    withUpstream((url) => {
      calls.push(url);
      return new Response('[]', { status: 200 });
    });

    const response = await patchScope(validScopeBody);

    expect(response.status).toBe(404);
    expect(calls.some((url) => url.includes('rpc/update_financial_scope'))).toBe(false);
  });

  it('translates every scope lifecycle conflict into an actionable message', async () => {
    const cases = [
      ['financial scope has pending review run', 409, 'financial_scope_pending_review'],
      ['active recurring plan requires financial scope', 409, 'financial_scope_active_plan'],
      ['financial scope unavailable', 409, 'financial_scope_unavailable'],
      ['invalid financial scope configuration', 422, 'financial_scope_invalid'],
      ['financial scope code already exists', 409, 'financial_scope_code_taken'],
      ['condominium financial scope already exists', 409, 'financial_scope_condominium_taken'],
      ['building financial scope already exists', 409, 'financial_scope_building_taken'],
    ] as const;

    for (const [message, status, error] of cases) {
      vi.restoreAllMocks();
      withUpstream((url) =>
        url.includes('rpc/update_financial_scope')
          ? new Response(JSON.stringify({ code: 'P0001', message, details: null, hint: null }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            })
          : new Response(JSON.stringify([{ id: SCOPE }]), { status: 200 }),
      );

      const response = await patchScope(validScopeBody);
      const payload = (await response.json()) as { error: string; publicMessage?: string };

      expect(response.status).toBe(status);
      expect(payload.error).toBe(error);
      expect(payload.publicMessage).toBeTypeOf('string');
      expect(payload.publicMessage).not.toMatch(/duplicate key|constraint|P0001|null value/i);
    }
  });

  it('keeps unknown upstream failures fail-closed without leaking internals', async () => {
    withUpstream((url) =>
      url.includes('rpc/update_financial_scope')
        ? new Response(
            JSON.stringify({
              code: '23505',
              message: 'duplicate key value violates unique constraint "financial_scopes_pkey"',
              details: 'Key (id)=(1) already exists.',
              hint: null,
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          )
        : new Response(JSON.stringify([{ id: SCOPE }]), { status: 200 }),
    );

    const response = await patchScope(validScopeBody);
    const body = await response.text();

    expect(response.status).toBe(400);
    expect(body).not.toMatch(/duplicate key|constraint|Key \(id\)/);
  });

  it('requires an explicit activation flag and a coherent scope shape', async () => {
    withUpstream(() => new Response(JSON.stringify([{ id: SCOPE }]), { status: 200 }));

    const missingActive = await patchScope({
      code: 'general',
      name: 'Condominio general',
      kind: 'condominium',
    });
    expect(missingActive.status).toBe(400);

    const unitsOnCondominiumScope = await patchScope({
      ...validScopeBody,
      unitIds: ['00000000-0000-4000-8000-000000000357'],
    });
    expect(unitsOnCondominiumScope.status).toBe(400);

    const buildingWithoutId = await patchScope({ ...validScopeBody, kind: 'building' });
    expect(buildingWithoutId.status).toBe(400);
  });
});

describe('HAB-359 recurring plan status API contract', () => {
  afterEach(() => vi.restoreAllMocks());

  it('exposes a guarded status transition that only reaches the protected RPC', () => {
    expect(source).toContain("patch('/:id/recurring-charge-plans/:planId/status'");
    expect(source).toContain("rpc(c, 'set_recurring_charge_plan_status'");
    expect(source).toContain('plan_active: parsed.isActive');
    expect(source).toContain(
      'recurring_charge_plans?id=eq.${planId}&condominium_id=eq.${condominiumId}&select=id',
    );
    expect(source).not.toMatch(
      /rest\(c,\s*`?recurring_charge_plans[^)]*\{\s*method:\s*'(POST|PUT|PATCH|DELETE)'/s,
    );
  });

  it('requires an explicit boolean instead of guessing the transition', async () => {
    withUpstream(() => new Response(JSON.stringify([{ id: PLAN }]), { status: 200 }));

    const missing = await patchPlanStatus({});
    expect(missing.status).toBe(400);

    const wrongType = await patchPlanStatus({ isActive: 'yes' });
    expect(wrongType.status).toBe(400);
  });

  it('rejects a plan from another condominium before calling the RPC', async () => {
    const calls: string[] = [];
    withUpstream((url) => {
      calls.push(url);
      return new Response('[]', { status: 200 });
    });

    const response = await patchPlanStatus({ isActive: false });

    expect(response.status).toBe(404);
    expect(calls.some((url) => url.includes('rpc/set_recurring_charge_plan_status'))).toBe(false);
  });

  it('explains every stop conflict without leaking database internals', async () => {
    const cases = [
      ['recurring plan has pending review run', 409, 'recurring_plan_pending_review'],
      ['recurring plan unavailable', 409, 'recurring_plan_unavailable'],
      ['concept or financial scope unavailable', 409, 'recurring_plan_dependency_unavailable'],
      ['invalid recurring plan status', 422, 'recurring_plan_status_invalid'],
    ] as const;

    for (const [message, status, error] of cases) {
      vi.restoreAllMocks();
      withUpstream((url) =>
        url.includes('rpc/set_recurring_charge_plan_status')
          ? new Response(JSON.stringify({ code: 'P0001', message, details: null, hint: null }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            })
          : new Response(JSON.stringify([{ id: PLAN }]), { status: 200 }),
      );

      const response = await patchPlanStatus({ isActive: false });
      const payload = (await response.json()) as { error: string; publicMessage?: string };

      expect(response.status).toBe(status);
      expect(payload.error).toBe(error);
      expect(payload.publicMessage).toBeTypeOf('string');
      expect(payload.publicMessage).not.toMatch(/duplicate key|constraint|P0001|pg_/i);
    }
  });
});
