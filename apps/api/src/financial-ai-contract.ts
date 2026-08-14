import { z } from 'zod';

const confidenceSchema = z.number().min(0).max(1);

const suggestion = <T extends z.ZodTypeAny>(value: T) =>
  z.object({
    value: value.nullable(),
    confidence: confidenceSchema,
  });

const optionalText = z.string().trim().max(500);
const shortText = z.string().trim().max(120);
const currencyCode = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);
const dateValue = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const moneyValue = z.string().regex(/^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$/);

export const expenseProofSuggestionsSchema = z.object({
  description: suggestion(optionalText),
  supplierName: suggestion(shortText),
  expenseDate: suggestion(dateValue),
  dueDate: suggestion(dateValue),
  invoiceNumber: suggestion(shortText),
  amount: suggestion(moneyValue),
  currency: suggestion(currencyCode),
  paymentMethodHint: suggestion(shortText),
  reference: suggestion(shortText),
  notes: suggestion(optionalText),
});

export const paymentProofSuggestionsSchema = z.object({
  paymentDate: suggestion(dateValue),
  amount: suggestion(moneyValue),
  currency: suggestion(currencyCode),
  reference: suggestion(shortText),
  payerName: suggestion(shortText),
  paymentMethodHint: suggestion(shortText),
  notes: suggestion(optionalText),
});

const baseExtractionSchema = z.object({
  status: z.enum(['completed', 'partial', 'unreadable']),
  needsReview: z.literal(true),
  sideEffectsApplied: z.literal(false),
  warnings: z.array(z.string().trim().max(240)).max(12),
});

export const financialProofExtractionSchema = z.discriminatedUnion('kind', [
  baseExtractionSchema.extend({
    kind: z.literal('expense'),
    suggestions: expenseProofSuggestionsSchema,
  }),
  baseExtractionSchema.extend({
    kind: z.literal('payment'),
    suggestions: paymentProofSuggestionsSchema,
  }),
]);

export type FinancialProofExtraction = z.infer<typeof financialProofExtractionSchema>;

/**
 * AI/OCR output is advisory only. The financial state machine remains authoritative:
 * this contract cannot create vendors/accounts/methods, submit, approve, post, or mutate records.
 */
export const parseFinancialProofExtraction = (value: unknown): FinancialProofExtraction =>
  financialProofExtractionSchema.parse(value);
