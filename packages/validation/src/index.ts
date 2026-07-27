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
