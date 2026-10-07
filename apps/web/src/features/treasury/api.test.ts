import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import {
  createTreasuryReconciliation,
  createTreasuryTransfer,
  recordTreasuryMovement,
} from './api';

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

describe('createTreasuryTransfer', () => {
  it('persists an optional transfer reference in the transfer request', async () => {
    const bodies: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        bodies.push(String(init?.body));
        return Response.json({});
      }),
    );

    await createTreasuryTransfer('condo-1', session, {
      fromAccountId: 'account-1',
      toAccountId: 'account-2',
      amount: '25.00',
      occurredOn: '2026-10-07',
      description: 'Transferencia a caja operativa',
      reference: 'comprobante-00421',
    });

    expect(bodies).toHaveLength(1);
    expect(JSON.parse(bodies[0]!)).toMatchObject({
      fromAccountId: 'account-1',
      toAccountId: 'account-2',
      reference: 'comprobante-00421',
    });
  });
});

describe('createTreasuryReconciliation', () => {
  it('keeps a concise optional note with the external-statement inputs', async () => {
    const bodies: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        bodies.push(String(init?.body));
        return Response.json({});
      }),
    );

    await createTreasuryReconciliation('condo-1', session, {
      accountId: 'account-1',
      startsOn: '2026-10-01',
      endsOn: '2026-10-31',
      statementOpeningBalance: '10.00',
      statementClosingBalance: '25.00',
      notes: 'Estado enviado por el banco.',
    });

    expect(JSON.parse(bodies[0]!)).toMatchObject({
      statementClosingBalance: '25.00',
      notes: 'Estado enviado por el banco.',
    });
  });
});
