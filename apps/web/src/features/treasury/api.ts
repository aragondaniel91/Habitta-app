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

export const updateTreasuryAccount = (
  condominiumId: string,
  session: Session,
  accountId: string,
  input: {
    name: string;
    accountType: string;
    currencyCode: string;
    bankName?: string;
    accountReference?: string;
    isActive: boolean;
  },
) =>
  apiRequest<TreasuryAccount>(`${base(condominiumId)}/accounts/${accountId}`, session, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

const authorizeTreasuryOverdraft = (
  condominiumId: string,
  session: Session,
  input: {
    accountId: string;
    amount: string;
    requestKey: string;
    reason: string;
    operation: 'movement' | 'transfer';
  },
) =>
  apiRequest(`${base(condominiumId)}/overdraft-authorizations`, session, {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const recordTreasuryMovement = async (
  condominiumId: string,
  session: Session,
  input: {
    accountId: string;
    movementKind: TreasuryMovementKind;
    amount: string;
    occurredOn: string;
    description: string;
    reference?: string;
    overdraftReason?: string;
  },
) => {
  const requestKey = treasuryRequestKey('movement');
  if (input.overdraftReason) {
    await authorizeTreasuryOverdraft(condominiumId, session, {
      accountId: input.accountId,
      amount: input.amount,
      requestKey,
      reason: input.overdraftReason,
      operation: 'movement',
    });
  }

  return apiRequest<TreasuryMovement>(`${base(condominiumId)}/movements`, session, {
    method: 'POST',
    body: JSON.stringify({
      accountId: input.accountId,
      movementKind: input.movementKind,
      amount: input.amount,
      occurredOn: input.occurredOn,
      description: input.description,
      ...(input.reference ? { reference: input.reference } : {}),
      direction: directionForKind(input.movementKind),
      idempotencyKey: requestKey,
    }),
  });
};

export const createTreasuryTransfer = async (
  condominiumId: string,
  session: Session,
  input: {
    fromAccountId: string;
    toAccountId: string;
    amount: string;
    occurredOn: string;
    description: string;
    reference?: string;
    overdraftReason?: string;
  },
) => {
  const requestKey = treasuryRequestKey('transfer');
  if (input.overdraftReason) {
    await authorizeTreasuryOverdraft(condominiumId, session, {
      accountId: input.fromAccountId,
      amount: input.amount,
      requestKey,
      reason: input.overdraftReason,
      operation: 'transfer',
    });
  }

  return apiRequest<TreasuryTransfer>(`${base(condominiumId)}/transfers`, session, {
    method: 'POST',
    body: JSON.stringify({
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      amount: input.amount,
      occurredOn: input.occurredOn,
      description: input.description,
      ...(input.reference ? { reference: input.reference } : {}),
      idempotencyKey: requestKey,
    }),
  });
};

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
