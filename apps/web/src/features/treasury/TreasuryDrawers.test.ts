import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const source = () => readFile(new URL('./TreasuryDrawers.tsx', import.meta.url), 'utf8');

describe('treasury drawer layout migration', () => {
  it('uses the shared layout without changing the financial guard expressions', async () => {
    const drawers = await source();

    expect(drawers).toContain('import { FormActions, FormGrid }');
    expect(drawers.match(/<FormGrid>/g)).toHaveLength(5);
    expect(drawers.match(/<FormActions sticky>/g)).toHaveLength(4);
    expect(drawers).toContain(
      "const isDebit = movementKind === 'withdrawal' || movementKind === 'fee'",
    );
    expect(drawers).toContain(
      'const overdraft = isDebit && numericAmount > 0 && projectedBalance < 0',
    );
    expect(drawers).toContain('account.currency_code === origin?.currency_code');
    expect(drawers).toContain('!toAccountId ||');
    expect(drawers).toContain('overdraftReason.trim().length < 5');
  });

  it('keeps every cancel action non-submitting', async () => {
    const drawers = await source();

    expect(drawers.match(/onClick={onClose} type="button" variant="secondary"/g)).toHaveLength(4);
  });
});
