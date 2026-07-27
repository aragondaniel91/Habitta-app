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
export const receivableSchema = z.object({
  unitId: uuidSchema,
  conceptId: uuidSchema.optional(),
  description: z.string().trim().min(1),
  amount: money,
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  issueDate: z.string().date(),
  dueDate: z.string().date().optional(),
});
export const batchSchema = z.object({
  conceptId: uuidSchema,
  name: z.string().trim().min(1),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  issueDate: z.string().date(),
  dueDate: z.string().date(),
  distributionMethod: z.enum(['fixed_per_unit', 'custom_per_unit']),
  fixedAmount: money.optional(),
  rows: z.array(z.object({ unitId: uuidSchema, amount: money.optional() })).min(1),
  idempotencyKey: z.string().min(1),
});
export const reverseReceivableSchema = z.object({ reason: z.string().trim().min(3).max(500) });
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
  idempotencyKey: z.string().min(1),
  filename: z.string().optional(),
});
