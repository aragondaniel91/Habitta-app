import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const source = () => readFile(new URL('./ReconciliationWorkspace.tsx', import.meta.url), 'utf8');

describe('reconciliation workspace', () => {
  it('shows authoritative progress, paginates candidates, and preserves one-way matching', async () => {
    const workspace = await source();
    expect(workspace).toContain('loadTreasuryReconciliationWorkspace');
    expect(workspace).toContain('workspace.total_count');
    expect(workspace).toContain('Cargar más');
    expect(workspace).toContain('matchTreasuryMovement');
    expect(workspace).toContain('no se puede deshacer');
    expect(workspace).not.toContain('unmatch');
  });

  it('requires explicit final-close confirmation with the account, balances, and immutability warning', async () => {
    const workspace = await source();
    expect(workspace).toContain('Cerrar conciliación definitivamente');
    expect(workspace).toContain('Estado externo final');
    expect(workspace).toContain('Esta conciliación no podrá editarse ni reabrirse');
    expect(workspace).toContain('book_closing_balance');
    expect(workspace).toContain('difference');
  });
});
