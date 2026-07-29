import { describe, expect, it } from 'vitest';
import type { NotificationPreference } from '../features/notifications/types';
import {
  getChangedNotificationPreferences,
  getNotificationChannelTotals,
  normalizeNotificationPreferences,
} from './settings';

const preferences: NotificationPreference[] = [
  {
    condominium_id: 'condo',
    notification_type: 'payment_approved',
    in_app_enabled: true,
    email_enabled: true,
  },
  {
    condominium_id: 'condo',
    notification_type: 'receivable_overdue',
    in_app_enabled: false,
    email_enabled: true,
  },
];

describe('notification settings helpers', () => {
  it('fills missing event preferences with safe defaults', () => {
    const normalized = normalizeNotificationPreferences(preferences);
    expect(normalized).toHaveLength(10);
    expect(normalized.find((item) => item.notification_type === 'payment_approved')).toEqual({
      notification_type: 'payment_approved',
      in_app_enabled: true,
      email_enabled: true,
    });
    expect(normalized.find((item) => item.notification_type === 'payment_submitted')).toEqual({
      notification_type: 'payment_submitted',
      in_app_enabled: true,
      email_enabled: false,
    });
  });

  it('returns only changed preferences', () => {
    const original = normalizeNotificationPreferences(preferences);
    const current = original.map((item) =>
      item.notification_type === 'payment_submitted' ? { ...item, email_enabled: true } : item,
    );
    expect(getChangedNotificationPreferences(original, current)).toEqual([
      {
        notification_type: 'payment_submitted',
        in_app_enabled: true,
        email_enabled: true,
      },
    ]);
  });

  it('summarizes enabled channels', () => {
    expect(getNotificationChannelTotals(normalizeNotificationPreferences(preferences))).toEqual({
      inAppEnabled: 9,
      emailEnabled: 2,
      total: 10,
    });
  });
});
