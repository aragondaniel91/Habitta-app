import { describe, expect, it } from 'vitest';
import {
  balancesByCurrency,
  directionForKind,
  formatTreasuryAmount,
  movementDescriptionPlaceholders,
  movementKindHints,
  projectTreasuryBalance,
  recordableKinds,
  type TreasuryAccount,
} from './types';

const account = (overrides: Partial<TreasuryAccount>): TreasuryAccount => ({
  id: crypto.randomUUID(),
  name: 'Cuenta',
  account_type: 'bank',
  currency_code: 'USD',
  bank_name: null,
  account_reference: null,
  notes: null,
  is_active: true,
  balance: '0.00',
  latest_movement_at: null,
  ...overrides,
});

describe('treasury workspace', () => {
  it('totals each currency separately and never merges them', () => {
    const totals = balancesByCurrency([
      account({ currency_code: 'USD', balance: '950.00' }),
      account({ currency_code: 'USD', balance: '300.00' }),
      account({ currency_code: 'VES', balance: '4000.00' }),
    ]);

    expect(totals).toEqual([
      { currencyCode: 'USD', total: 1250 },
      { currencyCode: 'VES', total: 4000 },
    ]);
  });

  it('leaves inactive accounts out of the available balance', () => {
    const totals = balancesByCurrency([
      account({ currency_code: 'USD', balance: '100.00' }),
      account({ currency_code: 'USD', balance: '999.00', is_active: false }),
    ]);

    expect(totals).toEqual([{ currencyCode: 'USD', total: 100 }]);
  });

  it('derives the direction the database expects for each recordable kind', () => {
    expect(directionForKind('deposit')).toBe('credit');
    expect(directionForKind('opening_balance')).toBe('credit');
    expect(directionForKind('adjustment')).toBe('credit');
    expect(directionForKind('withdrawal')).toBe('debit');
    expect(directionForKind('fee')).toBe('debit');
  });

  it('lets an adjustment go either way, unlike every other recordable kind', () => {
    // The database places no direction constraint on 'adjustment' movements (see
    // record_treasury_movement in treasury_foundation.sql) -- it is a correction that can
    // increase or decrease a balance, so the caller's chosen direction must be honored.
    expect(directionForKind('adjustment', 'credit')).toBe('credit');
    expect(directionForKind('adjustment', 'debit')).toBe('debit');
    // Kinds whose direction is implied by the kind ignore any adjustmentDirection override.
    expect(directionForKind('withdrawal', 'credit')).toBe('debit');
    expect(directionForKind('deposit', 'debit')).toBe('credit');
  });

  it('never offers the kinds produced by a dedicated operation', () => {
    for (const kind of ['transfer_in', 'transfer_out', 'reversal'] as const) {
      expect(recordableKinds).not.toContain(kind);
    }
  });

  it('formats amounts with the currency and two decimals', () => {
    expect(formatTreasuryAmount('950.5', 'USD')).toBe('USD 950,50');
    expect(formatTreasuryAmount(0, 'VES')).toBe('VES 0,00');
    expect(formatTreasuryAmount('no es un monto', 'USD')).toBe('USD 0,00');
  });

  it('projects balances with the selected credit or debit direction', () => {
    expect(projectTreasuryBalance('100.00', '25.50', 'credit')).toBe(125.5);
    expect(projectTreasuryBalance('100.00', '25.50', 'debit')).toBe(74.5);
    expect(projectTreasuryBalance('100.00', '25.50', directionForKind('adjustment', 'debit'))).toBe(
      74.5,
    );
  });

  it('uses neutral manual-movement examples rather than automatic payment flows', () => {
    expect(movementDescriptionPlaceholders).toMatchObject({
      deposit: 'Aporte extraordinario',
      withdrawal: 'Retiro de caja',
      fee: 'Comisión bancaria',
      adjustment: 'Ajuste por conciliación',
      opening_balance: 'Saldo inicial de la cuenta',
    });
  });

  it('explains opening-balance and adjustment restrictions in the type guidance', () => {
    expect(movementKindHints.opening_balance).toContain('sin movimientos');
    expect(movementKindHints.opening_balance).toContain('auditado');
    expect(movementKindHints.adjustment).toContain('causa');
    expect(movementKindHints.adjustment).toContain('aumenta o disminuye');
  });
});
