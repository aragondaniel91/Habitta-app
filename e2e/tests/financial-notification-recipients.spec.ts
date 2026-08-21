import { expect, test, type APIRequestContext } from '@playwright/test';
import { spawnSync } from 'node:child_process';

const requiredEnvironment = ['E2E_SUPABASE_URL', 'E2E_SUPABASE_ANON_KEY', 'E2E_FIXTURE_PASSWORD'];
const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);
const supabaseUrl = process.env.E2E_SUPABASE_URL;
const anonKey = process.env.E2E_SUPABASE_ANON_KEY;
const password = process.env.E2E_FIXTURE_PASSWORD;

const ids = {
  condominium: '22222222-2222-4222-8222-222222222221',
  unit: '33333333-3333-4333-8333-333333333331',
  payerPerson: '44444444-4444-4444-8444-444444444441',
  additionalPerson: '44444444-4444-4444-8444-444444444442',
  unrelatedPerson: '44444444-4444-4444-8444-444444444443',
  concept: '66666666-6666-4666-8666-666666666661',
};

const emails = {
  administrator: 'habitta-e2e-admin@example.invalid',
  payer: 'habitta-e2e-payer@example.invalid',
  additional: 'habitta-e2e-additional@example.invalid',
  unrelated: 'habitta-e2e-unrelated@example.invalid',
};

if (supabaseUrl) {
  const target = new URL(supabaseUrl);
  if (!['127.0.0.1', 'localhost'].includes(target.hostname) || target.port !== '54321') {
    throw new Error(
      `Financial E2E requires local Supabase at localhost:54321, received ${target.host}`,
    );
  }
}

type AuthSession = { access_token: string };

const authenticate = async (request: APIRequestContext, email: string) => {
  const response = await request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: { apikey: anonKey ?? '', 'Content-Type': 'application/json' },
    data: { email, password },
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

const notificationCount = async (request: APIRequestContext, token: string) => {
  const response = await request.get(
    `${supabaseUrl}/rest/v1/notifications?condominium_id=eq.${ids.condominium}&notification_type=eq.receivable_created&select=id`,
    { headers: { apikey: anonKey ?? '', Authorization: `Bearer ${token}` } },
  );
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { id: string }[]).length;
};

const expandLocalEvents = () => {
  const result = spawnSync('node', ['scripts/expand-notification-events.mjs'], {
    cwd: new URL('../', import.meta.url),
    encoding: 'utf8',
  });
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
};

test.describe('Destinatarios financieros explícitos', () => {
  test.skip(
    missingEnvironment.length > 0,
    `Supabase local y fixture financiero requeridos: ${missingEnvironment.join(', ')}`,
  );

  test('entrega a principal y adicional, excluye al no relacionado y vuelve al fallback', async ({
    request,
  }) => {
    const [administrator, payer, additional, unrelated] = await Promise.all([
      authenticate(request, emails.administrator),
      authenticate(request, emails.payer),
      authenticate(request, emails.additional),
      authenticate(request, emails.unrelated),
    ]);

    expandLocalEvents();
    const baseline = await Promise.all([
      notificationCount(request, payer.access_token),
      notificationCount(request, additional.access_token),
      notificationCount(request, unrelated.access_token),
    ]);

    await rpc(request, administrator.access_token, 'set_unit_communication_assignment', {
      target_condominium: ids.condominium,
      target_unit: ids.unit,
      target_person: ids.payerPerson,
      target_financial_role: 'primary',
      target_general_recipient: false,
    });
    await rpc(request, administrator.access_token, 'set_unit_communication_assignment', {
      target_condominium: ids.condominium,
      target_unit: ids.unit,
      target_person: ids.additionalPerson,
      target_financial_role: 'additional',
      target_general_recipient: false,
    });
    await rpc(request, administrator.access_token, 'create_receivable_item', {
      target: ids.condominium,
      target_unit: ids.unit,
      target_concept: ids.concept,
      item_description: 'HAB-239 explicit notification recipients',
      item_amount: '1.00',
      item_currency: 'USD',
      item_issue: '2026-08-20',
      item_due: '2026-08-21',
    });
    expandLocalEvents();
    await expect.poll(() => notificationCount(request, payer.access_token)).toBe(baseline[0] + 1);
    await expect
      .poll(() => notificationCount(request, additional.access_token))
      .toBe(baseline[1] + 1);
    await expect.poll(() => notificationCount(request, unrelated.access_token)).toBe(baseline[2]);

    await rpc(request, administrator.access_token, 'set_unit_communication_assignment', {
      target_condominium: ids.condominium,
      target_unit: ids.unit,
      target_person: ids.additionalPerson,
      target_financial_role: 'none',
      target_general_recipient: false,
    });
    await rpc(request, administrator.access_token, 'set_unit_communication_assignment', {
      target_condominium: ids.condominium,
      target_unit: ids.unit,
      target_person: ids.payerPerson,
      target_financial_role: 'none',
      target_general_recipient: false,
    });
    await rpc(request, administrator.access_token, 'create_receivable_item', {
      target: ids.condominium,
      target_unit: ids.unit,
      target_concept: ids.concept,
      item_description: 'HAB-239 legacy notification recipients',
      item_amount: '1.00',
      item_currency: 'USD',
      item_issue: '2026-08-20',
      item_due: '2026-08-21',
    });
    expandLocalEvents();
    await expect.poll(() => notificationCount(request, payer.access_token)).toBe(baseline[0] + 2);
    await expect
      .poll(() => notificationCount(request, additional.access_token))
      .toBe(baseline[1] + 2);
    await expect.poll(() => notificationCount(request, unrelated.access_token)).toBe(baseline[2]);
  });
});
