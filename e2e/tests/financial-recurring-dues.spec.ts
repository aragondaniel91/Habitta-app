import { expect, test, type APIRequestContext } from '@playwright/test';

const requiredEnvironment = ['E2E_SUPABASE_URL', 'E2E_SUPABASE_ANON_KEY', 'E2E_FIXTURE_PASSWORD'];
const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);
const supabaseUrl = process.env.E2E_SUPABASE_URL;
const anonKey = process.env.E2E_SUPABASE_ANON_KEY;
const password = process.env.E2E_FIXTURE_PASSWORD;

const ids = {
  condominium: '22222222-2222-4222-8222-222222222221',
  chargeConcept: '66666666-6666-4666-8666-666666666661',
};

const adminEmail = 'habitta-e2e-admin@example.invalid';

if (supabaseUrl) {
  const target = new URL(supabaseUrl);
  if (!['127.0.0.1', 'localhost'].includes(target.hostname) || target.port !== '54321') {
    throw new Error(
      `Financial E2E requires local Supabase at localhost:54321, received ${target.host}`,
    );
  }
}

type AuthSession = { access_token: string };
type FinancialScope = { id: string; code: string };
type RecurringPlan = { id: string; starts_on: string };
type RecurringRun = {
  id: string;
  status: string;
  period: string;
  total_amount: string | null;
  distribution_snapshot: Array<{ unit_id: string; amount: string }> | null;
  charge_batch_id: string | null;
};

const authenticate = async (request: APIRequestContext) => {
  const response = await request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: { apikey: anonKey ?? '', 'Content-Type': 'application/json' },
    data: { email: adminEmail, password },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as AuthSession;
};

const rpc = async <T>(
  request: APIRequestContext,
  token: string,
  functionName: string,
  data: Record<string, unknown>,
) => {
  const response = await request.post(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
    headers: {
      apikey: anonKey ?? '',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data,
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as T;
};

const rows = async <T>(request: APIRequestContext, token: string, path: string) => {
  const response = await request.get(`${supabaseUrl}/rest/v1/${path}`, {
    headers: { apikey: anonKey ?? '', Authorization: `Bearer ${token}` },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as T[];
};

test.describe('Cuotas ordinarias recurrentes autenticadas', () => {
  test.skip(
    missingEnvironment.length > 0,
    `Supabase local y fixture financiero requeridos: ${missingEnvironment.join(', ')}`,
  );

  test('planifica, congela, aprueba y programa automáticamente el siguiente período', async ({
    request,
  }) => {
    const admin = await authenticate(request);

    const scope = await rpc<FinancialScope>(request, admin.access_token, 'create_financial_scope', {
      target: ids.condominium,
      scope_code: 'e2e-recurring-general',
      scope_name: 'E2E recurrente general',
      scope_kind: 'condominium',
      target_building: null,
      target_units: null,
    });

    const plan = await rpc<RecurringPlan>(
      request,
      admin.access_token,
      'create_recurring_charge_plan',
      {
        target: ids.condominium,
        target_concept: ids.chargeConcept,
        target_scope: scope.id,
        plan_name: 'Cuota recurrente E2E',
        plan_distribution: 'fixed_per_unit',
        plan_amount: '42.00',
        plan_currency: 'USD',
        plan_starts_on: '2026-09-01',
        plan_issue_day: 1,
        plan_due_day: 10,
        plan_ends_on: null,
      },
    );

    const initialRuns = await rows<RecurringRun>(
      request,
      admin.access_token,
      `recurring_charge_runs?plan_id=eq.${plan.id}&period=eq.2026-09&select=id,status,period,total_amount,distribution_snapshot,charge_batch_id`,
    );
    expect(initialRuns).toHaveLength(1);
    const scheduled = initialRuns[0]!;
    expect(scheduled.status).toBe('scheduled');
    expect(scheduled.charge_batch_id).toBeNull();

    const prepared = await rpc<RecurringRun>(
      request,
      admin.access_token,
      'prepare_recurring_charge_run',
      { target_run: scheduled.id },
    );
    expect(prepared.status).toBe('pending_review');
    expect(prepared.total_amount).toBe('84.00');
    expect(prepared.distribution_snapshot).toHaveLength(2);
    expect(prepared.charge_batch_id).toBeNull();

    const posted = await rpc<RecurringRun>(
      request,
      admin.access_token,
      'post_recurring_charge_run',
      { target_run: scheduled.id },
    );
    expect(posted.status).toBe('posted');
    expect(posted.charge_batch_id).toBeTruthy();

    const receivables = await rows<{ id: string; original_amount: string }>(
      request,
      admin.access_token,
      `receivable_items?charge_batch_id=eq.${posted.charge_batch_id}&select=id,original_amount`,
    );
    expect(receivables).toHaveLength(2);
    expect(receivables.reduce((sum, item) => sum + Number(item.original_amount), 0)).toBe(84);

    const allRuns = await rows<RecurringRun>(
      request,
      admin.access_token,
      `recurring_charge_runs?plan_id=eq.${plan.id}&select=id,status,period,total_amount,distribution_snapshot,charge_batch_id&order=period.asc`,
    );
    expect(allRuns.map((run) => [run.period, run.status])).toEqual([
      ['2026-09', 'posted'],
      ['2026-10', 'scheduled'],
    ]);
    expect(allRuns[1]?.charge_batch_id).toBeNull();
  });
});
