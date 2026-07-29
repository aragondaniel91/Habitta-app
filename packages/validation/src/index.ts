import { z } from 'zod';

export const uuidSchema = z.string().uuid();
export const tenantContextSchema = z.object({
  organizationId: uuidSchema,
  condominiumId: uuidSchema,
});

export const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export const organizationInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  condominiumName: z.string().trim().min(2).max(120).optional(),
});
export const condominiumInputSchema = z.object({
  organizationId: uuidSchema,
  name: z.string().trim().min(2).max(120),
});
export const buildingInputSchema = z.object({ name: z.string().trim().min(1).max(120) });
export const unitInputSchema = z.object({
  buildingId: uuidSchema.optional(),
  code: z.string().trim().min(1).max(40),
  type: z.enum(['apartment', 'house', 'commercial', 'parking', 'storage']),
  floor: z.string().trim().max(20).optional(),
  ownershipPercentage: z.number().positive().max(100).optional(),
  status: z.enum(['active', 'inactive']).default('active'),
});
export const personInputSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: z.string().email().optional(),
  phone: z.string().trim().optional(),
  documentType: z.string().trim().optional(),
  documentNumber: z.string().trim().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
});
export const ownerInputSchema = z.object({
  personId: uuidSchema,
  ownershipPercentage: z.number().positive().max(100).optional(),
  isPrimaryContact: z.boolean().default(false),
  startsAt: z.string().date().optional(),
});
export const occupancyInputSchema = z.object({
  personId: uuidSchema,
  occupancyType: z.enum(['owner_occupant', 'tenant', 'family_member', 'authorized_occupant']),
  isPrimaryContact: z.boolean().default(false),
  startsAt: z.string().date().optional(),
  endsAt: z.string().date().optional(),
});
export const invitationInputSchema = z.object({
  personId: uuidSchema,
  unitId: uuidSchema.optional(),
  email: z.string().email(),
  intendedRole: z.enum(['owner', 'tenant']),
  expiresAt: z.string().datetime().optional(),
});
export const decimalAmountSchema = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$/)
  .refine((value) => value !== '0' && value !== '0.0' && value !== '0.00')
  .transform((value) => {
    const [whole, fraction = ''] = value.split('.');
    return `${whole}.${fraction.padEnd(2, '0')}`;
  });
const money = decimalAmountSchema;
export const chargeConceptSchema = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  category: z.enum([
    'regular_dues',
    'extraordinary_dues',
    'service',
    'penalty',
    'adjustment',
    'opening_balance',
    'other',
  ]),
  defaultCurrencyCode: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  defaultAmount: money.optional(),
  isActive: z.boolean().optional(),
});
export const receivableSchema = z
  .object({
    unitId: uuidSchema,
    conceptId: uuidSchema.optional(),
    description: z.string().trim().min(1),
    amount: money,
    currencyCode: z.string().regex(/^[A-Z]{3}$/),
    issueDate: z.string().date(),
    dueDate: z.string().date().optional(),
  })
  .refine((value) => !value.dueDate || value.dueDate >= value.issueDate, {
    message: 'dueDate must not precede issueDate',
    path: ['dueDate'],
  });
export const batchSchema = z
  .object({
    conceptId: uuidSchema,
    name: z.string().trim().min(1),
    currencyCode: z.string().regex(/^[A-Z]{3}$/),
    issueDate: z.string().date(),
    dueDate: z.string().date(),
    distributionMethod: z.enum(['fixed_per_unit', 'custom_per_unit']),
    fixedAmount: money.optional(),
    rows: z.array(z.object({ unitId: uuidSchema, amount: money.optional() })).min(1),
    idempotencyKey: z.string().trim().min(1),
  })
  .refine((value) => value.dueDate >= value.issueDate, {
    message: 'dueDate must not precede issueDate',
    path: ['dueDate'],
  });
export const reverseReceivableSchema = z.object({ reason: z.string().trim().min(3).max(500) });
export const paymentMethodSchema = z.object({
  methodType: z.enum([
    'bank_transfer',
    'pago_movil',
    'zelle',
    'cash',
    'international_transfer',
    'paypal_manual',
    'other',
  ]),
  displayName: z.string().trim().min(1),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  accountHolder: z.string().optional(),
  bankName: z.string().optional(),
  accountIdentifierMasked: z.string().optional(),
  phoneMasked: z.string().optional(),
  emailMasked: z.string().email().optional(),
  instructions: z.string().optional(),
  requiresReference: z.boolean().optional(),
  requiresProof: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
export const paymentDraftSchema = z.object({
  unitId: uuidSchema,
  paymentMethodId: uuidSchema,
  submittedForPersonId: uuidSchema.optional(),
  paymentDate: z.string().date(),
  originalAmount: decimalAmountSchema,
  originalCurrencyCode: z.string().regex(/^[A-Z]{3}$/),
  payerName: z.string().trim().min(1),
  reference: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  idempotencyKey: z.string().min(1),
});
export const paymentUpdateSchema = paymentDraftSchema.omit({
  unitId: true,
  submittedForPersonId: true,
  idempotencyKey: true,
});
export const paymentReasonSchema = z.object({ reason: z.string().trim().min(3).max(500) });
export const allocationSchema = z
  .object({
    receivableItemId: uuidSchema,
    paymentAmount: decimalAmountSchema,
    receivableAmount: decimalAmountSchema,
    paymentCurrencyCode: z.string().regex(/^[A-Z]{3}$/),
    receivableCurrencyCode: z.string().regex(/^[A-Z]{3}$/),
    receivablePerPaymentRate: z
      .string()
      .regex(/^(0|[1-9][0-9]{0,13})(\.[0-9]{1,10})?$/)
      .optional(),
    fxRateSource: z.string().trim().optional(),
    fxRateAt: z.string().datetime().optional(),
  })
  .superRefine((value, context) => {
    if (value.paymentCurrencyCode === value.receivableCurrencyCode) {
      if (
        value.paymentAmount !== value.receivableAmount ||
        (value.receivablePerPaymentRate &&
          !/^1(?:\.0{1,10})?$/.test(value.receivablePerPaymentRate))
      )
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Same-currency allocations must be one to one',
        });
    } else if (!value.receivablePerPaymentRate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Cross-currency allocations require a rate',
      });
    }
  });
