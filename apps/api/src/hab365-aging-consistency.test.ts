import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { recurringDomainFailureFromPostgrest } from './recurring-dues-routes';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const routes = source('./recurring-dues-routes.ts');
const migration = source(
  '../../../supabase/migrations/20260826090000_hab365_shared_aging_date.sql',
);

describe('HAB-365 one aging rule for both receivables RPCs', () => {
  it('gives the aging date a single definition', () => {
    expect(migration).toContain('create or replace function public.receivable_aging_date');
    // Both RPCs must consume the helper rather than restate the rule.
    const uses =
      migration.match(/public\.receivable_aging_date\(b\.due_date, b\.issue_date/g) ?? [];
    expect(uses).toHaveLength(2);
    expect(migration).toContain('create or replace function public.get_receivables_summary');
    expect(migration).toContain('create or replace function public.get_receivables_aging');
  });

  it('ages debt already incurred and leaves an ordinary charge alone', () => {
    expect(migration).toContain("item_type in ('opening_balance', 'late_fee')");
    // HAB-344 decided an ordinary charge awaiting a due date stays current. Not reopened here.
    expect(migration).toContain("HAB-344's invariant is preserved deliberately");
    expect(migration).not.toMatch(/coalesce\(\s*item_due,\s*item_issue\s*\)/);
  });

  it('never widens who may read the totals', () => {
    expect(migration).toContain('can_read_board_aggregates(target)');
    expect(migration).toContain('can_read_financial_unit');
    expect(migration).toContain('set row_security=off');
    expect(migration).toMatch(
      /revoke all on function public\.get_receivables_summary\(uuid\), public\.get_receivables_aging\(uuid\) from public;/,
    );
    expect(migration).not.toMatch(/grant [^;]*to anon/);
  });

  it('translates late-fee failures instead of leaking the Postgres string', () => {
    expect(recurringDomainFailureFromPostgrest({ message: 'late fee generation denied' })).toEqual({
      status: 403,
      error: 'late_fee_generation_denied',
      publicMessage: 'No tienes permisos para calcular recargos por mora en este condominio.',
    });
    expect(
      recurringDomainFailureFromPostgrest({ message: 'late fee generation date required' }),
    ).toEqual({
      status: 422,
      error: 'late_fee_date_required',
      publicMessage: 'Indica la fecha hasta la que se deben calcular los recargos.',
    });
  });

  it('routes the late-fee preview through the shared result handler', () => {
    const preview = routes.slice(routes.indexOf("'/:id/late-fees/preview'"));
    expect(preview).toContain('return rpcResult(c, response, 200);');
    expect(preview.slice(0, 400)).not.toContain('response.ok ? 200 : 400');
  });
});
