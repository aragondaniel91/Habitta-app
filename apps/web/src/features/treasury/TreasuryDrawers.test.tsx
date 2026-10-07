import { readFile } from 'node:fs/promises';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MovementDrawer, ReconciliationDrawer, TransferDrawer } from './TreasuryDrawers';
import type { TreasuryAccount } from './types';

const source = () => readFile(new URL('./TreasuryDrawers.tsx', import.meta.url), 'utf8');

const accounts: TreasuryAccount[] = [
  {
    id: 'account-1',
    name: 'Banco principal',
    account_type: 'bank',
    currency_code: 'USD',
    bank_name: null,
    account_reference: null,
    notes: null,
    is_active: true,
    balance: '100.00',
    latest_movement_at: null,
  },
  {
    id: 'account-2',
    name: 'Caja',
    account_type: 'cash',
    currency_code: 'USD',
    bank_name: null,
    account_reference: null,
    notes: null,
    is_active: true,
    balance: '0.00',
    latest_movement_at: null,
  },
];

const onClose = () => undefined;
const onSubmit = async () => undefined;
const inputPatterns = (html: string) =>
  [...html.matchAll(/pattern="([^"]+)"/g)].map((match) => match[1]!);

describe('treasury drawer layout migration', () => {
  it('uses the shared layout without changing the financial guard expressions', async () => {
    const drawers = await source();

    expect(drawers).toContain('import { FormActions, FormGrid }');
    expect(drawers.match(/<FormGrid(?:\s|>)/g)).toHaveLength(5);
    expect(drawers.match(/<FormActions sticky>/g)).toHaveLength(4);
    expect(drawers).toContain(
      "movementKind === 'withdrawal' ||\n    movementKind === 'fee' ||\n    (movementKind === 'adjustment' && adjustmentDirection === 'debit');",
    );
    expect(drawers).toContain(
      'const overdraft = isDebit && numericAmount > 0 && projectedBalance < 0',
    );
    expect(drawers).toContain('account.currency_code === origin?.currency_code');
    expect(drawers).toContain('!toAccountId ||');
    expect(drawers).toContain('overdraftReason.trim().length < 5');
    expect(drawers).toContain('Boolean(account?.latest_movement_at)');
    expect(drawers).not.toContain("Number(account?.balance ?? 0) !== 0");
  });

  it('keeps every cancel action non-submitting', async () => {
    const drawers = await source();

    expect(drawers.match(/onClick={onClose} type="button" variant="secondary"/g)).toHaveLength(4);
  });

  it('allows valid decimal amounts and signed reconciliation balances through native patterns', () => {
    const movementPatterns = inputPatterns(
      renderToStaticMarkup(
        <MovementDrawer accounts={accounts} onClose={onClose} onSubmit={onSubmit} />,
      ),
    );
    const transferPatterns = inputPatterns(
      renderToStaticMarkup(
        <TransferDrawer accounts={accounts} onClose={onClose} onSubmit={onSubmit} />,
      ),
    );
    const reconciliationPatterns = inputPatterns(
      renderToStaticMarkup(
        <ReconciliationDrawer accounts={accounts} onClose={onClose} onSubmit={onSubmit} />,
      ),
    );

    expect(movementPatterns).toHaveLength(1);
    expect(transferPatterns).toHaveLength(1);
    expect(reconciliationPatterns).toHaveLength(2);
    expect(new RegExp(movementPatterns[0]!).test('10.50')).toBe(true);
    expect(new RegExp(transferPatterns[0]!).test('10.50')).toBe(true);
    for (const pattern of reconciliationPatterns) {
      expect(new RegExp(pattern).test('-10.50')).toBe(true);
      expect(new RegExp(pattern).test('10.50')).toBe(true);
    }
  });
});
