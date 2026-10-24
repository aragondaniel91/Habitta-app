import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/index';
import type { NotificationBindings } from '../src/notifications/types';

const condominiumId = '0a5e90f2-1ff3-433c-abe1-55fab3e206c3';
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

describe('condominium charge-scope selection', () => {
  it('passes the chosen mode and condominium id through a caller-scoped RPC', async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push([input, init]);
        if (String(input).endsWith('/auth/v1/user'))
          return jsonResponse({ id: '11111111-1111-4111-8111-111111111111' });
        if (String(input).endsWith('/rpc/set_condominium_charge_scope')) {
          return jsonResponse({ condominium_id: condominiumId, charge_scope: 'building' });
        }
        throw new Error('Unexpected outbound request');
      }),
    );

    const response = await app.request(
      `/v1/condominiums/${condominiumId}/charge-scope`,
      {
        method: 'PATCH',
        headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ chargeScope: 'building' }),
      },
      environment,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ charge_scope: 'building' });
    const [url, options] = calls[1]!;
    expect(String(url)).toBe(
      'https://example.supabase.co/rest/v1/rpc/set_condominium_charge_scope',
    );
    expect(options?.method).toBe('POST');
    expect(JSON.parse(String(options?.body))).toEqual({
      target: condominiumId,
      requested_scope: 'building',
    });
    expect(new Headers(options?.headers).get('Authorization')).toBe('Bearer test-token');
    expect(new Headers(options?.headers).get('apikey')).toBe('anon-key');
  });

  it.each([
    [{ code: '42501', message: 'unauthorized' }, 403, 'Not authorized'],
    [{ code: '23514', message: 'existing unit' }, 409, 'charge_scope_locked'],
    [{ code: '22023', message: 'unsupported topology' }, 400, 'invalid_charge_scope'],
  ])('maps a rejected domain command into a safe response', async (backend, status, error) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith('/auth/v1/user'))
          return jsonResponse({ id: '11111111-1111-4111-8111-111111111111' });
        if (String(input).endsWith('/rpc/set_condominium_charge_scope'))
          return jsonResponse(backend, 400);
        throw new Error('Unexpected outbound request');
      }),
    );

    const response = await app.request(
      `/v1/condominiums/${condominiumId}/charge-scope`,
      {
        method: 'PATCH',
        headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ chargeScope: 'building' }),
      },
      environment,
    );
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
  });

  it('rejects unsupported scope values without calling the mutation RPC', async () => {
    const requested: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        requested.push(String(input));
        if (String(input).endsWith('/auth/v1/user'))
          return jsonResponse({ id: '11111111-1111-4111-8111-111111111111' });
        throw new Error('Mutation must not be called');
      }),
    );
    const response = await app.request(
      `/v1/condominiums/${condominiumId}/charge-scope`,
      {
        method: 'PATCH',
        headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ chargeScope: 'commercial' }),
      },
      environment,
    );
    expect(response.status).toBe(400);
    expect(requested).toHaveLength(1);
  });
});
