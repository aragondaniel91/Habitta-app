import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  serviceRequestCommentSchema,
  serviceRequestCreateSchema,
  serviceRequestUpdateSchema,
} from '@habitta/validation';
import { app } from '../src/index';

const condo = '00000000-0000-0000-0000-000000000001';
const requestId = '00000000-0000-0000-0000-000000000002';
const category = '00000000-0000-0000-0000-000000000003';
const unit = '00000000-0000-0000-0000-000000000004';
const token = { Authorization: 'Bearer test' };
const auth = () => Response.json({ id: '00000000-0000-0000-0000-000000000005' });
const env = () => ({
  SUPABASE_URL: 'https://supabase.test',
  SUPABASE_ANON_KEY: 'anon',
  PAYMENT_PROOFS: {} as R2Bucket,
});

afterEach(() => vi.restoreAllMocks());

describe('service request validation', () => {
  it('normalizes request creation and rejects invalid updates', () => {
    expect(
      serviceRequestCreateSchema.parse({
        categoryId: category,
        title: '  Fuga de agua  ',
        description: '  El pasillo está mojado.  ',
      }),
    ).toEqual({
      categoryId: category,
      title: 'Fuga de agua',
      description: 'El pasillo está mojado.',
      priority: 'normal',
    });
    expect(serviceRequestUpdateSchema.safeParse({}).success).toBe(false);
    expect(serviceRequestUpdateSchema.safeParse({ status: 'cancelled' }).success).toBe(false);
    expect(serviceRequestCommentSchema.safeParse({ body: '   ' }).success).toBe(false);
  });
});

describe('service request HTTP routes', () => {
  it('sends the exact create RPC payload', async () => {
    let rpcBody = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        if (String(input).includes('/auth/v1/user')) return auth();
        rpcBody = String(init?.body);
        return Response.json({ id: requestId }, { status: 200 });
      }),
    );

    const response = await app.request(
      `/v1/condominiums/${condo}/requests`,
      {
        method: 'POST',
        headers: { ...token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitId: unit,
          categoryId: category,
          title: 'Fuga de agua',
          description: 'El pasillo está mojado.',
          priority: 'high',
        }),
      },
      env(),
    );

    expect(response.status).toBe(201);
    expect(JSON.parse(rpcBody)).toEqual({
      target_condominium: condo,
      target_unit: unit,
      target_category: category,
      request_title: 'Fuga de agua',
      request_description: 'El pasillo está mojado.',
      request_priority: 'high',
      target_requester: null,
    });
  });

  it('applies validated request-list filters', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        calls.push(url);
        return url.includes('/auth/v1/user') ? auth() : Response.json([]);
      }),
    );

    const response = await app.request(
      `/v1/condominiums/${condo}/requests?status=in_progress&priority=urgent&unitId=${unit}`,
      { headers: token },
      env(),
    );

    expect(response.status).toBe(200);
    expect(
      calls.some(
        (url) =>
          url.includes('service_requests?') &&
          url.includes('status=eq.in_progress') &&
          url.includes('priority=eq.urgent') &&
          url.includes(`unit_id=eq.${unit}`),
      ),
    ).toBe(true);
  });

  it('returns a real 404 for an inaccessible or missing request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) =>
        String(input).includes('/auth/v1/user') ? auth() : Response.json([]),
      ),
    );
    const response = await app.request(
      `/v1/condominiums/${condo}/requests/${requestId}`,
      { headers: token },
      env(),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Service request not found' });
  });

  it('sends public and internal comments through the append-only RPC', async () => {
    let rpcBody = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        if (String(input).includes('/auth/v1/user')) return auth();
        rpcBody = String(init?.body);
        return Response.json({ id: category });
      }),
    );

    const response = await app.request(
      `/v1/condominiums/${condo}/requests/${requestId}/comments`,
      {
        method: 'POST',
        headers: { ...token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: 'Proveedor contactado.', visibility: 'internal' }),
      },
      env(),
    );

    expect(response.status).toBe(201);
    expect(JSON.parse(rpcBody)).toEqual({
      target_condominium: condo,
      target_request: requestId,
      comment_body: 'Proveedor contactado.',
      comment_visibility: 'internal',
    });
  });
});
