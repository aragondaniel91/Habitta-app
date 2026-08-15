import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { ApiRequestError, apiRequest } from './api';

const session = { access_token: 'test-token' } as Session;

afterEach(() => vi.unstubAllGlobals());

describe('apiRequest safe error messages', () => {
  it('uses an explicit publicMessage returned by the API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: 'unit_code_conflict',
            publicMessage: 'Ya existe una unidad con ese código en este condominio.',
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    await expect(
      apiRequest('/v1/condominiums/condo/units/unit', session, {
        method: 'PATCH',
        body: JSON.stringify({ code: '1A' }),
      }),
    ).rejects.toMatchObject<ApiRequestError>({
      status: 409,
      message: 'Ya existe una unidad con ese código en este condominio.',
    });
  });

  it('does not expose arbitrary upstream error messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ message: 'duplicate key value violates unique constraint secret_name' }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    await expect(apiRequest('/v1/example', session)).rejects.toMatchObject<ApiRequestError>({
      status: 409,
      message: expect.not.stringContaining('unique constraint'),
    });
  });
});
