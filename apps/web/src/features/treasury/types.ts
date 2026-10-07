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
  reference: string | null;
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

export const accountTypeHints: Record<TreasuryAccountType, string> = {
  bank: 'Cuenta en una institución financiera; concíliala contra el estado de cuenta del banco.',
  cash: 'Efectivo custodiado por la administración (caja chica o caja de cobros).',
};

/** Plain-language guidance shown under the movement type, one line per recordable kind. */
export const movementKindHints: Partial<Record<TreasuryMovementKind, string>> = {
  opening_balance:
    'Solo se admite en una cuenta sin movimientos y queda como movimiento auditado e inmutable.',
  deposit: 'Entrada de dinero que no proviene de un pago aprobado (por ejemplo, un aporte).',
  withdrawal: 'Salida de dinero: pagos a proveedores, gastos o retiros de caja.',
  fee: 'Comisión o cargo bancario descontado por la institución.',
  adjustment: 'Corrección para cuadrar el saldo; explica la causa e indica si aumenta o disminuye.',
};

/** Kinds an administrator may record directly; the rest are produced by their own operation. */
export const recordableKinds: TreasuryMovementKind[] = [
  'opening_balance',
  'deposit',
  'withdrawal',
  'fee',
  'adjustment',
];

/** Neutral examples for movements captured outside Habitta's automatic posting flows. */
export const movementDescriptionPlaceholders: Record<TreasuryMovementKind, string> = {
  opening_balance: 'Saldo inicial de la cuenta',
  deposit: 'Aporte extraordinario',
  withdrawal: 'Retiro de caja',
  fee: 'Comisión bancaria',
  adjustment: 'Ajuste por conciliación',
  transfer_in: '',
  transfer_out: '',
  reversal: '',
};

/**
 * Deposits, withdrawals and fees always move funds the same way, so their direction is implied
 * by the kind. An adjustment is a correction that can go either way -- the database places no
 * constraint on its direction (see treasury_foundation.sql's record_treasury_movement) -- so the
 * caller must say which one this adjustment is; `adjustmentDirection` defaults to 'credit' only
 * to preserve behavior for call sites that do not pass it.
 */
export const directionForKind = (
  kind: TreasuryMovementKind,
  adjustmentDirection: 'credit' | 'debit' = 'credit',
): 'credit' | 'debit' => {
  if (kind === 'withdrawal' || kind === 'fee') return 'debit';
  if (kind === 'adjustment') return adjustmentDirection;
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

/** Mirrors the API money contract: decimal strings only, positive, and at most two decimals. */
export const isPositiveTreasuryAmount = (value: string) =>
  /^(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,2})?$/.test(value) &&
  value !== '0' &&
  value !== '0.0' &&
  value !== '0.00';

/** Applies the selected direction to a displayed balance without changing accounting rules. */
export const projectTreasuryBalance = (
  balance: string | number,
  amount: string | number,
  direction: 'credit' | 'debit',
) => {
  const current = Number(balance);
  const movement = Number(amount);
  if (!Number.isFinite(current) || !Number.isFinite(movement)) return 0;
  return direction === 'debit' ? current - movement : current + movement;
};

/** Reconciliation statements are balances, so the API deliberately allows signed and zero values. */
export const isTreasuryBalance = (value: string) =>
  /^-?(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,2})?$/.test(value);

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
