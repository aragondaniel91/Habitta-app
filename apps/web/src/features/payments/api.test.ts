import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { paymentApi } from './api';

const session = { access_token: 'test-token' } as Session;

afterEach(() => vi.restoreAllMocks());

describe('paymentApi payment-method edits', () => {
  it('preserves intentional blank optional details only for a payment-method PATCH', async () => {
    const bodies: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        bodies.push(String(init?.body));
        return Response.json({});
      }),
    );

    await paymentApi('/v1/condominiums/condo/payment-methods/method', session, {
      method: 'PATCH',
      body: JSON.stringify({ bankName: '', instructions: '', isActive: true }),
    });
    await paymentApi('/v1/condominiums/condo/payment-methods', session, {
      method: 'POST',
      body: JSON.stringify({ bankName: '', instructions: '', isActive: true }),
    });

    expect(JSON.parse(bodies[0]!)).toEqual({ bankName: '', instructions: '', isActive: true });
    expect(JSON.parse(bodies[1]!)).toEqual({ isActive: true });
  });
});
