import { describe, expect, it } from 'vitest';
import {
  balancesByCurrency,
  directionForKind,
  formatTreasuryAmount,
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
});
