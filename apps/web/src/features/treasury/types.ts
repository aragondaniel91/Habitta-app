export type TreasuryAccountType = 'bank' | 'cash';

export type TreasuryAccount = {
  id: string;
  name: string;
  account_type: TreasuryAccountType;
  currency_code: string;
  bank_name: string | null;
  account_reference: string | null;
  notes: string | null;
  is_active: boolean;
  /** Derived from the immutable movements, never stored on the account. */
  balance: string;
  latest_movement_at: string | null;
};

export type TreasuryMovementKind =
  | 'opening_balance'
  | 'deposit'
  | 'withdrawal'
  | 'fee'
  | 'adjustment'
  | 'transfer_in'
  | 'transfer_out'
  | 'reversal';

export type TreasuryMovement = {
  id: string;
  account_id: string;
  direction: 'credit' | 'debit';
  movement_kind: TreasuryMovementKind;
  amount: string;
  currency_code: string;
  occurred_on: string;
  description: string;
  reference: string | null;
  reversal_of: string | null;
  created_at: string;
};

export type TreasuryTransfer = {
  id: string;
  from_account_id: string;
  to_account_id: string;
  amount: string;
  currency_code: string;
  occurred_on: string;
  description: string;
};

export type TreasuryReconciliation = {
  id: string;
  account_id: string;
  period_start: string;
  period_end: string;
  statement_opening_balance: string;
  statement_closing_balance: string;
  /** Filled in by close_treasury_reconciliation from the movements matched to the period. */
  book_closing_balance: string | null;
  difference: string | null;
  status: 'draft' | 'closed';
  closed_at: string | null;
};

export const accountTypeLabels: Record<TreasuryAccountType, string> = {
  bank: 'Banco',
  cash: 'Caja',
};

export const movementKindLabels: Record<TreasuryMovementKind, string> = {
  opening_balance: 'Saldo inicial',
  deposit: 'Depósito',
  withdrawal: 'Retiro',
  fee: 'Comisión',
  adjustment: 'Ajuste',
  transfer_in: 'Transferencia recibida',
  transfer_out: 'Transferencia enviada',
  reversal: 'Reverso',
};

/** Kinds an administrator may record directly; the rest are produced by their own operation. */
export const recordableKinds: TreasuryMovementKind[] = [
  'opening_balance',
  'deposit',
  'withdrawal',
  'fee',
  'adjustment',
];

export const directionForKind = (kind: TreasuryMovementKind): 'credit' | 'debit' => {
  if (kind === 'withdrawal' || kind === 'fee') return 'debit';
  return 'credit';
};

export const formatTreasuryAmount = (value: string | number, currencyCode: string) => {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount)) return `${currencyCode} 0,00`;
  return `${currencyCode} ${amount.toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export const formatTreasuryDate = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
};

/** Accounts never mix currencies, so the workspace totals one figure per currency. */
export const balancesByCurrency = (accounts: TreasuryAccount[]) => {
  const totals = new Map<string, number>();
  for (const account of accounts) {
    if (!account.is_active) continue;
    totals.set(
      account.currency_code,
      (totals.get(account.currency_code) ?? 0) + Number(account.balance),
    );
  }
  return [...totals.entries()]
    .map(([currencyCode, total]) => ({ currencyCode, total }))
    .sort((a, b) => a.currencyCode.localeCompare(b.currencyCode));
};
