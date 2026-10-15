import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from './index';

const indexUrl = new URL('./index.ts', import.meta.url);
const condominiumId = 'a4050000-0000-4000-8000-000000000010';
const methodId = 'a4050000-0000-4000-8000-000000000011';
const callerToken = 'caller-scoped-jwt';
const environment = {
  SUPABASE_URL: 'https://supabase.test',
  SUPABASE_ANON_KEY: 'anon-key',
  APP_ENV: 'development',
} as never;

const request = (method: string, path: string, body: unknown) =>
  app.fetch(
    new Request(`https://api.test${path}`, {
      method,
      headers: { Authorization: `Bearer ${callerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    environment,
  );

describe('manual payment method API foundation', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses the type-aware sanitizer for creation and type-changing edits', async () => {
    const source = await readFile(indexUrl, 'utf8');
    expect(source).toContain('sanitizePaymentMethodDetails');
    expect(source).toContain('const details = sanitizePaymentMethodDetails(p);');
    expect(source).toContain('const candidate = paymentMethodSchema.safeParse');
    expect(source).toContain('details = sanitizePaymentMethodDetails(candidate.data);');
  });

  it('does not add a browser endpoint that changes provider connection status', async () => {
    const source = await readFile(indexUrl, 'utf8');
    expect(source).not.toMatch(
      /collection-provider.*(?:POST|PATCH)|(?:POST|PATCH).*collection-provider/is,
    );
  });

  it('keeps collection connector mutations behind caller-scoped RPCs and exposes no provider secret route', async () => {
    const source = await readFile(indexUrl, 'utf8');
    expect(source).toContain('rpc/create_collection_provider_connection');
    expect(source).toContain('rpc/disable_collection_provider_connection');
    expect(source).not.toMatch(/collection-connectors\/(?:webhook|tokens?|secrets?|credentials?)/i);
    expect(source).not.toMatch(/service_role.*collection-connectors/is);
  });

  it('sends payment-method POST and PATCH to PostgREST with the caller token, never service role', async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.includes('/auth/v1/user'))
        return new Response(JSON.stringify({ id: 'a4050000-0000-4000-8000-000000000012' }));
      return new Response(JSON.stringify([{ id: methodId }]), { status: 200 });
    });

    const create = await request('POST', `/v1/condominiums/${condominiumId}/payment-methods`, {
      methodType: 'cash',
      displayName: 'Caja',
      currencyCode: 'USD',
      instructions: 'Administración',
    });
    const edit = await request(
      'PATCH',
      `/v1/condominiums/${condominiumId}/payment-methods/${methodId}`,
      {
        displayName: 'Caja editada',
      },
    );

    expect(create.status).toBe(201);
    expect(edit.status).toBe(200);
    const writes = requests.filter(({ url }) =>
      url.includes('/rest/v1/condominium_payment_methods'),
    );
    expect(writes).toHaveLength(2);
    expect(writes.map(({ init }) => init?.method)).toEqual(['POST', 'PATCH']);
    for (const { init } of writes) {
      const headers = new Headers(init?.headers);
      expect(headers.get('authorization')).toBe(`Bearer ${callerToken}`);
      expect(headers.get('apikey')).toBe('anon-key');
      expect(headers.get('authorization')).not.toMatch(/service_role/i);
    }
  });
});
