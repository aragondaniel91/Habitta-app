import { describe, expect, it } from 'vitest';
import { validateRecurringPlanDraft } from './recurring-plan-validation';

const validDraft = {
  conceptId: '11111111-1111-4111-8111-111111111111',
  financialScopeId: '22222222-2222-4222-8222-222222222222',
  name: 'Cuota ordinaria mensual',
  distribution: 'participation_percentage' as const,
  amount: '1250.00',
  currencyCode: 'USD',
  startsOn: '2026-08-01',
  endsOn: '',
  issueDay: '1',
  dueDay: '10',
};

describe('HAB-336 recurring plan semantic validation', () => {
  it('accepts a payload aligned with the API contract', () => {
    expect(validateRecurringPlanDraft(validDraft)).toEqual({ valid: true, errors: {} });
  });

  it.each(['', '0', '0.00', '-1', '12.345', 'abc'])(
    'rejects non-positive or invalid money before the API call: %s',
    (amount) => {
      const result = validateRecurringPlanDraft({ ...validDraft, amount });
      expect(result.valid).toBe(false);
      expect(result.errors.amount).toContain('mayor que 0');
    },
  );

  it('rejects missing concept and financial scope identifiers', () => {
    const result = validateRecurringPlanDraft({
      ...validDraft,
      conceptId: '',
      financialScopeId: '',
    });
    expect(result.errors.conceptId).toBe('Selecciona un concepto.');
    expect(result.errors.financialScopeId).toBe('Selecciona un ámbito financiero.');
  });

  it('rejects due day before issue day and days outside 1..28', () => {
    expect(
      validateRecurringPlanDraft({ ...validDraft, issueDay: '15', dueDay: '10' }).errors.dueDay,
    ).toContain('anterior');
    expect(validateRecurringPlanDraft({ ...validDraft, issueDay: '29' }).errors.issueDay).toContain(
      '1 y 28',
    );
  });

  it('rejects invalid date ordering and invalid currency', () => {
    const result = validateRecurringPlanDraft({
      ...validDraft,
      currencyCode: 'US',
      endsOn: '2026-07-31',
    });
    expect(result.errors.currencyCode).toContain('3 letras');
    expect(result.errors.endsOn).toContain('anterior');
  });
});
