import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL(
  '../../../supabase/migrations/20260730235000_expenses_suppliers_budgets.sql',
  import.meta.url,
);

describe('expenses migration contract', () => {
  it('separates currencies and protects immutable expense lifecycle history', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(migration).toContain("check (currency_code ~ '^[A-Z]{3}$')");
    expect(migration).toContain('group by condominium_id, currency_code');
    expect(migration).toContain('create table public.expense_events');
    expect(migration).toContain('create function public.approve_expense');
    expect(migration).toContain('create function public.mark_expense_paid');
    expect(migration).toContain('create function public.void_expense');
    expect(migration).not.toContain('create policy expenses_delete');
    expect(migration).not.toContain('grant delete on public.expenses');
  });

  it('uses condominium-scoped RLS for suppliers categories budgets and expenses', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(migration).toContain('create function public.can_read_expenses(target uuid)');
    expect(migration).toContain('create function public.can_manage_expenses(target uuid)');
    expect(migration).toContain('alter table public.expenses enable row level security');
    expect(migration).toContain('alter table public.suppliers enable row level security');
    expect(migration).toContain('alter table public.budgets enable row level security');
    expect(migration).toContain('with (security_invoker = true)');
  });
});
