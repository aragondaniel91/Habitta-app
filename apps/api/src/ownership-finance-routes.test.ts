import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('./ownership-finance-routes.ts', import.meta.url)),
  'utf8',
);
const recurringSource = readFileSync(
  fileURLToPath(new URL('./recurring-dues-routes.ts', import.meta.url)),
  'utf8',
);

describe('HAB-186 ownership and financial integrity API contract', () => {
  it('is mounted below the authenticated condominium router', () => {
    expect(recurringSource).toContain(
      "import { ownershipFinanceRoutes } from './ownership-finance-routes'",
    );
    expect(recurringSource).toContain("recurringDuesRoutes.route('/', ownershipFinanceRoutes)");
  });

  it('exposes formal ownership transfer and authoritative statement routes', () => {
    expect(source).toContain("post('/:id/units/:unitId/ownership-transfers'");
    expect(source).toContain("get('/:id/units/:unitId/ownership-transfers'");
    expect(source).toContain("get('/:id/units/:unitId/account-statement'");
    expect(source).toContain("rpc(c, 'transfer_unit_ownership'");
    expect(source).toContain("rpc(c, 'get_unit_account_statement'");
  });

  it('exposes solvency evaluation and certificate issuance through server RPCs', () => {
    expect(source).toContain("get('/:id/units/:unitId/solvency'");
    expect(source).toContain("post('/:id/units/:unitId/solvency-certificates'");
    expect(source).toContain("rpc(c, 'evaluate_unit_solvency'");
    expect(source).toContain("rpc(c, 'issue_solvency_certificate'");
  });

  it('keeps Venezuela FX configuration provider-neutral and approved-rate based', () => {
    expect(source).toContain("put('/:id/currency-policy'");
    expect(source).toContain("post('/:id/exchange-rates'");
    expect(source).toContain("z.enum(['disabled', 'approved_rates_only'])");
    expect(source).toContain("rpc(c, 'record_approved_exchange_rate'");
    expect(source).not.toContain('api.bcv');
    expect(source).not.toContain("fetch('https://");
  });

  it('does not perform direct writes to protected HAB-186 tables', () => {
    expect(source).not.toMatch(
      /rest\(c,\s*`?(ownership_transfers|solvency_certificates|condominium_exchange_rates|condominium_currency_policies)[^)]*\{\s*method:\s*'(POST|PUT|PATCH|DELETE)'/s,
    );
  });
});
