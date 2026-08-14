import { z } from 'zod';

// Public notification contract. Keep this list aligned with the database
// `notification_event_type` enum. Consumers import the validation package root,
// so explicit exports here override the legacy definitions re-exported below.
export const notificationTypes = [
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
  'maintenance_quote_submitted',
  'maintenance_quote_approved',
  'maintenance_quote_rejected',
  'maintenance_evidence_added',
  'maintenance_expense_linked',
  'service_request_submitted',
  'service_request_assigned',
  'service_request_resident_attention',
  'service_request_resolved',
  'service_request_cancelled',
  'governance_opened',
  'governance_due_soon',
  'governance_result_available',
  'governance_decision_final',
] as const;

export const notificationTypeSchema = z.enum(notificationTypes);

export const notificationPreferencesSchema = z.object({
  notificationType: notificationTypeSchema,
  emailEnabled: z.boolean(),
  inAppEnabled: z.boolean().default(true),
});

export * from './index';
