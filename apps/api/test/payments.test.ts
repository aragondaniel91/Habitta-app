import { afterEach, describe, expect, it, vi } from 'vitest';
import { allocationSchema, approvePaymentSchema, paymentDraftSchema } from '@habitta/validation';
import { app } from '../src/index';

const condo = '00000000-0000-0000-0000-000000000001';
const payment = '00000000-0000-0000-0000-000000000002';
const token = { Authorization: 'Bearer test' };
const auth = () =>
  new Response(JSON.stringify({ id: '00000000-0000-0000-0000-000000000003' }), {
    status: 200,
  });
const env = (r2: Record<string, unknown> = {}) => ({
  SUPABASE_URL: 'https://supabase.test',
  SUPABASE_ANON_KEY: 'anon',
  PAYMENT_PROOFS: r2 as unknown as R2Bucket,
});

afterEach(() => vi.restoreAllMocks());

describe('manual payment validation', () => {
  it('keeps amounts and ten-decimal rates as exact strings', () =>
    expect(
      allocationSchema.parse({
        receivableItemId: condo,
        paymentAmount: '100.00',
        receivableAmount: '4000.00',
        paymentCurrencyCode: 'USD',
        receivableCurrencyCode: 'VES',
        receivablePerPaymentRate: '40.1234567890',
      }).receivablePerPaymentRate,
    ).toBe('40.1234567890'));
  it('rejects invalid decimal payments', () =>
    expect(
      paymentDraftSchema.safeParse({
        unitId: condo,
        paymentMethodId: payment,
        paymentDate: '2026-07-01',
        originalAmount: '1.234',
        originalCurrencyCode: 'USD',
        payerName: 'A',
        idempotencyKey: 'x',
      }).success,
    ).toBe(false));
  it('validates same and cross-currency relationships', () => {
    expect(
      allocationSchema.safeParse({
        receivableItemId: condo,
        paymentAmount: '1.00',
        receivableAmount: '2.00',
        paymentCurrencyCode: 'USD',
        receivableCurrencyCode: 'USD',
      }).success,
    ).toBe(false);
    expect(
      allocationSchema.safeParse({
        receivableItemId: condo,
        paymentAmount: '1.00',
        receivableAmount: '40.00',
        paymentCurrencyCode: 'USD',
        receivableCurrencyCode: 'VES',
      }).success,
    ).toBe(false);
  });
  it('rejects duplicate receivable items in approval payloads', () => {
    const row = {
      receivableItemId: condo,
      paymentAmount: '1.00',
      receivableAmount: '1.00',
      paymentCurrencyCode: 'USD',
      receivableCurrencyCode: 'USD',
    };
    expect(approvePaymentSchema.safeParse({ allocations: [row, row] }).success).toBe(false);
  });
  it('does not use floating-point money conversions in the API', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../src/index.ts', import.meta.url), 'utf8'),
    );
    expect(source).not.toMatch(/\b(?:Number|parseFloat)\s*\(/);
  });
  it('uses SQLSTATE 42501 for payment authorization without matching message text', async () => {
    const read = (path: string) =>
      import('node:fs/promises').then((fs) => fs.readFile(new URL(path, import.meta.url), 'utf8'));
    const [api, authorizationMigration] = await Promise.all([
      read('../src/index.ts'),
      read(
        '../../../supabase/migrations/20261002000000_habrem17908887541291_payment_authorization_sqlstate.sql',
      ),
    ]);

    expect(api).toContain("value.code === '42501'");
    expect(api).not.toContain('paymentAuthorizationFailure');
    expect(authorizationMigration).toMatch(/errcode='42501', message='payment submission denied'/);
    expect(authorizationMigration).toMatch(/errcode='42501', message='payment update denied'/);
    expect(authorizationMigration).toMatch(/errcode='42501', message='approval denied'/);
    expect(authorizationMigration).toMatch(
      /errcode = '42501', message = 'payment treasury selection denied'/,
    );
  });
});

