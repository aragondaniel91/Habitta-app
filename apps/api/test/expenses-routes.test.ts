import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/index';
import type { NotificationBindings } from '../src/notifications/types';

const condominiumId = '0a5e90f2-1ff3-433c-abe1-55fab3e206c3';
const categoryId = '11111111-1111-4111-8111-111111111111';
const expenseId = '22222222-2222-4222-8222-222222222222';
const userId = '00000000-0000-4000-8000-000000000001';

const environment = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
} as unknown as NotificationBindings;

const jsonResponse = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

afterEach(() => vi.unstubAllGlobals());

describe('expenses routes', () => {
  it('creates an expense through the protected RPC with exact currency and amount values', async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push([input, init]);
        const url = String(input);
        if (url.endsWith('/auth/v1/user')) return jsonResponse({ id: userId });
        if (url.endsWith('/rest/v1/rpc/create_expense')) {
          return jsonResponse({ id: expenseId, currency_code: 'VES', amount: '1450.25' });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    const response = await app.request(
      `/v1/condominiums/${condominiumId}/expenses`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          categoryId,
          supplierId: null,
          description: 'Mantenimiento de ascensor',
          amount: '1450.25',
          currencyCode: 'ves',
          issueDate: '2026-07-30',
          dueDate: '2026-08-10',
          documentReference: 'FAC-100',
          supportMetadata: {},
        }),
      },
      environment,
    );

    expect(response.status).toBe(201);
    const [rpcInput, rpcRequest] = calls[1] ?? [];
    expect(String(rpcInput)).toContain('/rest/v1/rpc/create_expense');
    expect(JSON.parse(String(rpcRequest?.body))).toEqual({
      target_condominium_id: condominiumId,
      target_category_id: categoryId,
      target_supplier_id: null,
      expense_description: 'Mantenimiento de ascensor',
      expense_amount: '1450.25',
      expense_currency_code: 'VES',
      expense_issue_date: '2026-07-30',
      expense_due_date: '2026-08-10',
      expense_document_reference: 'FAC-100',
      expense_support_metadata: {},
    });
  });

  it('rejects amounts that do not preserve two decimal places', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ id: userId })));

    const response = await app.request(
      `/v1/condominiums/${condominiumId}/expenses`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          categoryId,
          description: 'Gasto inválido',
          amount: '10.1',
          currencyCode: 'USD',
          issueDate: '2026-07-30',
        }),
      },
      environment,
    );

    expect(response.status).toBe(400);
  });

  it('approves an expense only through the lifecycle RPC', async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push([input, init]);
        const url = String(input);
        if (url.endsWith('/auth/v1/user')) return jsonResponse({ id: userId });
        if (url.endsWith('/rest/v1/rpc/approve_expense')) {
          return jsonResponse({ id: expenseId, status: 'approved' });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    const response = await app.request(
      `/v1/condominiums/${condominiumId}/expenses/${expenseId}/approve`,
      { method: 'POST', headers: { Authorization: 'Bearer test-token' } },
      environment,
    );

    expect(response.status).toBe(200);
    expect(String(calls[1]?.[0])).toContain('/rest/v1/rpc/approve_expense');
    expect(JSON.parse(String(calls[1]?.[1]?.body))).toEqual({
      target_condominium_id: condominiumId,
      target_expense_id: expenseId,
    });
  });
});
