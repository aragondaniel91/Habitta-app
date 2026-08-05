import type { Session } from '@supabase/supabase-js';
import { apiRequest } from '../../lib/api';

export type TreasuryAccount = {
  id: string;
  name: string;
  account_type: 'bank' | 'cash';
  currency_code: string;
  bank_name: string | null;
  account_reference: string | null;
  notes: string | null;
  is_active: boolean;
  balance: string | number;
  latest_movement_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TreasuryMovement = {
  id: string;
  condominium_id: string;
  account_id: string;
  transfer_id: string | null;
  direction: 'credit' | 'debit';
  movement_kind:
    | 'opening_balance'
    | 'deposit'
    | 'withdrawal'
    | 'fee'
    | 'adjustment'
    | 'transfer_in'
    | 'transfer_out'
    | 'reversal';
  amount: string | number;
  currency_code: string;
  occurred_on: string;
  description: string;
  reference: string | null;
  source_type: 'manual' | 'opening_balance' | 'payment' | 'expense' | 'transfer' | 'reversal';
  source_id: string | null;
  reversal_of: string | null;
  created_at: string;
};

export type TreasuryReconciliation = {
  id: string;
  condominium_id: string;
  account_id: string;
  period_start: string;
  period_end: string;
  statement_opening_balance: string | number;
  statement_closing_balance: string | number;
  book_closing_balance: string | number | null;
  difference: string | number | null;
  status: 'draft' | 'closed';
  notes: string | null;
  closed_at: string | null;
  created_at: string;
};

const base = (condominiumId: string) => `/v1/condominiums/${condominiumId}/treasury`;

export const listTreasuryAccounts = (condominiumId: string, session: Session) =>
  apiRequest<TreasuryAccount[]>(`${base(condominiumId)}/accounts`, session);

export const createTreasuryAccount = (
  condominiumId: string,
  session: Session,
  payload: {
    name: string;
    accountType: 'bank' | 'cash';
    currencyCode: string;
    bankName?: string;
    accountReference?: string;
    notes?: string;
  },
) =>
  apiRequest<TreasuryAccount>(`${base(condominiumId)}/accounts`, session, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const listTreasuryMovements = (
  condominiumId: string,
  session: Session,
  filters: { accountId?: string; from?: string; to?: string } = {},
) => {
  const query = new URLSearchParams();
  if (filters.accountId) query.set('accountId', filters.accountId);
  if (filters.from) query.set('from', filters.from);
  if (filters.to) query.set('to', filters.to);
  const suffix = query.size ? `?${query.toString()}` : '';
  return apiRequest<TreasuryMovement[]>(`${base(condominiumId)}/movements${suffix}`, session);
};

export const recordTreasuryMovement = (
  condominiumId: string,
  session: Session,
  payload: {
    accountId: string;
    direction: 'credit' | 'debit';
    movementKind: 'opening_balance' | 'deposit' | 'withdrawal' | 'fee' | 'adjustment';
    amount: string;
    occurredOn: string;
    description: string;
    reference?: string;
    sourceType?: 'manual' | 'opening_balance' | 'payment' | 'expense';
    sourceId?: string;
    idempotencyKey: string;
  },
) =>
  apiRequest<TreasuryMovement>(`${base(condominiumId)}/movements`, session, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const createTreasuryTransfer = (
  condominiumId: string,
  session: Session,
  payload: {
    fromAccountId: string;
    toAccountId: string;
    amount: string;
    occurredOn: string;
    description: string;
    reference?: string;
    idempotencyKey: string;
  },
) =>
  apiRequest(`${base(condominiumId)}/transfers`, session, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const reverseTreasuryMovement = (
  condominiumId: string,
  movementId: string,
  session: Session,
  reason: string,
) =>
  apiRequest<TreasuryMovement>(`${base(condominiumId)}/movements/${movementId}/reverse`, session, {
    method: 'POST',
    body: JSON.stringify({
      reason,
      idempotencyKey: `treasury-reversal-${movementId}`,
    }),
  });

export const listTreasuryReconciliations = (condominiumId: string, session: Session) =>
  apiRequest<TreasuryReconciliation[]>(`${base(condominiumId)}/reconciliations`, session);

export const createTreasuryReconciliation = (
  condominiumId: string,
  session: Session,
  payload: {
    accountId: string;
    periodStart: string;
    periodEnd: string;
    statementOpeningBalance: string;
    statementClosingBalance: string;
    notes?: string;
  },
) =>
  apiRequest<TreasuryReconciliation>(`${base(condominiumId)}/reconciliations`, session, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const matchTreasuryMovement = (
  condominiumId: string,
  reconciliationId: string,
  movementId: string,
  session: Session,
) =>
  apiRequest(`${base(condominiumId)}/reconciliations/${reconciliationId}/movements`, session, {
    method: 'POST',
    body: JSON.stringify({ movementId }),
  });

export const closeTreasuryReconciliation = (
  condominiumId: string,
  reconciliationId: string,
  session: Session,
) =>
  apiRequest<TreasuryReconciliation>(
    `${base(condominiumId)}/reconciliations/${reconciliationId}/close`,
    session,
    { method: 'POST', body: '{}' },
  );
