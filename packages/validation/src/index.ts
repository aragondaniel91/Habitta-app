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
