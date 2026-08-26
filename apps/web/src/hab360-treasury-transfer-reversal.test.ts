import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const page = source('./pages/TreasuryPage.tsx');
const api = source('./features/treasury/api.ts');
const migration = source(
  '../../../supabase/migrations/20260826050000_hab360_reverse_treasury_transfer.sql',
);

describe('HAB-360 reversible treasury transfers', () => {
  it('lists transfers instead of loading them and never showing them', () => {
    expect(page).toContain('Transferencias entre cuentas');
    expect(page).toContain('{data.transfers.map((transfer)');
    expect(page).toContain('Todavía no hay transferencias');
  });

  it('names the accounts instead of exposing identifiers', () => {
    expect(page).toContain('accountsById.get(transfer.from_account_id)?.name');
    expect(page).toContain('accountsById.get(transfer.to_account_id)?.name');
    expect(page).not.toMatch(/>\s*\{transfer\.from_account_id\}/);
    expect(page).not.toMatch(/>\s*\{transfer\.id\}/);
  });

  it('offers a reversal gated behind an explicit reason', () => {
    expect(page).toContain('Reversar transferencia');
    expect(page).toContain('<ConfirmDialog');
    expect(page).toContain('Motivo del reverso');
    expect(page).toContain('if (reversalReason.trim().length < 2) return;');
    expect(page).not.toMatch(/window\.(confirm|alert|prompt)\s*\(/);
  });

  it('states that both accounts are compensated and history is preserved', () => {
    expect(page).toContain('un movimiento compensatorio en cada cuenta');
    expect(page).toContain('La transferencia original se conserva');
  });

  it('routes the reversal through the guarded endpoint', () => {
    expect(api).toContain('export const reverseTreasuryTransfer');
    expect(api).toContain('`${base(condominiumId)}/transfers/${transferId}/reverse`');
    expect(page).toContain('reverseTreasuryTransfer(');
    expect(api).not.toMatch(/transfers\/\$\{transferId\}[\s\S]{0,80}method: 'DELETE'/);
  });

  it('compensates both legs additively in the database', () => {
    expect(migration).toContain("'reversal'");
    expect(migration).toContain('reversal_of');
    // A single insert writes both legs, so an interrupted reversal cannot compensate just one.
    expect(migration).toContain('insert into public.treasury_movements');
    expect(migration).toContain('already_reversed');
    expect(migration).not.toMatch(/update\s+public\.treasury_transfers/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.treasury_/i);
  });

  it('keeps the reversal refused when an account was archived', () => {
    expect(migration).toContain('treasury account is inactive');
    expect(migration).toContain('treasury management denied');
    expect(migration).toContain('invalid treasury reversal');
  });
});