export const approvePaymentSchema = z
  .object({ allocations: z.array(allocationSchema) })
  .superRefine((value, context) => {
    const ids = value.allocations.map((allocation) => allocation.receivableItemId);
    if (new Set(ids).size !== ids.length)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Duplicate receivable item',
      });
  });
export const openingBalancesSchema = z.object({
  rows: z
    .array(
      z.object({
        unit_code: z.string().trim().min(1),
        balance_type: z.enum(['debit', 'credit']),
        amount: money,
        currency_code: z
          .string()
          .regex(/^[A-Za-z]{3}$/)
          .transform((x) => x.toUpperCase()),
        effective_date: z.string().date(),
        description: z.string().optional(),
      }),
    )
    .min(1),
  idempotencyKey: z.string().trim().min(1),
  filename: z.string().optional(),
});

export const notificationTypeSchema = z.enum([
  'receivable_created',
  'opening_balance_created',
  'payment_submitted',
  'payment_correction_requested',
  'payment_rejected',
  'payment_approved',
  'payment_reversed',
  'payment_receipt_issued',
  'receivable_due_soon',
  'receivable_overdue',
]);
export const notificationPreferencesSchema = z.object({
  notificationType: notificationTypeSchema,
  emailEnabled: z.boolean(),
  inAppEnabled: z.boolean().default(true),
});
export const notificationSettingsSchema = z.object({
  emailEnabled: z.boolean(),
  dueSoonEnabled: z.boolean(),
  dueSoonDays: z.number().int().min(1).max(30),
  overdueEnabled: z.boolean(),
  timezone: z.string().trim().min(1).max(64),
});

export const serviceRequestPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);
export const serviceRequestStatusSchema = z.enum([
  'submitted',
  'acknowledged',
  'in_progress',
  'waiting_resident',
  'waiting_vendor',
  'resolved',
  'closed',
  'cancelled',
]);
export const serviceRequestVisibilitySchema = z.enum(['public', 'internal']);

export const serviceRequestCategoryInputSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9_-]{1,31}$/),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional(),
  sortOrder: z.number().int().min(0).max(1000).default(0),
  isActive: z.boolean().default(true),
});

export const serviceRequestCreateSchema = z.object({
  unitId: uuidSchema.optional(),
  categoryId: uuidSchema,
  requesterPersonId: uuidSchema.optional(),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(3).max(5000),
  priority: serviceRequestPrioritySchema.default('normal'),
});

export const serviceRequestUpdateSchema = z
  .object({
    status: serviceRequestStatusSchema.optional(),
    priority: serviceRequestPrioritySchema.optional(),
    categoryId: uuidSchema.optional(),
    assignedToUserId: uuidSchema.optional(),
    clearAssignee: z.boolean().optional(),
    dueAt: z.string().datetime({ offset: true }).optional(),
    clearDue: z.boolean().optional(),
    resolution: z.string().trim().min(3).max(4000).optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .superRefine((value, context) => {
    if (!Object.values(value).some((field) => field !== undefined && field !== false)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one change is required' });
    }
    if (value.assignedToUserId && value.clearAssignee) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['clearAssignee'],
        message: 'Cannot assign and clear an assignee together',
      });
    }
    if (value.dueAt && value.clearDue) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['clearDue'],
        message: 'Cannot set and clear a due date together',
      });
    }
    if (value.status === 'cancelled') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['status'],
        message: 'Use the cancellation endpoint',
      });
    }
    if (value.resolution && value.status && !['resolved', 'closed'].includes(value.status)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['resolution'],
        message: 'Resolution is only valid for resolved requests',
      });
    }
  });

export const serviceRequestCommentSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  visibility: serviceRequestVisibilitySchema.default('public'),
});

export const serviceRequestCancelSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const serviceRequestListQuerySchema = z.object({
  status: serviceRequestStatusSchema.optional(),
  priority: serviceRequestPrioritySchema.optional(),
  unitId: uuidSchema.optional(),
  categoryId: uuidSchema.optional(),
  assignedToUserId: uuidSchema.optional(),
});

export const serviceRequestCategoryUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().max(500).optional(),
    sortOrder: z.number().int().min(0).max(1000).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one category change is required',
  });
