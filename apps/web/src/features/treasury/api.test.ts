import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { recordTreasuryMovement } from './api';

const session = { access_token: 'test-token' } as Session;

afterEach(() => vi.restoreAllMocks());

describe('recordTreasuryMovement', () => {
  it('persists an optional manual-movement reference in the movement request', async () => {
    const bodies: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        bodies.push(String(init?.body));
        return Response.json({});
      }),
    );

    await recordTreasuryMovement('condo-1', session, {
      accountId: 'account-1',
      movementKind: 'deposit',
      amount: '25.00',
      occurredOn: '2026-10-07',
      description: 'Aporte extraordinario',
      reference: 'comprobante-00421',
    });

    expect(bodies).toHaveLength(1);
    expect(JSON.parse(bodies[0]!)).toMatchObject({
      accountId: 'account-1',
      reference: 'comprobante-00421',
      direction: 'credit',
    });
  });
});
