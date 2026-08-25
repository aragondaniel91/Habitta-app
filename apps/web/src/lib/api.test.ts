import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { apiRequest } from './api';

const session = { access_token: 'test-token' } as Session;

afterEach(() => vi.unstubAllGlobals());

describe('apiRequest safe error messages', () => {
  it('uses an explicit publicMessage returned by the API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
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
    ).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 409,
      message: 'Ya existe una unidad con ese código en este condominio.',
    });
  });

  it('propagates the safe receivable payment conflict message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: 'receivable_payment_conflict',
              publicMessage:
                'Este cargo tiene un pago aprobado aplicado. Reversa primero el pago y luego intenta nuevamente.',
            }),
            { status: 409, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );

    await expect(
      apiRequest('/v1/condominiums/condo/receivables/item/reverse', session),
    ).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 409,
      message:
        'Este cargo tiene un pago aprobado aplicado. Reversa primero el pago y luego intenta nuevamente.',
    });
  });

  it('propagates a safe recurring-dues domain message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: 'recurring_participation_incomplete',
              publicMessage:
                'Todas las unidades del ámbito necesitan una alícuota de participación antes de preparar la cuota.',
            }),
            { status: 422, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );

    await expect(
      apiRequest('/v1/condominiums/condo/recurring-charge-runs/run/prepare', session, {
        method: 'POST',
      }),
    ).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 422,
      message:
        'Todas las unidades del ámbito necesitan una alícuota de participación antes de preparar la cuota.',
    });
  });

  it('does not expose arbitrary upstream error messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              message: 'duplicate key value violates unique constraint secret_name',
            }),
            { status: 409, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );

    await expect(apiRequest('/v1/example', session)).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 409,
      message: expect.not.stringContaining('unique constraint'),
    });
  });
});
