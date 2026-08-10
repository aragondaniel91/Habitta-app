import type { Session } from '@supabase/supabase-js';
import { apiRequest } from '../../lib/api';
import type {
  TreasuryAccount,
  TreasuryMovement,
  TreasuryMovementKind,
  TreasuryReconciliation,
  TreasuryTransfer,
} from './types';
import { directionForKind } from './types';

const base = (condominiumId: string) => `/v1/condominiums/${condominiumId}/treasury`;

/** Idempotency keys must survive a retry, so they are derived once per submitted form. */
export const treasuryRequestKey = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const loadTreasuryWorkspace = async (condominiumId: string, session: Session) => {
  const [accounts, movements, transfers, reconciliations] = await Promise.all([
    apiRequest<TreasuryAccount[]>(`${base(condominiumId)}/accounts`, session),
    apiRequest<TreasuryMovement[]>(`${base(condominiumId)}/movements`, session),
    apiRequest<TreasuryTransfer[]>(`${base(condominiumId)}/transfers`, session),
    apiRequest<TreasuryReconciliation[]>(`${base(condominiumId)}/reconciliations`, session),
  ]);
  return { accounts, movements, transfers, reconciliations };
};

export const createTreasuryAccount = (
  condominiumId: string,
  session: Session,
  input: {
    name: string;
    accountType: string;
    currencyCode: string;
    bankName?: string;
    accountReference?: string;
  },
) =>
  apiRequest<TreasuryAccount>(`${base(condominiumId)}/accounts`, session, {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const recordTreasuryMovement = (
  condominiumId: string,
  session: Session,
  input: {
    accountId: string;
    movementKind: TreasuryMovementKind;
    amount: string;
    occurredOn: string;
    description: string;
    reference?: string;
  },
) =>
  apiRequest<TreasuryMovement>(`${base(condominiumId)}/movements`, session, {
    method: 'POST',
    body: JSON.stringify({
      ...input,
      direction: directionForKind(input.movementKind),
      idempotencyKey: treasuryRequestKey('movement'),
    }),
  });

export const createTreasuryTransfer = (
  condominiumId: string,
  session: Session,
  input: {
    fromAccountId: string;
    toAccountId: string;
    amount: string;
    occurredOn: string;
    description: string;
    reference?: string;
  },
) =>
  apiRequest<TreasuryTransfer>(`${base(condominiumId)}/transfers`, session, {
    method: 'POST',
    body: JSON.stringify({ ...input, idempotencyKey: treasuryRequestKey('transfer') }),
  });

export const reverseTreasuryMovement = (
  condominiumId: string,
  session: Session,
  movementId: string,
  reason: string,
) =>
  apiRequest<TreasuryMovement>(`${base(condominiumId)}/movements/${movementId}/reverse`, session, {
    method: 'POST',
    body: JSON.stringify({ reason, idempotencyKey: treasuryRequestKey('reversal') }),
  });

export const createTreasuryReconciliation = (
  condominiumId: string,
  session: Session,
  input: {
    accountId: string;
    startsOn: string;
    endsOn: string;
    statementOpeningBalance: string;
    statementClosingBalance: string;
  },
) =>
  apiRequest<TreasuryReconciliation>(`${base(condominiumId)}/reconciliations`, session, {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const closeTreasuryReconciliation = (
  condominiumId: string,
  session: Session,
  reconciliationId: string,
) =>
  apiRequest<TreasuryReconciliation>(
    `${base(condominiumId)}/reconciliations/${reconciliationId}/close`,
    session,
    { method: 'POST' },
  );
