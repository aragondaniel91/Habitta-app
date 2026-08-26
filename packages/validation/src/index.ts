import { z } from 'zod';

export const uuidSchema = z.string().uuid();
export const condominiumTopologyRemediationSchema = z
  .object({
    propertyTopology: z.enum([
      'house_community',
      'single_building',
      'multi_building_complex',
      'mixed',
    ]),
    declaredUnitCount: z.number().int().min(1).max(100000).nullable().optional(),
    declaredBuildingCount: z.number().int().min(1).max(10000).nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.propertyTopology === 'house_community') {
      if (value.declaredUnitCount == null)
        context.addIssue({
          code: 'custom',
          path: ['declaredUnitCount'],
          message: 'Required for house communities',
        });
      if (value.declaredBuildingCount != null)
        context.addIssue({
          code: 'custom',
          path: ['declaredBuildingCount'],
          message: 'Not allowed for house communities',
        });
    }
    if (value.propertyTopology === 'single_building') {
      if (value.declaredUnitCount == null)
        context.addIssue({
          code: 'custom',
          path: ['declaredUnitCount'],
          message: 'Required for single buildings',
        });
      if (value.declaredBuildingCount != null && value.declaredBuildingCount !== 1)
        context.addIssue({
          code: 'custom',
          path: ['declaredBuildingCount'],
          message: 'Must be one when provided',
        });
    }
    if (
      value.propertyTopology === 'multi_building_complex' &&
      (value.declaredBuildingCount == null || value.declaredBuildingCount < 2)
    )
      context.addIssue({
        code: 'custom',
        path: ['declaredBuildingCount'],
        message: 'At least two are required',
      });
  });
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
      z
        .object({
          unit_code: z.string().trim().min(1).optional(),
          unit_id: z.string().uuid().optional(),
          building_name: z.string().trim().min(1).optional(),
          balance_type: z.enum(['debit', 'credit']),
          amount: money,
          currency_code: z
            .string()
            .regex(/^[A-Za-z]{3}$/)
            .transform((x) => x.toUpperCase()),
          effective_date: z.string().date(),
          due_date: z.string().date().optional(),
          debt_date: z.string().date().optional(),
          description: z.string().optional(),
        })
        .superRefine((row, context) => {
          if (!row.unit_id && !row.unit_code)
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'unit_id or unit_code is required',
            });
          if (row.due_date && row.debt_date && row.due_date !== row.debt_date)
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['due_date'],
              message: 'due_date and debt_date must match when both are provided',
            });
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
  'announcement_published',
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

export const lateFeeSettingsSchema = z.object({
  enabled: z.boolean(),
  ratePercent: z.number().min(0).max(100),
  gracePeriodDays: z.number().int().min(0).max(365),
  capPercent: z.number().min(0).max(500).nullable(),
  localCurrencyCode: z.string().regex(/^[A-Z]{3}$/),
  appliesToForeignCurrency: z.boolean(),
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

export const announcementPrioritySchema = z.enum(['normal', 'important', 'urgent']);
export const announcementStatusSchema = z.enum(['draft', 'scheduled', 'published', 'archived']);
export const announcementAudienceSchema = z.enum([
  'everyone',
  'owners',
  'tenants',
  'board',
  'building',
  'unit',
]);

const announcementAudienceFieldsSchema = z.object({
  audience: announcementAudienceSchema,
  buildingId: uuidSchema.optional(),
  unitId: uuidSchema.optional(),
});

const validateAnnouncementAudience = (
  value: {
    audience?: string | undefined;
    buildingId?: string | undefined;
    unitId?: string | undefined;
  },
  context: z.RefinementCtx,
) => {
  if (value.buildingId && value.unitId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['unitId'],
      message: 'An announcement cannot target a building and a unit together',
    });
  }
  if (value.audience === 'building' && !value.buildingId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['buildingId'],
      message: 'Building audience requires buildingId',
    });
  }
  if (value.audience === 'unit' && !value.unitId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['unitId'],
      message: 'Unit audience requires unitId',
    });
  }
  if (value.audience && value.audience !== 'building' && value.buildingId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['buildingId'],
      message: 'buildingId is only valid for building audiences',
    });
  }
  if (value.audience && value.audience !== 'unit' && value.unitId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['unitId'],
      message: 'unitId is only valid for unit audiences',
    });
  }
};

