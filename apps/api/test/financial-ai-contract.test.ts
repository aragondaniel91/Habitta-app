import { describe, expect, it } from 'vitest';
import { financialProofExtractionSchema } from '../src/financial-ai-contract';

const suggestion = <T>(value: T, confidence = 0.9) => ({ value, confidence });

describe('financial proof extraction contract', () => {
  it('accepts editable expense suggestions without financial side effects', () => {
    const parsed = financialProofExtractionSchema.parse({
      kind: 'expense',
      status: 'completed',
      needsReview: true,
      sideEffectsApplied: false,
      warnings: [],
      suggestions: {
        description: suggestion('Reparación de bomba de agua'),
        supplierName: suggestion('Servicios ACME'),
        expenseDate: suggestion('2026-08-13'),
        dueDate: suggestion(null, 0),
        invoiceNumber: suggestion('FAC-1002'),
        amount: suggestion('250.00'),
        currency: suggestion('USD'),
        paymentMethodHint: suggestion('Transferencia'),
        reference: suggestion('123456'),
        notes: suggestion(null, 0),
      },
    });

    expect(parsed.needsReview).toBe(true);
    expect(parsed.sideEffectsApplied).toBe(false);
    expect(parsed.suggestions.amount.value).toBe('250.00');
  });

  it('rejects output that claims it already mutated financial state', () => {
    expect(
      financialProofExtractionSchema.safeParse({
        kind: 'payment',
        status: 'unreadable',
        needsReview: true,
        sideEffectsApplied: true,
        warnings: ['No fue posible leer el comprobante.'],
        suggestions: {},
      }).success,
    ).toBe(false);
  });

  it('rejects unsafe money precision and impossible confidence values', () => {
    const result = financialProofExtractionSchema.safeParse({
      kind: 'payment',
      status: 'partial',
      needsReview: true,
      sideEffectsApplied: false,
      warnings: [],
      suggestions: {
        paymentDate: suggestion('2026-08-13'),
        amount: suggestion('10.999', 1.2),
        currency: suggestion('USD'),
        reference: suggestion(null, 0),
        payerName: suggestion(null, 0),
        paymentMethodHint: suggestion(null, 0),
        notes: suggestion(null, 0),
      },
    });

    expect(result.success).toBe(false);
  });
});
