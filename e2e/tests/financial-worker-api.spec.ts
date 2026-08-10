import { expect, test, type APIRequestContext } from '@playwright/test';

// The sibling financial-payment-lifecycle spec drives Supabase directly and therefore proves the
// database rules. This one drives the same money through the Cloudflare Worker so that the layer
// the browser actually talks to — Zod validation, the bearer guard, authorization propagation and
// the PostgREST error redaction in security-entry — is covered too.

const requiredEnvironment = ['E2E_SUPABASE_URL', 'E2E_SUPABASE_ANON_KEY', 'E2E_FIXTURE_PASSWORD'];
const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);
const supabaseUrl = process.env.E2E_SUPABASE_URL;
const anonKey = process.env.E2E_SUPABASE_ANON_KEY;
const password = process.env.E2E_FIXTURE_PASSWORD;
const apiBaseUrl = process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:8787';

const localHosts = ['127.0.0.1', 'localhost'];

if (supabaseUrl) {
  const target = new URL(supabaseUrl);
  if (!localHosts.includes(target.hostname) || target.port !== '54321') {
    throw new Error(
      `Financial E2E requires local Supabase at localhost:54321, received ${target.host}`,
    );
  }
}

{
  const target = new URL(apiBaseUrl);
  if (!localHosts.includes(target.hostname)) {
    throw new Error(`Financial E2E requires a local Worker, received ${target.host}`);
  }
}

const ids = {
  primaryCondominium: '22222222-2222-4222-8222-222222222221',
  secondaryUnit: '33333333-3333-4333-8333-333333333332',
  paymentMethod: '77777777-7777-4777-8777-777777777771',
  chargeConcept: '66666666-6666-4666-8666-666666666661',
};

const emails = {
  administrator: 'habitta-e2e-admin@example.invalid',
  reviewer: 'habitta-e2e-reviewer@example.invalid',
  isolation: 'habitta-e2e-isolation@example.invalid',
};

type Json = Record<string, unknown>;

const authenticate = async (request: APIRequestContext, email: string) => {
  const response = await request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: { apikey: anonKey ?? '', 'Content-Type': 'application/json' },
    data: { email, password },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { access_token: string }).access_token;
};

const worker = (request: APIRequestContext, token: string | null, path: string, init?: Json) =>
  request.fetch(`${apiBaseUrl}${path}`, {
    method: (init?.method as string) ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(init?.data ? { data: init.data } : {}),
  });

