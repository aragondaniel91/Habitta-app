import { z } from 'zod';
import type { TenantContext } from '@habitta/shared-types';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('habitta-api'),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const meResponseSchema = z.object({
  userId: z.string().uuid(),
  tenant: z.custom<TenantContext>().nullable(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;
