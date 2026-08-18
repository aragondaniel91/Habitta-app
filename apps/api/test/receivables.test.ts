import { describe, expect, it } from 'vitest';
import { batchSchema, openingBalancesSchema, receivableSchema } from '@habitta/validation';
describe('receivables validation', () => {
  it('rejects floating-point-invalid monetary values', () =>
    expect(
      receivableSchema.safeParse({
        unitId: '00000000-0000-0000-0000-000000000001',
        description: 'x',
        amount: 0,
        currencyCode: 'usd',
        issueDate: '2026-07-01',
      }).success,
    ).toBe(false));
  it('rejects a due date before the issue date', () =>
    expect(
      receivableSchema.safeParse({
        unitId: '00000000-0000-0000-0000-000000000001',
        description: 'x',
        amount: '10.00',
        currencyCode: 'USD',
        issueDate: '2026-07-10',
        dueDate: '2026-07-09',
      }).success,
    ).toBe(false));
  it('previews a fixed batch with decimal amounts', () =>
    expect(
      batchSchema.parse({
        conceptId: '00000000-0000-0000-0000-000000000001',
        name: 'July',
        currencyCode: 'USD',
        issueDate: '2026-07-01',
        dueDate: '2026-07-10',
        distributionMethod: 'fixed_per_unit',
        fixedAmount: '10.50',
        rows: [{ unitId: '00000000-0000-0000-0000-000000000002' }],
        idempotencyKey: 'x',
      }).fixedAmount,
    ).toBe('10.50'));
  it('normalizes opening-balance currency', () =>
    expect(
      openingBalancesSchema.parse({
        idempotencyKey: 'x',
        rows: [
          {
            unit_code: 'A1',
            balance_type: 'credit',
            amount: '1.20',
            currency_code: 'usd',
            effective_date: '2026-07-01',
          },
        ],
      }).rows[0]!.currency_code,
    ).toBe('USD'));
  it('accepts topology-safe opening-balance evidence', () =>
    expect(
      openingBalancesSchema.parse({
        idempotencyKey: 'x',
        rows: [
          {
            unit_id: '00000000-0000-0000-0000-000000000001',
            building_name: 'Torre II',
            unit_code: '1-A',
            balance_type: 'debit',
            amount: '1.20',
            currency_code: 'usd',
            effective_date: '2026-07-01',
          },
        ],
      }).rows[0],
    ).toMatchObject({
      unit_id: '00000000-0000-0000-0000-000000000001',
      building_name: 'Torre II',
      currency_code: 'USD',
    }));
});
