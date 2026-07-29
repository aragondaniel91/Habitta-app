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

export type ServiceRequestRecord = {
  id: string;
  request_number: string;
  condominium_id: string;
  unit_id: string | null;
  category_id: string;
  requester_person_id: string | null;
  submitted_by_user_id: string;
  assigned_to_user_id: string | null;
  title: string;
  description: string;
  priority: import('@habitta/shared-types').ServiceRequestPriority;
  status: import('@habitta/shared-types').ServiceRequestStatus;
  due_at: string | null;
  resolution_summary: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type AnnouncementRecord = {
  id: string;
  condominium_id: string;
  title: string;
  summary: string;
  body: string;
  priority: import('@habitta/shared-types').AnnouncementPriority;
  status: import('@habitta/shared-types').AnnouncementStatus;
  audience: import('@habitta/shared-types').AnnouncementAudience;
  building_id: string | null;
  unit_id: string | null;
  requires_acknowledgement: boolean;
  publish_at: string | null;
  published_at: string | null;
  expires_at: string | null;
  archived_at: string | null;
  created_by: string;
  updated_by: string;
  version: number;
  created_at: string;
  updated_at: string;
};
