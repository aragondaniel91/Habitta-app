import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LIFECYCLE_CONTRACT, lifecycleGaps } from '../../api/src/lifecycle-contract';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const panel = source('./features/receivables/OwnershipTransferPanel.tsx');
const routes = source('../../api/src/ownership-finance-routes.ts');
const migration = source(
  '../../../supabase/migrations/20260826070000_hab360_annul_ownership_and_solvency.sql',
);

describe('HAB-360 annulment for ownership transfers and solvency certificates', () => {
  it('offers the revert only where it is safe', () => {
    expect(panel).toContain('Revertir traspaso de propiedad');
    expect(panel).toContain('transfer.id === latestTransferId');
    expect(panel).toContain('!isCompensating && !alreadyReverted');
    expect(panel).toContain('<Badge tone="neutral">Reverso</Badge>');
    expect(panel).toContain('<Badge tone="neutral">Revertido</Badge>');
  });

  it('requires a written reason and explains what survives', () => {
    expect(panel).toContain('<ConfirmDialog');
    expect(panel).toContain('Motivo del reverso');
    expect(panel).toContain('revertReason.trim().length < 3');
    expect(panel).toContain('El traspaso original se conserva en el historial.');
    expect(panel).not.toMatch(/window\.(confirm|alert|prompt)\s*\(/);
  });

  it('routes both annulments through guarded endpoints', () => {
    expect(routes).toContain("'/:id/units/:unitId/ownership-transfers/:transferId/revert'");
    expect(routes).toContain("'/:id/units/:unitId/solvency-certificates/:certificateId/annul'");
    expect(routes).toContain("rpc(c, 'revert_unit_ownership_transfer'");
    expect(routes).toContain("rpc(c, 'annul_solvency_certificate'");
    expect(routes).not.toMatch(/method:\s*'DELETE'/);
  });

  it('never rewrites the record it corrects', () => {
    expect(migration).toContain('reverts_transfer_id');
    expect(migration).toContain('only the latest ownership transfer can be reverted');
    // The revert opens fresh ownership rows; it never reopens closed history.
    expect(migration).toContain('insert into public.unit_owners(');
    expect(migration).not.toMatch(/update\s+public\.unit_owners[\s\S]{0,120}ends_at\s*=\s*null/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.(unit_owners|ownership_transfers)/i);
  });

  it('keeps public verification honest about an annulled certificate', () => {
    expect(migration).toContain("'annulled', sc.annulled_at is not null");
    expect(migration).toContain(
      "'within_validity_window', sc.annulled_at is null and current_date <= sc.valid_until",
    );
    expect(migration).toContain('solvency certificate already annulled');
  });

  it('preserves the tenant purge escape hatch it replaced', () => {
    expect(migration).toContain('is_condominium_purge_authorized(old.condominium_id)');
  });

  it('closes every known lifecycle gap', () => {
    expect(lifecycleGaps()).toEqual([]);
    expect(LIFECYCLE_CONTRACT.length).toBeGreaterThan(30);
  });
});
