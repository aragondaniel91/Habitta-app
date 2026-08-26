import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';

const requiredEnvironment = ['E2E_SUPABASE_URL', 'E2E_SUPABASE_ANON_KEY', 'E2E_FIXTURE_PASSWORD'];
const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);
const supabaseUrl = process.env.E2E_SUPABASE_URL;
const anonKey = process.env.E2E_SUPABASE_ANON_KEY;
const password = process.env.E2E_FIXTURE_PASSWORD;

const ids = {
  condominium: '22222222-2222-4222-8222-222222222221',
  chargeConcept: '66666666-6666-4666-8666-666666666661',
  unitA101: '33333333-3333-4333-8333-333333333331',
  unitA102: '33333333-3333-4333-8333-333333333332',
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
type RecurringPlan = { id: string; starts_on: string; amount: string | number; due_day: number };
type RecurringRun = {
  id: string;
  status: string;
  period: string;
  due_date: string;
  total_amount: string | number | null;
  distribution_snapshot: Array<{ unit_id: string; amount: string | number }> | null;
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

const rpcExpectingFailure = async (
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
  expect(response.ok()).toBe(false);
  return (await response.json()) as { message?: string };
};

const rows = async <T>(request: APIRequestContext, token: string, path: string) => {
  const response = await request.get(`${supabaseUrl}/rest/v1/${path}`, {
    headers: { apikey: anonKey ?? '', Authorization: `Bearer ${token}` },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as T[];
};

/*
 * A run key has to be unique across *executions*, not just across workers and retries. Worker
 * index and retry count both repeat on the next run, so codes built from them collided with the
 * rows the previous run left behind: `financial scope code already exists`. CI never saw it
 * because it starts from a fresh database, but it made the suite impossible to run twice locally.
 */
const executionId = randomUUID().slice(0, 8);
const runKeyFor = (testInfo: { workerIndex: number; retry: number }, prefix = '') =>
  `${prefix}${testInfo.workerIndex}-${testInfo.retry}-${executionId}`;

/*
 * `financial_scopes_single_condominium_scope` is a partial unique index on `condominium_id` alone,
 * so a condominium may hold exactly one scope of kind 'condominium'. Varying the code per run does
 * not help: uniqueness never looked at the code. Creating one unconditionally therefore worked on
 * a fresh database and failed on every retry and every local re-run. Reuse the one that exists.
 */
const condominiumScope = async (request: APIRequestContext, token: string, runKey: string) => {
  const existing = await rows<FinancialScope>(
    request,
    token,
    `financial_scopes?condominium_id=eq.${ids.condominium}&kind=eq.condominium&select=id,code&limit=1`,
  );
  if (existing[0]) return existing[0];

  return rpc<FinancialScope>(request, token, 'create_financial_scope', {
    target: ids.condominium,
    scope_code: `e2e-recurring-${runKey}`,
    scope_name: `E2E recurrente ${runKey}`,
    scope_kind: 'condominium',
    target_building: null,
    target_units: null,
  });
};

test.describe('Cuotas ordinarias recurrentes autenticadas', () => {
  test.skip(
    missingEnvironment.length > 0,
    `Supabase local y fixture financiero requeridos: ${missingEnvironment.join(', ')}`,
  );

  test('edita, congela, aprueba y programa sin reescribir historia publicada', async ({
    request,
  }, testInfo) => {
    const admin = await authenticate(request);
    const runKey = runKeyFor(testInfo);

    const scope = await condominiumScope(request, admin.access_token, runKey);

    const plan = await rpc<RecurringPlan>(
      request,
      admin.access_token,
      'create_recurring_charge_plan',
      {
        target: ids.condominium,
        target_concept: ids.chargeConcept,
        target_scope: scope.id,
        plan_name: `Cuota recurrente E2E ${runKey}`,
        plan_distribution: 'fixed_per_unit',
        plan_amount: '42.00',
        plan_currency: 'USD',
        plan_starts_on: '2026-09-01',
        plan_issue_day: 1,
        plan_due_day: 10,
        plan_ends_on: null,
      },
    );

    const editedPlan = await rpc<RecurringPlan>(
      request,
      admin.access_token,
      'update_recurring_charge_plan',
      {
        target: ids.condominium,
        target_plan: plan.id,
        target_concept: ids.chargeConcept,
        target_scope: scope.id,
        plan_name: `Cuota recurrente E2E editada ${runKey}`,
        plan_distribution: 'fixed_per_unit',
        plan_amount: '45.00',
        plan_currency: 'USD',
        plan_starts_on: '2026-09-01',
        plan_issue_day: 1,
        plan_due_day: 12,
        plan_ends_on: null,
      },
    );
    expect(Number(editedPlan.amount)).toBe(45);
    expect(editedPlan.due_day).toBe(12);

    const initialRuns = await rows<RecurringRun>(
      request,
      admin.access_token,
      `recurring_charge_runs?plan_id=eq.${plan.id}&period=eq.2026-09&select=id,status,period,due_date,total_amount,distribution_snapshot,charge_batch_id`,
    );
    expect(initialRuns).toHaveLength(1);
    const scheduled = initialRuns[0]!;
    expect(scheduled.status).toBe('scheduled');
    expect(scheduled.due_date).toBe('2026-09-12');
    expect(scheduled.charge_batch_id).toBeNull();

    const prepared = await rpc<RecurringRun>(
      request,
      admin.access_token,
      'prepare_recurring_charge_run',
      { target_run: scheduled.id },
    );
    expect(prepared.status).toBe('pending_review');
    expect(Number(prepared.total_amount)).toBe(90);
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
    expect(receivables.reduce((sum, item) => sum + Number(item.original_amount), 0)).toBe(90);

    await rpc<RecurringPlan>(request, admin.access_token, 'update_recurring_charge_plan', {
      target: ids.condominium,
      target_plan: plan.id,
      target_concept: ids.chargeConcept,
      target_scope: scope.id,
      plan_name: `Cuota recurrente E2E futura ${runKey}`,
      plan_distribution: 'fixed_per_unit',
      plan_amount: '50.00',
      plan_currency: 'USD',
      plan_starts_on: '2026-09-01',
      plan_issue_day: 1,
      plan_due_day: 14,
      plan_ends_on: null,
    });

    const postedReceivablesAfterEdit = await rows<{ id: string; original_amount: string }>(
      request,
      admin.access_token,
      `receivable_items?charge_batch_id=eq.${posted.charge_batch_id}&select=id,original_amount`,
    );
    expect(
      postedReceivablesAfterEdit.reduce((sum, item) => sum + Number(item.original_amount), 0),
    ).toBe(90);

    const allRuns = await rows<RecurringRun>(
      request,
      admin.access_token,
      `recurring_charge_runs?plan_id=eq.${plan.id}&select=id,status,period,due_date,total_amount,distribution_snapshot,charge_batch_id&order=period.asc`,
    );
    expect(allRuns.map((run) => [run.period, run.status])).toEqual([
      ['2026-09', 'posted'],
      ['2026-10', 'scheduled'],
    ]);
    expect(allRuns[0]?.total_amount && Number(allRuns[0].total_amount)).toBe(90);
    expect(allRuns[1]?.due_date).toBe('2026-10-14');
    expect(allRuns[1]?.charge_batch_id).toBeNull();
  });
  test('edita la membresía de un ámbito sin tocar el período ya publicado', async ({
    request,
  }, testInfo) => {
    const admin = await authenticate(request);
    const runKey = runKeyFor(testInfo, 'scope-');

    const scope = await rpc<FinancialScope>(request, admin.access_token, 'create_financial_scope', {
      target: ids.condominium,
      scope_code: `e2e-scope-${runKey}`,
      scope_name: `E2E ámbito ${runKey}`,
      scope_kind: 'custom',
      target_building: null,
      target_units: [ids.unitA101, ids.unitA102],
    });

    const plan = await rpc<RecurringPlan>(
      request,
      admin.access_token,
      'create_recurring_charge_plan',
      {
        target: ids.condominium,
        target_concept: ids.chargeConcept,
        target_scope: scope.id,
        plan_name: `Cuota ámbito E2E ${runKey}`,
        plan_distribution: 'fixed_per_unit',
        plan_amount: '30.00',
        plan_currency: 'USD',
        plan_starts_on: '2026-09-01',
        plan_issue_day: 1,
        plan_due_day: 10,
        plan_ends_on: null,
      },
    );

    const [scheduledA] = await rows<RecurringRun>(
      request,
      admin.access_token,
      `recurring_charge_runs?plan_id=eq.${plan.id}&period=eq.2026-09&select=id,status,period,due_date,total_amount,distribution_snapshot,charge_batch_id`,
    );
    const preparedA = await rpc<RecurringRun>(
      request,
      admin.access_token,
      'prepare_recurring_charge_run',
      { target_run: scheduledA!.id },
    );
    expect(preparedA.status).toBe('pending_review');
    expect(preparedA.distribution_snapshot).toHaveLength(2);

    // A reviewed allocation freezes the scope: the guard must reject the edit, not silently apply.
    const blocked = await rpcExpectingFailure(
      request,
      admin.access_token,
      'update_financial_scope',
      {
        target: ids.condominium,
        target_scope: scope.id,
        scope_code: `e2e-scope-${runKey}`,
        scope_name: `E2E ámbito ${runKey}`,
        scope_kind: 'custom',
        target_building: null,
        target_units: [ids.unitA101],
        scope_active: true,
      },
    );
    expect(blocked.message).toBe('financial scope has pending review run');

    const postedA = await rpc<RecurringRun>(
      request,
      admin.access_token,
      'post_recurring_charge_run',
      { target_run: scheduledA!.id },
    );
    expect(postedA.status).toBe('posted');
    expect(Number(postedA.total_amount)).toBe(60);

    await rpc<FinancialScope>(request, admin.access_token, 'update_financial_scope', {
      target: ids.condominium,
      target_scope: scope.id,
      scope_code: `e2e-scope-${runKey}`,
      scope_name: `E2E ámbito editado ${runKey}`,
      scope_kind: 'custom',
      target_building: null,
      target_units: [ids.unitA101],
      scope_active: true,
    });

    const membership = await rows<{ unit_id: string }>(
      request,
      admin.access_token,
      `financial_scope_units?scope_id=eq.${scope.id}&select=unit_id`,
    );
    expect(membership.map((row) => row.unit_id)).toEqual([ids.unitA101]);

    const [periodAAfterEdit] = await rows<RecurringRun>(
      request,
      admin.access_token,
      `recurring_charge_runs?id=eq.${scheduledA!.id}&select=id,status,period,due_date,total_amount,distribution_snapshot,charge_batch_id`,
    );
    expect(Number(periodAAfterEdit!.total_amount)).toBe(60);
    expect(periodAAfterEdit!.distribution_snapshot).toHaveLength(2);
    expect(periodAAfterEdit!.charge_batch_id).toBe(postedA.charge_batch_id);

    const receivablesA = await rows<{ id: string; original_amount: string }>(
      request,
      admin.access_token,
      `receivable_items?charge_batch_id=eq.${postedA.charge_batch_id}&select=id,original_amount`,
    );
    expect(receivablesA).toHaveLength(2);
    expect(receivablesA.reduce((sum, item) => sum + Number(item.original_amount), 0)).toBe(60);

    const scheduledB = await rpc<RecurringRun>(
      request,
      admin.access_token,
      'schedule_recurring_charge_run',
      { target_plan: plan.id, target_period: '2026-10' },
    );
    const preparedB = await rpc<RecurringRun>(
      request,
      admin.access_token,
      'prepare_recurring_charge_run',
      { target_run: scheduledB.id },
    );
    expect(preparedB.distribution_snapshot).toHaveLength(1);
    expect(Number(preparedB.total_amount)).toBe(30);
    expect(preparedB.distribution_snapshot?.[0]?.unit_id).toBe(ids.unitA101);

    // The reviewed period has to be resolved first: the pending-review guard runs before the
    // dependency guard, so publishing B is what makes the archive attempt reach it.
    await rpc<RecurringRun>(request, admin.access_token, 'post_recurring_charge_run', {
      target_run: scheduledB.id,
    });

    // Archiving must stay closed while an active plan still depends on the scope.
    const archiveBlocked = await rpcExpectingFailure(
      request,
      admin.access_token,
      'update_financial_scope',
      {
        target: ids.condominium,
        target_scope: scope.id,
        scope_code: `e2e-scope-${runKey}`,
        scope_name: `E2E ámbito editado ${runKey}`,
        scope_kind: 'custom',
        target_building: null,
        target_units: [ids.unitA101],
        scope_active: false,
      },
    );
    expect(archiveBlocked.message).toBe('active recurring plan requires financial scope');
  });
  test('detiene una cuota recurrente sin borrar lo ya publicado', async ({ request }, testInfo) => {
    const admin = await authenticate(request);
    const runKey = runKeyFor(testInfo, 'stop-');

    const scope = await rpc<FinancialScope>(request, admin.access_token, 'create_financial_scope', {
      target: ids.condominium,
      scope_code: `e2e-stop-${runKey}`,
      scope_name: `E2E detener ${runKey}`,
      scope_kind: 'custom',
      target_building: null,
      target_units: [ids.unitA101],
    });

    const plan = await rpc<RecurringPlan>(
      request,
      admin.access_token,
      'create_recurring_charge_plan',
      {
        target: ids.condominium,
        target_concept: ids.chargeConcept,
        target_scope: scope.id,
        plan_name: `Cuota detenible E2E ${runKey}`,
        plan_distribution: 'fixed_per_unit',
        plan_amount: '25.00',
        plan_currency: 'USD',
        plan_starts_on: '2026-09-01',
        plan_issue_day: 1,
        plan_due_day: 10,
        plan_ends_on: null,
      },
    );

    const [scheduledA] = await rows<RecurringRun>(
      request,
      admin.access_token,
      `recurring_charge_runs?plan_id=eq.${plan.id}&period=eq.2026-09&select=id,status,period,due_date,total_amount,distribution_snapshot,charge_batch_id`,
    );
    await rpc<RecurringRun>(request, admin.access_token, 'prepare_recurring_charge_run', {
      target_run: scheduledA!.id,
    });

    // A reviewed period must not be stopped from underneath the reviewer.
    const blocked = await rpcExpectingFailure(
      request,
      admin.access_token,
      'set_recurring_charge_plan_status',
      { target: ids.condominium, target_plan: plan.id, plan_active: false },
    );
    expect(blocked.message).toBe('recurring plan has pending review run');

    const postedA = await rpc<RecurringRun>(
      request,
      admin.access_token,
      'post_recurring_charge_run',
      { target_run: scheduledA!.id },
    );
    expect(Number(postedA.total_amount)).toBe(25);

    await rpc<RecurringRun>(request, admin.access_token, 'schedule_recurring_charge_run', {
      target_plan: plan.id,
      target_period: '2026-10',
    });

    await rpc<RecurringPlan>(request, admin.access_token, 'set_recurring_charge_plan_status', {
      target: ids.condominium,
      target_plan: plan.id,
      plan_active: false,
    });

    const runsAfterStop = await rows<RecurringRun>(
      request,
      admin.access_token,
      `recurring_charge_runs?plan_id=eq.${plan.id}&select=id,status,period,due_date,total_amount,distribution_snapshot,charge_batch_id&order=period.asc`,
    );
    expect(runsAfterStop.map((run) => [run.period, run.status])).toEqual([
      ['2026-09', 'posted'],
      ['2026-10', 'cancelled'],
    ]);
    expect(Number(runsAfterStop[0]!.total_amount)).toBe(25);
    expect(runsAfterStop[0]!.charge_batch_id).toBe(postedA.charge_batch_id);

    const receivablesA = await rows<{ id: string; original_amount: string }>(
      request,
      admin.access_token,
      `receivable_items?charge_batch_id=eq.${postedA.charge_batch_id}&select=id,original_amount`,
    );
    expect(receivablesA.reduce((sum, item) => sum + Number(item.original_amount), 0)).toBe(25);

    const scheduleAfterStop = await rpcExpectingFailure(
      request,
      admin.access_token,
      'schedule_recurring_charge_run',
      { target_plan: plan.id, target_period: '2026-11' },
    );
    expect(scheduleAfterStop.message).toBe('period outside active plan');

    // With no active plan left, HAB-355's archive guard finally lets the scope go.
    await rpc<FinancialScope>(request, admin.access_token, 'update_financial_scope', {
      target: ids.condominium,
      target_scope: scope.id,
      scope_code: `e2e-stop-${runKey}`,
      scope_name: `E2E detener ${runKey}`,
      scope_kind: 'custom',
      target_building: null,
      target_units: [ids.unitA101],
      scope_active: false,
    });

    const [archived] = await rows<{ is_active: boolean }>(
      request,
      admin.access_token,
      `financial_scopes?id=eq.${scope.id}&select=is_active`,
    );
    expect(archived!.is_active).toBe(false);
  });
});
