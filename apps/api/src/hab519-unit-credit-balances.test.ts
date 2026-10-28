import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const api = source('./index.ts');
const migration = source(
  '../../../supabase/migrations/20261028120000_hab519_unit_credit_balances.sql',
);

describe('HAB-519 unit credit balances (pilot point #30 authorized credit)', () => {
  it('nets a credit entry against its reversal instead of summing history', () => {
    expect(migration).toContain('create or replace function public.get_unit_credit_balances');
    expect(migration).toContain("case e.direction when 'credit' then e.amount else -e.amount end");
    expect(migration).toContain('e.receivable_item_id is null');
  });

  it('restricts unit credit detail to unit-level financial authorization', () => {
    expect(migration).toContain('public.can_read_financial_unit(e.unit_id)');
    expect(migration).not.toContain('public.can_read_board_aggregates(target)');
    expect(migration).toContain('set row_security = off');
  });

  it('never widens who may execute the RPC', () => {
    expect(migration).toMatch(
      /revoke all on function public\.get_unit_credit_balances\(uuid\) from public, anon, authenticated, service_role;/,
    );
    expect(migration).not.toMatch(/grant [^;]*to anon/);
  });

  it('exposes the aggregate through the API by forwarding the caller token, not the service role', () => {
    const route = api.slice(api.indexOf("'/v1/condominiums/:id/receivables/credit-balances'"));
    expect(route.slice(0, 320)).toContain('rpc/get_unit_credit_balances');
    expect(route.slice(0, 320)).toContain('r.ok ? 200 : 403');
  });
});