describe('payment HTTP routes', () => {
  it('registers review-queue before the payment id route', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        calls.push(url);
        if (url.includes('/auth/v1/user')) return auth();
        if (url.includes('/rpc/can_review_payments')) return Response.json(true);
        return Response.json([]);
      }),
    );
    expect(
      (
        await app.request(
          `/v1/condominiums/${condo}/payments/review-queue`,
          { headers: token },
          env(),
        )
      ).status,
    ).toBe(200);
    expect(calls.some((url) => url.includes('status=in.(submitted,under_review)'))).toBe(true);
  });
  it('returns the backend approval capability with each review-queue payment', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/auth/v1/user')) return auth();
        if (url.includes('/rpc/can_review_payments')) return Response.json(true);
        if (url.includes('/rpc/can_approve_payment')) return Response.json(false);
        if (url.includes('/rest/v1/payments?')) return Response.json([{ id: payment }]);
        return Response.json([]);
      }),
    );

    const response = await app.request(
      `/v1/condominiums/${condo}/payments/review-queue`,
      { headers: token },
      env(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: payment, can_approve: false }]);
  });
  it('keeps payer data separate from the authenticated registrar in payment detail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/auth/v1/user')) return auth();
        if (url.includes('/rpc/can_approve_payment')) return Response.json(false);
        if (url.includes('/rest/v1/payments?')) {
          return Response.json([
            {
              id: payment,
              payer_name: 'Pagador real',
              submitted_by_user_id: '00000000-0000-0000-0000-000000000003',
              reviewed_by: null,
              approved_by: null,
            },
          ]);
        }
        return Response.json([]);
      }),
    );

    const response = await app.request(
      `/v1/condominiums/${condo}/payments/${payment}`,
      { headers: token },
      env(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      payer_name: 'Pagador real',
      submitted_by_user_id: '00000000-0000-0000-0000-000000000003',
      can_approve: false,
    });
  });
  it('adds only real payment actor names to payment detail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/auth/v1/user')) return auth();
        if (url.includes('/rpc/can_approve_payment')) return Response.json(false);
        if (url.includes('/rpc/list_payment_actor_names')) {
          return Response.json([
            { user_id: '00000000-0000-0000-0000-000000000004', full_name: 'Carlos Revisor' },
          ]);
        }
        if (url.includes('/rest/v1/payments?')) {
          return Response.json([
            {
              id: payment,
              payer_name: 'Pagador real',
              submitted_by_user_id: '00000000-0000-0000-0000-000000000003',
              approved_by: '00000000-0000-0000-0000-000000000004',
            },
          ]);
        }
        return Response.json([]);
      }),
    );

    const response = await app.request(
      `/v1/condominiums/${condo}/payments/${payment}`,
      { headers: token },
      env(),
    );

    expect(await response.json()).toMatchObject({
      payer_name: 'Pagador real',
      actor_names: { '00000000-0000-0000-0000-000000000004': 'Carlos Revisor' },
    });
  });
  it.each([
    [`/v1/condominiums/${condo}/payments/${payment}`, 'Payment not found'],
    [`/v1/condominiums/${condo}/payments/${payment}/receipt`, 'Receipt not found'],
  ])('returns a real 404 for %s', async (path, error) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) =>
        String(input).includes('/auth/v1/user') ? auth() : Response.json([]),
      ),
    );
    const response = await app.request(path, { headers: token }, env());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error });
  });
  it('clears optional payment-method details without changing omitted fields', async () => {
    let updateBody = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        if (String(input).includes('/auth/v1/user')) return auth();
        updateBody = String(init?.body);
        return Response.json([{ id: payment }]);
      }),
    );

    const response = await app.request(
      `/v1/condominiums/${condo}/payment-methods/${payment}`,
      {
        method: 'PATCH',
        headers: { ...token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountHolder: '',
          bankName: '',
          accountIdentifierMasked: '',
          phoneMasked: '',
          emailMasked: '',
          instructions: '',
        }),
      },
      env(),
    );

    expect(response.status).toBe(200);
    expect(JSON.parse(updateBody)).toMatchObject({
      account_holder: null,
      bank_name: null,
      account_identifier_masked: null,
      phone_masked: null,
      email_masked: null,
      instructions: null,
    });
    expect(JSON.parse(updateBody)).not.toHaveProperty('display_name');
  });
  it('sends the real preview RPC payload with decimal strings', async () => {
    let rpcBody = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        if (String(input).includes('/auth/v1/user')) return auth();
        rpcBody = String(init?.body);
        return Response.json({ errors: [], remaining: '1.00' });
      }),
    );
    const response = await app.request(
      `/v1/condominiums/${condo}/payments/${payment}/allocation-preview`,
      {
        method: 'POST',
        headers: { ...token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ allocations: [] }),
      },
      env(),
    );
    expect(response.status).toBe(200);
    expect(JSON.parse(rpcBody)).toEqual({
      target: condo,
      target_payment: payment,
      allocations: [],
    });
  });
  it('returns the correction state preserved by the draft-update RPC', async () => {
    let rpcBody = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        if (String(input).includes('/auth/v1/user')) return auth();
        rpcBody = String(init?.body);
        return Response.json([
          { id: payment, status: 'correction_requested', correction_reason: 'Missing proof' },
        ]);
      }),
    );

    const response = await app.request(
      `/v1/condominiums/${condo}/payments/${payment}`,
      {
        method: 'PATCH',
        headers: { ...token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethodId: condo,
          paymentDate: '2026-07-01',
          originalAmount: '1.00',
          originalCurrencyCode: 'USD',
          payerName: 'A',
        }),
      },
      env(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject([
      { status: 'correction_requested', correction_reason: 'Missing proof' },
    ]);
    expect(JSON.parse(rpcBody)).toMatchObject({ target: condo, target_payment: payment });
  });
  it.each([
    [
      'create',
      'POST',
      `/v1/condominiums/${condo}/payments`,
      {
        unitId: condo,
        paymentMethodId: payment,
        paymentDate: '2026-07-01',
        originalAmount: '1.00',
        originalCurrencyCode: 'USD',
        payerName: 'A',
        idempotencyKey: 'denied-create',
      },
    ],
    [
      'update',
      'PATCH',
      `/v1/condominiums/${condo}/payments/${payment}`,
      {
        paymentMethodId: condo,
        paymentDate: '2026-07-01',
        originalAmount: '1.00',
        originalCurrencyCode: 'USD',
        payerName: 'A',
      },
    ],
    ['submit', 'POST', `/v1/condominiums/${condo}/payments/${payment}/submit`, undefined],
    [
      'start review',
      'POST',
      `/v1/condominiums/${condo}/payments/${payment}/start-review`,
      undefined,
    ],
    [
      'request correction',
      'POST',
      `/v1/condominiums/${condo}/payments/${payment}/request-correction`,
      { reason: 'Missing proof' },
    ],
    [
      'reject',
      'POST',
      `/v1/condominiums/${condo}/payments/${payment}/reject`,
      { reason: 'Duplicate' },
    ],
    [
      'approve',
      'POST',
      `/v1/condominiums/${condo}/payments/${payment}/approve`,
      { allocations: [] },
    ],
    [
      'reverse',
      'POST',
      `/v1/condominiums/${condo}/payments/${payment}/reverse`,
      { reason: 'Duplicate' },
    ],
  ])(
    'returns 403 when the %s RPC reports SQLSTATE 42501',
    async (_operation, method, path, payload) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string | URL | Request) =>
          String(input).includes('/auth/v1/user')
            ? auth()
            : Response.json(
                { code: '42501', message: 'authorization wording may change' },
                { status: 400 },
              ),
        ),
      );

      const headers = payload ? { ...token, 'Content-Type': 'application/json' } : token;
      const request = payload
        ? { method, headers, body: JSON.stringify(payload) }
        : { method, headers };
      const response = await app.request(path, request, env());

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'Forbidden' });
    },
  );
  it('keeps the independent-approval reason on a forbidden approve response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) =>
        String(input).includes('/auth/v1/user')
          ? auth()
          : Response.json(
              { code: '42501', message: 'independent payment approval required' },
              { status: 400 },
            ),
      ),
    );

    const response = await app.request(
      `/v1/condominiums/${condo}/payments/${payment}/approve`,
      {
        method: 'POST',
        headers: { ...token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ allocations: [] }),
      },
      env(),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Forbidden',
      reason: 'independent payment approval required',
    });
  });
  it('rejects empty, oversized, and unsupported proofs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => auth()),
    );
    expect(
      (
        await app.request(
          `/v1/condominiums/${condo}/payments/${payment}/proof`,
          { method: 'PUT', headers: { ...token, 'Content-Type': 'image/png' }, body: '' },
          env(),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await app.request(
          `/v1/condominiums/${condo}/payments/${payment}/proof`,
          { method: 'PUT', headers: { ...token, 'Content-Type': 'text/plain' }, body: 'x' },
          env(),
        )
      ).status,
    ).toBe(415);
    expect(
      (
        await app.request(
          `/v1/condominiums/${condo}/payments/${payment}/proof`,
          {
            method: 'PUT',
            headers: { ...token, 'Content-Type': 'image/png' },
            body: new Uint8Array(10485761),
          },
          env(),
        )
      ).status,
    ).toBe(413);
  });
  it('deletes the R2 object when proof metadata fails', async () => {
    const put = vi.fn(async () => ({}));
    const remove = vi.fn(async () => undefined);
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        if (calls === 1) return auth();
        if (calls === 2) return Response.json(true);
        return Response.json({ code: '42501' }, { status: 403 });
      }),
    );
    const response = await app.request(
      `/v1/condominiums/${condo}/payments/${payment}/proof`,
      {
        method: 'PUT',
        headers: { ...token, 'Content-Type': 'image/png', 'X-Filename': 'proof.png' },
        body: 'proof',
      },
      env({ put, delete: remove }),
    );
    expect(response.status).toBe(403);
    expect(put).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
  });
  it('uses a safe Content-Disposition filename', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        return calls === 1
          ? auth()
          : Response.json([
              { id: payment, original_filename: '../unsafe.pdf', content_type: 'application/pdf' },
            ]);
      }),
    );
    const response = await app.request(
      `/v1/condominiums/${condo}/payments/${payment}/proof`,
      { headers: token },
      env({ get: vi.fn(async () => ({ body: new Response('proof').body })) }),
    );
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename=".._unsafe.pdf"',
    );
  });
});
