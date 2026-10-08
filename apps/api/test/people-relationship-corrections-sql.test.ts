import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../../../supabase/migrations/20261007140000_people_relationship_corrections.sql',
    import.meta.url,
  ),
  'utf8',
);
const ownerShareGuard = readFileSync(
  new URL(
    '../../../supabase/migrations/20261007150000_unit_owner_percentage_sum_guard.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('people relationship correction SQL safeguards', () => {
  it('records audited before/after corrections and confines owner percentage changes to the RPC', () => {
    expect(migration).toContain('create table public.person_relationship_corrections');
    expect(migration).toContain(
      "relationship_kind in ('ownership', 'occupancy', 'community_role')",
    );
    expect(migration).toContain('create or replace function public.correct_unit_owner_percentage');
    expect(migration).toContain("'ownership percentage requires an audited correction'");
  });

  it('prevents silent occupancy and community-role history rewrites', () => {
    expect(migration).toContain('create or replace function public.guard_unit_occupancy_history');
    expect(migration).toContain("'occupancy type requires an audited correction'");
    expect(migration).toContain('create trigger unit_occupancies_history_guard');
    expect(migration).toContain("'relationship attributes require an audited correction'");
    expect(migration).toContain("'relationship start date cannot be changed'");
  });

  it('enforces owner shares transaction-safely while allowing legacy totals to be repaired downward', () => {
    expect(ownerShareGuard).toContain('from public.units where id = new.unit_id for update');
    expect(ownerShareGuard).toContain('previous_sum > 100 and next_sum >= previous_sum');
    expect(ownerShareGuard).toContain('previous_sum <= 100 and next_sum > 100');
    expect(ownerShareGuard).toContain('old.ends_at is null');
    expect(ownerShareGuard).toContain('new.ownership_percentage is not null');
    expect(ownerShareGuard).toContain('after insert or update on public.unit_owners');
  });
});