test.describe('Ciclo financiero a través del Worker', () => {
  test.skip(
    missingEnvironment.length > 0,
    `Supabase local y fixture financiero requeridos: ${missingEnvironment.join(', ')}`,
  );

  test('rechaza peticiones sin un token válido', async ({ request }) => {
    const anonymous = await worker(request, null, `/v1/condominiums/${ids.primaryCondominium}`);
    expect(anonymous.status()).toBe(401);

    const forged = await worker(
      request,
      'not-a-real-token',
      `/v1/condominiums/${ids.primaryCondominium}`,
    );
    expect(forged.status()).toBe(401);
  });

  test('rechaza identificadores y cuerpos inválidos antes de tocar la base', async ({
    request,
  }) => {
    const token = await authenticate(request, emails.administrator);

    const malformedPath = await worker(request, token, '/v1/condominiums/no-es-uuid/payments');
    expect(malformedPath.status()).toBe(400);

    const malformedBody = await worker(
      request,
      token,
      `/v1/condominiums/${ids.primaryCondominium}/payments`,
      { method: 'POST', data: { unitId: ids.secondaryUnit, originalAmount: 'muchísimo' } },
    );
    expect(malformedBody.status()).toBe(400);
  });

  test('no expone detalles de PostgREST cuando la autorización falla', async ({ request }) => {
    const administrator = await authenticate(request, emails.administrator);
    const outsider = await authenticate(request, emails.isolation);

    const receivable = await worker(
      request,
      administrator,
      `/v1/condominiums/${ids.primaryCondominium}/receivables`,
      {
        method: 'POST',
        data: {
          unitId: ids.secondaryUnit,
          conceptId: ids.chargeConcept,
          description: 'Cuota de aislamiento E2E',
          amount: '10.00',
          currencyCode: 'USD',
          issueDate: '2026-08-06',
        },
      },
    );
    expect(receivable.status()).toBe(201);

    const denied = await worker(
      request,
      outsider,
      `/v1/condominiums/${ids.primaryCondominium}/receivables`,
      {
        method: 'POST',
        data: {
          unitId: ids.secondaryUnit,
          conceptId: ids.chargeConcept,
          description: 'Cuota creada por un extraño',
          amount: '10.00',
          currencyCode: 'USD',
          issueDate: '2026-08-06',
        },
      },
    );
    expect(denied.ok()).toBe(false);

    const body = (await denied.json()) as Json;
    // security-entry replaces upstream failures with a generic message plus a correlation id.
    expect(Object.keys(body).sort()).not.toContain('code');
    expect(Object.keys(body).sort()).not.toContain('details');
    expect(Object.keys(body).sort()).not.toContain('hint');
    expect(JSON.stringify(body)).not.toContain('row-level security');
    expect(typeof body.error).toBe('string');
  });

  test('registra, revisa y aprueba un pago completo por el Worker', async ({ request }) => {
    const administrator = await authenticate(request, emails.administrator);
    const reviewer = await authenticate(request, emails.reviewer);
    const runKey = `habitta-worker-e2e-${Date.now()}`;

    const created = await worker(
      request,
      administrator,
      `/v1/condominiums/${ids.primaryCondominium}/receivables`,
      {
        method: 'POST',
        data: {
          unitId: ids.secondaryUnit,
          conceptId: ids.chargeConcept,
          description: `Cuota ${runKey}`,
          amount: '80.00',
          currencyCode: 'USD',
          issueDate: '2026-08-06',
        },
      },
    );
    expect(created.status(), await created.text()).toBe(201);
    const receivableId = ((await created.json()) as { item: { id: string } }).item.id;

    const outstanding = async (token: string) => {
      const response = await worker(
        request,
        token,
        `/v1/condominiums/${ids.primaryCondominium}/receivables/${receivableId}`,
      );
      expect(response.ok(), await response.text()).toBe(true);
      const rows = (await response.json()) as { outstanding_amount: string }[];
      return Number(rows[0]?.outstanding_amount);
    };

    expect(await outstanding(administrator)).toBe(80);

    const draft = await worker(
      request,
      administrator,
      `/v1/condominiums/${ids.primaryCondominium}/payments`,
      {
        method: 'POST',
        data: {
          unitId: ids.secondaryUnit,
          paymentMethodId: ids.paymentMethod,
          paymentDate: '2026-08-06',
          originalAmount: '80.00',
          originalCurrencyCode: 'USD',
          payerName: 'Habitta E2E Worker',
          reference: `REF-${runKey}`,
          idempotencyKey: runKey,
        },
      },
    );
    expect(draft.status(), await draft.text()).toBe(201);
    const payment = (await draft.json()) as { id: string; status: string };
    expect(payment.status).toBe('draft');

    const submitted = await worker(
      request,
      administrator,
      `/v1/condominiums/${ids.primaryCondominium}/payments/${payment.id}/submit`,
      { method: 'POST' },
    );
    expect(submitted.ok(), await submitted.text()).toBe(true);
    // A submitted payment must not move the balance yet.
    expect(await outstanding(administrator)).toBe(80);

    const review = await worker(
      request,
      reviewer,
      `/v1/condominiums/${ids.primaryCondominium}/payments/${payment.id}/start-review`,
      { method: 'POST' },
    );
    expect(review.ok(), await review.text()).toBe(true);

    const approval = await worker(
      request,
      reviewer,
      `/v1/condominiums/${ids.primaryCondominium}/payments/${payment.id}/approve`,
      {
        method: 'POST',
        data: {
          allocations: [
            {
              receivableItemId: receivableId,
              paymentAmount: '80.00',
              receivableAmount: '80.00',
              paymentCurrencyCode: 'USD',
              receivableCurrencyCode: 'USD',
            },
          ],
        },
      },
    );
    expect(approval.ok(), await approval.text()).toBe(true);
    const approved = (await approval.json()) as { payment_id: string; receipt_number: string };
    expect(approved.payment_id).toBe(payment.id);
    expect(approved.receipt_number).toMatch(/^REC-/);

    expect(await outstanding(administrator)).toBe(0);

    const receipt = await worker(
      request,
      reviewer,
      `/v1/condominiums/${ids.primaryCondominium}/payments/${payment.id}/receipt`,
    );
    expect(receipt.ok(), await receipt.text()).toBe(true);
    expect(await receipt.json()).toMatchObject({
      payment_id: payment.id,
      receipt_number: approved.receipt_number,
    });
  });
});
