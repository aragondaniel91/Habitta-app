import { describe, expect, it, vi } from 'vitest';
import { app } from '../src/index';

const condominiumId = '11111111-1111-4111-8111-111111111111';
const receivableId = '22222222-2222-4222-8222-222222222222';
const environment = {
  SUPABASE_URL: 'https://supabase.example.test',
  SUPABASE_ANON_KEY: 'anon-key',
} as never;

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const reverse = () =>
  app.request(
    `/v1/condominiums/${condominiumId}/receivables/${receivableId}/reverse`,
    {
      method: 'POST',
      headers: { Authorization: 'Bearer caller-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Corrección autorizada' }),
    },
    environment,
  );

describe('receivable reversal route', () => {
  it('maps an active payment credit to a safe financial conflict', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/auth/v1/user')) return json({ id: condominiumId });
      return json({ message: 'receivable_has_active_payment_credit', hint: 'private detail' }, 400);
    });
    try {
      const response = await reverse();
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({
        error: 'receivable_payment_conflict',
        publicMessage:
          'Este cargo tiene un pago aprobado aplicado. Reversa primero el pago y luego intenta nuevamente.',
      });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('does not classify ordinary authorization failures as conflicts', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/auth/v1/user')) return json({ id: condominiumId });
      return json({ message: 'permission denied' }, 403);
    });
    try {
      const response = await reverse();
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ message: 'permission denied' });
    } finally {
      fetchMock.mockRestore();
    }
  });
});