export const announcementCreateSchema = announcementAudienceFieldsSchema
  .extend({
    title: z.string().trim().min(3).max(160),
    summary: z.string().trim().min(3).max(280),
    body: z.string().trim().min(3).max(12000),
    priority: announcementPrioritySchema.default('normal'),
    audience: announcementAudienceSchema.default('everyone'),
    requiresAcknowledgement: z.boolean().default(false),
    expiresAt: z.string().datetime({ offset: true }).optional(),
  })
  .superRefine(validateAnnouncementAudience);

export const announcementUpdateSchema = z
  .object({
    title: z.string().trim().min(3).max(160).optional(),
    summary: z.string().trim().min(3).max(280).optional(),
    body: z.string().trim().min(3).max(12000).optional(),
    priority: announcementPrioritySchema.optional(),
    audience: announcementAudienceSchema.optional(),
    buildingId: uuidSchema.optional(),
    unitId: uuidSchema.optional(),
    requiresAcknowledgement: z.boolean().optional(),
    expiresAt: z.string().datetime({ offset: true }).optional(),
    clearExpires: z.boolean().optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .superRefine((value, context) => {
    if (!Object.values(value).some((field) => field !== undefined && field !== false)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one change is required' });
    }
    if (value.expiresAt && value.clearExpires) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['clearExpires'],
        message: 'Cannot set and clear expiration together',
      });
    }
    validateAnnouncementAudience(value, context);
  });

export const announcementListQuerySchema = z.object({
  status: announcementStatusSchema.optional(),
  priority: announcementPrioritySchema.optional(),
  audience: announcementAudienceSchema.optional(),
});

export const announcementScheduleSchema = z.object({
  publishAt: z.string().datetime({ offset: true }),
  expectedVersion: z.number().int().positive().optional(),
});

export const announcementActionSchema = z.object({
  expectedVersion: z.number().int().positive().optional(),
});

const currencyCodeSchema = z.string().regex(/^[A-Z]{3}$/);
const treasuryAccountTypeSchema = z.enum(['bank', 'cash']);
const treasuryDirectionSchema = z.enum(['credit', 'debit']);
const treasuryMovementKindSchema = z.enum([
  'opening_balance',
  'deposit',
  'withdrawal',
  'fee',
  'adjustment',
  'reversal',
]);

export const treasuryAccountSchema = z.object({
  name: z.string().trim().min(2).max(120),
  accountType: treasuryAccountTypeSchema,
  currencyCode: currencyCodeSchema,
  bankName: z.string().trim().min(2).max(120).optional(),
  accountReference: z.string().trim().min(2).max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
});

/** Editing carries the same shape plus an explicit archive decision. */
export const treasuryAccountUpdateSchema = treasuryAccountSchema.extend({
  isActive: z.boolean(),
});

// transfer_in and transfer_out are produced by create_treasury_transfer, and reversal by
// reverse_treasury_movement, so neither can be recorded straight from this endpoint.
export const treasuryMovementSchema = z.object({
  accountId: uuidSchema,
  direction: treasuryDirectionSchema,
  movementKind: treasuryMovementKindSchema.exclude(['reversal']),
  amount: decimalAmountSchema,
  occurredOn: z.string().date(),
  description: z.string().trim().min(2).max(500),
  reference: z.string().trim().max(160).optional(),
  idempotencyKey: z.string().trim().min(8).max(180),
});

export const treasuryTransferSchema = z
  .object({
    fromAccountId: uuidSchema,
    toAccountId: uuidSchema,
    amount: decimalAmountSchema,
    occurredOn: z.string().date(),
    description: z.string().trim().min(2).max(500),
    reference: z.string().trim().max(160).optional(),
    idempotencyKey: z.string().trim().min(8).max(160),
  })
  .refine((value) => value.fromAccountId !== value.toAccountId, {
    message: 'A transfer needs two different accounts',
    path: ['toAccountId'],
  });

export const treasuryReversalSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  idempotencyKey: z.string().trim().min(8).max(180),
});

export const treasuryReconciliationSchema = z
  .object({
    accountId: uuidSchema,
    startsOn: z.string().date(),
    endsOn: z.string().date(),
    statementOpeningBalance: z.string().regex(/^-?(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$/),
    statementClosingBalance: z.string().regex(/^-?(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$/),
    notes: z.string().trim().max(1000).optional(),
  })
  .refine((value) => value.startsOn <= value.endsOn, {
    message: 'The period cannot end before it starts',
    path: ['endsOn'],
  });

export const treasuryMatchSchema = z.object({ movementId: uuidSchema });
