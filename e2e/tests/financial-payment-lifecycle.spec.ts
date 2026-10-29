import { expect, test, type APIRequestContext } from '@playwright/test';

const requiredEnvironment = ['E2E_SUPABASE_URL', 'E2E_SUPABASE_ANON_KEY', 'E2E_FIXTURE_PASSWORD'];
const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);
const supabaseUrl = process.env.E2E_SUPABASE_URL;
const anonKey = process.env.E2E_SUPABASE_ANON_KEY;
const password = process.env.E2E_FIXTURE_PASSWORD;

const ids = {
  primaryCondominium: '22222222-2222-4222-8222-222222222221',
  primaryUnit: '33333333-3333-4333-8333-333333333331',
  paymentMethod: '77777777-7777-4777-8777-777777777771',
  receivableItem: '88888888-8888-4888-8888-888888888881',
};

const emails = {
  administrator: 'habitta-e2e-admin@example.invalid',
  payer: 'habitta-e2e-payer@example.invalid',
  reviewer: 'habitta-e2e-reviewer@example.invalid',
  isolation: 'habitta-e2e-isolation@example.invalid',
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
type Payment = { id: string; status: string; correction_reason?: string | null };
type Receipt = { receipt_number: string; payment_id: string };
type LedgerEntry = {
  id: string;
  direction: 'debit' | 'credit';
  amount: string;
  entry_type: string;
  reversal_of_entry_id: string | null;
};
type ReceivableBalance = { id: string; outstanding_amount: string; status: string };
type UnitCreditBalance = { unit_id: string; currency_code: string; credit_balance: string };
type AccountStatement = {
  movements: {
    receivable_item_id: string | null;
    debit: number | null;
    credit: number | null;
    currency_code: string;
  }[];
};

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

const ledgerEntries = async (request: APIRequestContext, token: string) => {
  const response = await request.get(
    `${supabaseUrl}/rest/v1/receivable_ledger_entries?receivable_item_id=eq.${ids.receivableItem}&select=id,direction,amount,entry_type,reversal_of_entry_id`,
    {
      headers: { apikey: anonKey ?? '', Authorization: `Bearer ${token}` },
    },
  );
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as LedgerEntry[];
};

const balance = async (request: APIRequestContext, token: string) => {
  const entries = await ledgerEntries(request, token);
  return entries.reduce(
    (total, entry) =>
      total + (entry.direction === 'debit' ? Number(entry.amount) : -Number(entry.amount)),
    0,
  );
};

test.describe('Ciclo financiero autenticado', () => {
  test.skip(
    missingEnvironment.length > 0,
    `Supabase local y fixture financiero requeridos: ${missingEnvironment.join(', ')}`,
  );

  test('mantiene el saldo pendiente hasta aprobación y genera recibo', async ({ request }) => {
    const administrator = await authenticate(request, emails.administrator);
    const payer = await authenticate(request, emails.payer);
    const reviewer = await authenticate(request, emails.reviewer);
    const isolation = await authenticate(request, emails.isolation);

    expect(await balance(request, payer.access_token)).toBe(125);

    const payment = await rpc<Payment>(request, payer.access_token, 'create_payment_draft', {
      target: ids.primaryCondominium,
      target_unit: ids.primaryUnit,
      target_method: ids.paymentMethod,
      // PostgREST matches overloads on the exact argument set; omitting this finds no function.
      submitted_for: null,
      payment_on: '2026-08-06',
      amount: '125.00',
      currency: 'USD',
      payer: 'Habitta E2E Payer',
      reference_value: 'E2E-TRANSFER-001',
      notes_value: 'Authenticated financial lifecycle',
      key: 'habitta-financial-e2e-payment-v1',
    });
    expect(payment.status).toBe('draft');

    const submitted = await rpc<Payment>(request, payer.access_token, 'submit_payment', {
      target: ids.primaryCondominium,
      target_payment: payment.id,
    });
    expect(submitted.status).toBe('submitted');
    expect(await balance(request, payer.access_token)).toBe(125);

    const denied = await request.post(`${supabaseUrl}/rest/v1/rpc/payment_transition`, {
      headers: {
        apikey: anonKey ?? '',
        Authorization: `Bearer ${isolation.access_token}`,
        'Content-Type': 'application/json',
      },
      data: {
        target: ids.primaryCondominium,
        target_payment: payment.id,
        next_status: 'under_review',
        reason: null,
      },
    });
    expect(denied.ok()).toBe(false);

    const underReview = await rpc<Payment>(request, reviewer.access_token, 'payment_transition', {
      target: ids.primaryCondominium,
      target_payment: payment.id,
      next_status: 'under_review',
      reason: null,
    });
    expect(underReview.status).toBe('under_review');

    const correction = await rpc<Payment>(request, reviewer.access_token, 'payment_transition', {
      target: ids.primaryCondominium,
      target_payment: payment.id,
      next_status: 'correction_requested',
      reason: 'Confirmar referencia bancaria E2E',
    });
    expect(correction.status).toBe('correction_requested');

    const corrected = await rpc<Payment>(request, payer.access_token, 'update_payment_draft', {
      target: ids.primaryCondominium,
      target_payment: payment.id,
      target_method: ids.paymentMethod,
      payment_on: '2026-08-06',
      amount: '125.00',
      currency: 'USD',
      payer: 'Habitta E2E Payer',
      reference_value: 'E2E-TRANSFER-CORRECTED',
      notes_value: 'Reference corrected by payer',
    });
    expect(corrected.status).toBe('correction_requested');
    expect(corrected.correction_reason).toBe('Confirmar referencia bancaria E2E');

    const resubmitted = await rpc<Payment>(request, payer.access_token, 'submit_payment', {
      target: ids.primaryCondominium,
      target_payment: payment.id,
    });
    expect(resubmitted.status).toBe('submitted');
    expect(resubmitted.correction_reason).toBe(null);

    const approval = await rpc<{ payment_id: string; receipt_number: string }>(
      request,
      reviewer.access_token,
      'approve_payment',
      {
        target: ids.primaryCondominium,
        target_payment: payment.id,
        allocations: [
          {
            receivable_item_id: ids.receivableItem,
            payment_amount: '125.00',
            receivable_amount: '125.00',
            payment_currency_code: 'USD',
            receivable_currency_code: 'USD',
          },
        ],
      },
    );
    expect(approval.payment_id).toBe(payment.id);
    expect(approval.receipt_number).toMatch(/^REC-/);
    expect(await balance(request, payer.access_token)).toBe(0);

    const ledgerBeforeBlockedReversal = await ledgerEntries(request, administrator.access_token);
    const blockedReversal = await request.post(
      `${supabaseUrl}/rest/v1/rpc/reverse_receivable_item`,
      {
        headers: {
          apikey: anonKey ?? '',
          Authorization: `Bearer ${administrator.access_token}`,
          'Content-Type': 'application/json',
        },
        data: {
          target: ids.primaryCondominium,
          target_item: ids.receivableItem,
          reason: 'E2E receivable correction',
        },
      },
    );
    expect(blockedReversal.ok()).toBe(false);
    await expect(blockedReversal.json()).resolves.toEqual(
      expect.objectContaining({ message: 'receivable_has_active_payment_credit' }),
    );
    expect(await balance(request, payer.access_token)).toBe(0);
    expect(await ledgerEntries(request, administrator.access_token)).toEqual(
      ledgerBeforeBlockedReversal,
    );

    const approvedPayment = await request.get(
      `${supabaseUrl}/rest/v1/payments?id=eq.${payment.id}&select=status`,
      { headers: { apikey: anonKey ?? '', Authorization: `Bearer ${administrator.access_token}` } },
    );
    expect(approvedPayment.ok(), await approvedPayment.text()).toBe(true);
    await expect(approvedPayment.json()).resolves.toEqual([{ status: 'approved' }]);

    await rpc<Payment>(request, administrator.access_token, 'reverse_payment', {
      target: ids.primaryCondominium,
      target_payment: payment.id,
      reason: 'E2E payment reversal before charge reversal',
    });
    expect(await balance(request, payer.access_token)).toBe(125);

    await rpc<{ id: string; status: string }>(
      request,
      administrator.access_token,
      'reverse_receivable_item',
      {
        target: ids.primaryCondominium,
        target_item: ids.receivableItem,
        reason: 'E2E receivable correction',
      },
    );

    const finalPayment = await request.get(
      `${supabaseUrl}/rest/v1/payments?id=eq.${payment.id}&select=status`,
      { headers: { apikey: anonKey ?? '', Authorization: `Bearer ${administrator.access_token}` } },
    );
    expect(finalPayment.ok(), await finalPayment.text()).toBe(true);
    await expect(finalPayment.json()).resolves.toEqual([{ status: 'reversed' }]);
    const finalReceivable = await request.get(
      `${supabaseUrl}/rest/v1/receivable_items?id=eq.${ids.receivableItem}&select=lifecycle_status`,
      { headers: { apikey: anonKey ?? '', Authorization: `Bearer ${administrator.access_token}` } },
    );
    expect(finalReceivable.ok(), await finalReceivable.text()).toBe(true);
    await expect(finalReceivable.json()).resolves.toEqual([{ lifecycle_status: 'reversed' }]);
    const finalLedger = await ledgerEntries(request, administrator.access_token);
    expect(finalLedger).toHaveLength(4);
    expect(finalLedger.filter((entry) => entry.reversal_of_entry_id !== null)).toHaveLength(2);
    expect(
      new Set(
        finalLedger
          .map((entry) => entry.reversal_of_entry_id)
          .filter((entry): entry is string => entry !== null),
      ).size,
    ).toBe(2);

    const receiptResponse = await request.get(
      `${supabaseUrl}/rest/v1/payment_receipts?payment_id=eq.${payment.id}&select=payment_id,receipt_number`,
      {
        headers: { apikey: anonKey ?? '', Authorization: `Bearer ${payer.access_token}` },
      },
    );
    expect(receiptResponse.ok(), await receiptResponse.text()).toBe(true);
    const receipts = (await receiptResponse.json()) as Receipt[];
    expect(receipts).toEqual([
      expect.objectContaining({ payment_id: payment.id, receipt_number: approval.receipt_number }),
    ]);
  });

  test('keeps partial due and unapplied credit exact, visible, and tenant-scoped', async ({
    request,
  }) => {
    const administrator = await authenticate(request, emails.administrator);
    const payer = await authenticate(request, emails.payer);
    const reviewer = await authenticate(request, emails.reviewer);
    const isolation = await authenticate(request, emails.isolation);
    const run = crypto.randomUUID();
    const createCharge = async (description: string, amount: string) =>
      rpc<unknown>(request, administrator.access_token, 'create_receivable_item', {
        target: ids.primaryCondominium,
        target_unit: ids.primaryUnit,
        target_concept: '66666666-6666-4666-8666-666666666661',
        item_description: description,
        item_amount: amount,
        item_currency: 'USD',
        item_issue: '2026-10-28',
        item_due: '2026-10-28',
      });
    const findCharge = async (description: string) => {
      const response = await request.get(
        `${supabaseUrl}/rest/v1/receivable_balances?condominium_id=eq.${ids.primaryCondominium}&description=eq.${encodeURIComponent(description)}&select=id,outstanding_amount,status`,
        {
          headers: { apikey: anonKey ?? '', Authorization: `Bearer ${administrator.access_token}` },
        },
      );
      expect(response.ok(), await response.text()).toBe(true);
      const rows = (await response.json()) as ReceivableBalance[];
      expect(rows).toHaveLength(1);
      return rows[0]!;
    };
    const submitAndApprove = async (
      paymentAmount: string,
      allocatedAmount: string,
      itemId: string,
      key: string,
    ) => {
      const payment = await rpc<Payment>(request, payer.access_token, 'create_payment_draft', {
        target: ids.primaryCondominium,
        target_unit: ids.primaryUnit,
        target_method: ids.paymentMethod,
        submitted_for: null,
        payment_on: '2026-10-28',
        amount: paymentAmount,
        currency: 'USD',
        payer: 'Habitta E2E Payer',
        reference_value: key,
        notes_value: 'Pilot #12/#13 exact money scenario',
        key,
      });
      await rpc<Payment>(request, payer.access_token, 'submit_payment', {
        target: ids.primaryCondominium,
        target_payment: payment.id,
      });
      await rpc<{ payment_id: string }>(request, reviewer.access_token, 'approve_payment', {
        target: ids.primaryCondominium,
        target_payment: payment.id,
        allocations: [
          {
            receivable_item_id: itemId,
            payment_amount: allocatedAmount,
            receivable_amount: allocatedAmount,
            payment_currency_code: 'USD',
            receivable_currency_code: 'USD',
          },
        ],
      });
    };

    const underpaymentDescription = `E2E pilot 12 minus 5 ${run}`;
    await createCharge(underpaymentDescription, '12.00');
    const underpayment = await findCharge(underpaymentDescription);
    await submitAndApprove('5.00', '5.00', underpayment.id, `pilot-underpayment-${run}`);
    expect((await findCharge(underpaymentDescription)).outstanding_amount).toBe('7.00');

    const overpaymentDescription = `E2E pilot 4.50 from 5 ${run}`;
    await createCharge(overpaymentDescription, '4.50');
    const overpayment = await findCharge(overpaymentDescription);
    await submitAndApprove('5.00', '4.50', overpayment.id, `pilot-overpayment-${run}`);
    expect((await findCharge(overpaymentDescription)).outstanding_amount).toBe('0.00');

    const workerUrl = 'http://127.0.0.1:8787';
    const workerHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });
    const cxc = await request.get(
      `${workerUrl}/v1/condominiums/${ids.primaryCondominium}/receivables/credit-balances`,
      { headers: workerHeaders(administrator.access_token) },
    );
    expect(cxc.ok(), await cxc.text()).toBe(true);
    const credits = (await cxc.json()) as UnitCreditBalance[];
    expect(credits).toContainEqual(
      expect.objectContaining({
        unit_id: ids.primaryUnit,
        currency_code: 'USD',
        credit_balance: '0.50',
      }),
    );

    const statement = await request.get(
      `${workerUrl}/v1/condominiums/${ids.primaryCondominium}/units/${ids.primaryUnit}/account-statement?from=2026-10-28&to=2026-10-28`,
      { headers: workerHeaders(payer.access_token) },
    );
    expect(statement.ok(), await statement.text()).toBe(true);
    const residentStatement = (await statement.json()) as AccountStatement;
    expect(residentStatement.movements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ receivable_item_id: underpayment.id, debit: 12 }),
        expect.objectContaining({ receivable_item_id: underpayment.id, credit: 5 }),
        expect.objectContaining({ receivable_item_id: overpayment.id, debit: 4.5 }),
        expect.objectContaining({ receivable_item_id: null, credit: 0.5, currency_code: 'USD' }),
      ]),
    );

    const isolatedCredits = await request.get(
      `${workerUrl}/v1/condominiums/${ids.primaryCondominium}/receivables/credit-balances`,
      { headers: workerHeaders(isolation.access_token) },
    );
    expect(isolatedCredits.ok(), await isolatedCredits.text()).toBe(true);
    await expect(isolatedCredits.json()).resolves.toEqual([]);
    const isolatedStatement = await request.get(
      `${workerUrl}/v1/condominiums/${ids.primaryCondominium}/units/${ids.primaryUnit}/account-statement`,
      { headers: workerHeaders(isolation.access_token) },
    );
    expect(isolatedStatement.status()).toBe(403);
  });
});
