import { describe, expect, it } from 'vitest';
import {
  notificationPreferencesSchema,
  notificationTypeSchema,
  notificationTypes,
} from './public';

const expectedNotificationTypes = [
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

describe('notification preference validation', () => {
  it('keeps the public contract aligned with every current database event type', () => {
    expect(notificationTypes).toEqual(expectedNotificationTypes);
    expect(notificationTypes).toHaveLength(25);
  });

  it.each(expectedNotificationTypes)('accepts preferences for %s', (notificationType) => {
    expect(
      notificationPreferencesSchema.safeParse({
        notificationType,
        emailEnabled: false,
        inAppEnabled: true,
      }).success,
    ).toBe(true);
    expect(notificationTypeSchema.safeParse(notificationType).success).toBe(true);
  });

  it('rejects unsupported notification types', () => {
    expect(
      notificationPreferencesSchema.safeParse({
        notificationType: 'not_a_real_event',
        emailEnabled: true,
        inAppEnabled: true,
      }).success,
    ).toBe(false);
  });
});
