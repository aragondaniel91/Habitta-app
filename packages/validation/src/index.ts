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
