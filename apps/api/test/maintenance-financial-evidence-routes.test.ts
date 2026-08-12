import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/index';

const condo = '00000000-0000-0000-0000-000000000401';
const workOrder = '00000000-0000-0000-0000-000000000402';
const vendor = '00000000-0000-0000-0000-000000000403';
const quote = '00000000-0000-0000-0000-000000000404';
const expense = '00000000-0000-0000-0000-000000000405';
const token = { Authorization: 'Bearer test' };
const auth = () => Response.json({ id: '00000000-0000-0000-0000-000000000406' });

const bucket = () =>
  ({
    put: vi.fn(async () => undefined),
    get: vi.fn(async () => null),
    delete: vi.fn(async () => undefined),
  }) as unknown as R2Bucket;
const env = (paymentProofs = bucket()) => ({
  SUPABASE_URL: 'https://supabase.test',
  SUPABASE_ANON_KEY: 'anon',
  PAYMENT_PROOFS: paymentProofs,
});

afterEach(() => vi.restoreAllMocks());

describe('HAB-133 maintenance financial routes', () => {
  it('creates a quote through the protected RPC with normalized currency', async () => {
    let rpcBody = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        if (String(input).includes('/auth/v1/user')) return auth();
        rpcBody = String(init?.body);
        return Response.json({ id: quote });
      }),
    );

    const response = await app.request(
      `/v1/condominiums/${condo}/maintenance/work-orders/${workOrder}/quotes`,
      {
        method: 'POST',
        headers: { ...token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: vendor,
          amount: '850.00',
          currencyCode: 'usd',
          reference: 'Q-001',
          validUntil: '2026-08-31',
          notes: 'Incluye repuestos.',
        }),
      },
      env(),
    );

    expect(response.status).toBe(201);
    expect(JSON.parse(rpcBody)).toEqual({
      target_condominium: condo,
      target_work_order: workOrder,
      target_vendor: vendor,
      quote_amount: '850.00',
      quote_currency: 'USD',
      reference_value: 'Q-001',
      valid_until_value: '2026-08-31',
      notes_value: 'Incluye repuestos.',
    });
  });

  it('requires a reason before sending quote rejection to the database', async () => {
    let databaseCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        if (String(input).includes('/auth/v1/user')) return auth();
        databaseCalls += 1;
        return Response.json({});
      }),
    );

    const response = await app.request(
      `/v1/condominiums/${condo}/maintenance/work-orders/${workOrder}/quotes/${quote}/decision`,
      {
        method: 'POST',
        headers: { ...token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'reject' }),
      },
      env(),
    );

    expect(response.status).toBe(400);
    expect(databaseCalls).toBe(0);
  });

  it('links an existing expense without sending any amount or treasury mutation', async () => {
    let rpcBody = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        if (String(input).includes('/auth/v1/user')) return auth();
        rpcBody = String(init?.body);
        return Response.json({ id: '00000000-0000-0000-0000-000000000407' });
      }),
    );

    const response = await app.request(
      `/v1/condominiums/${condo}/maintenance/work-orders/${workOrder}/expenses`,
      {
        method: 'POST',
        headers: { ...token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expenseId: expense, quoteId: quote }),
      },
      env(),
    );

    expect(response.status).toBe(201);
    expect(JSON.parse(rpcBody)).toEqual({
      target_condominium: condo,
      target_work_order: workOrder,
      target_expense: expense,
      target_quote: quote,
    });
  });
});

describe('HAB-133 private maintenance evidence', () => {
  it('stores the file under a deterministic private maintenance key and records metadata', async () => {
    let rpcBody: Record<string, unknown> | undefined;
    const paymentProofs = bucket() as unknown as {
      put: ReturnType<typeof vi.fn>;
      get: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/auth/v1/user')) return auth();
        if (url.includes('/rpc/record_maintenance_attachment')) {
          rpcBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
          return Response.json({ id: rpcBody.target_attachment });
        }
        return Response.json([]);
      }),
    );

    const response = await app.request(
      `/v1/condominiums/${condo}/maintenance/work-orders/${workOrder}/attachments`,
      {
        method: 'PUT',
        headers: {
          ...token,
          'Content-Type': 'application/pdf',
          'X-Filename': 'cotizacion.pdf',
          'X-Document-Type': 'quote',
          'X-Quote-Id': quote,
        },
        body: new Uint8Array([1, 2, 3, 4]),
      },
      env(paymentProofs as unknown as R2Bucket),
    );

    expect(response.status).toBe(201);
    expect(rpcBody).toMatchObject({
      target_condominium: condo,
      target_work_order: workOrder,
      target_quote: quote,
      document_kind: 'quote',
      filename: 'cotizacion.pdf',
      mime: 'application/pdf',
      bytes: 4,
    });
    expect(String(rpcBody?.key_value)).toMatch(/^maintenance\/[0-9a-f-]{36}$/);
    expect(paymentProofs.put).toHaveBeenCalledTimes(1);
  });

  it('deletes the uploaded object if database metadata recording fails', async () => {
    const paymentProofs = bucket() as unknown as {
      put: ReturnType<typeof vi.fn>;
      get: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        if (String(input).includes('/auth/v1/user')) return auth();
        return Response.json({ message: 'maintenance attachment upload denied' }, { status: 403 });
      }),
    );

    const response = await app.request(
      `/v1/condominiums/${condo}/maintenance/work-orders/${workOrder}/attachments`,
      {
        method: 'PUT',
        headers: {
          ...token,
          'Content-Type': 'image/jpeg',
          'X-Filename': 'cierre.jpg',
          'X-Document-Type': 'completion_photo',
        },
        body: new Uint8Array([9, 8, 7]),
      },
      env(paymentProofs as unknown as R2Bucket),
    );

    expect(response.status).toBe(403);
    expect(paymentProofs.delete).toHaveBeenCalledTimes(1);
  });
});
