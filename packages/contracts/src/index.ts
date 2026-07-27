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

export const decimalMoneySchema = z.string().regex(/^(0|[1-9][0-9]{0,15})\.[0-9]{2}$/);
export type DecimalMoney = z.infer<typeof decimalMoneySchema>;
export type ReceivablesSummary = {
  currency_code: string;
  total_debits: DecimalMoney;
  total_credits: DecimalMoney;
  net_outstanding: DecimalMoney;
};
