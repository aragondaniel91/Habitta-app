import type { Session } from '@supabase/supabase-js';
import type {
  Notification,
  NotificationPreference,
  NotificationSettings,
  UnreadCount,
} from './types';

const request = async <T>(path: string, session: Session, init?: RequestInit) => {
  const response = await fetch(
    `${import.meta.env.VITE_API_URL ?? 'http://localhost:8787'}${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    },
  );
  if (!response.ok) throw new Error('No se pudieron actualizar las notificaciones.');
  return response.json() as Promise<T>;
};
export const getUnreadCount = (session: Session) =>
  request<UnreadCount>('/v1/notifications/unread-count', session);
export const getNotifications = (
  session: Session,
  options: { condominiumId?: string; unreadOnly?: boolean; cursorAt?: string } = {},
) => {
  const query = new URLSearchParams();
  if (options.condominiumId) query.set('condominiumId', options.condominiumId);
  if (options.unreadOnly) query.set('unreadOnly', 'true');
  if (options.cursorAt) query.set('cursorAt', options.cursorAt);
  return request<Notification[]>(`/v1/notifications${query.size ? `?${query}` : ''}`, session);
};
export const markRead = (session: Session, id: string) =>
  request(`/v1/notifications/${id}/read`, session, { method: 'POST' });
export const markAllRead = (session: Session, condominiumId?: string) =>
  request(
    `/v1/notifications/read-all${condominiumId ? `?condominiumId=${condominiumId}` : ''}`,
    session,
    { method: 'POST' },
  );
export const archiveNotification = (session: Session, id: string) =>
  request(`/v1/notifications/${id}/archive`, session, { method: 'POST' });
export const getPreferences = (session: Session, condominiumId: string) =>
  request<NotificationPreference[]>(
    `/v1/notification-preferences?condominiumId=${condominiumId}`,
    session,
  );
export const savePreference = (
  session: Session,
  condominiumId: string,
  preference: Pick<
    NotificationPreference,
    'notification_type' | 'email_enabled' | 'in_app_enabled'
  >,
) =>
  request('/v1/notification-preferences', session, {
    method: 'PATCH',
    body: JSON.stringify({
      condominiumId,
      notificationType: preference.notification_type,
      emailEnabled: preference.email_enabled,
      inAppEnabled: preference.in_app_enabled,
    }),
  });
export const getNotificationSettings = (session: Session, condominiumId: string) =>
  request<NotificationSettings>(`/v1/condominiums/${condominiumId}/notification-settings`, session);
export const saveNotificationSettings = (
  session: Session,
  condominiumId: string,
  settings: NotificationSettings,
) =>
  request<NotificationSettings>(
    `/v1/condominiums/${condominiumId}/notification-settings`,
    session,
    {
      method: 'PATCH',
      body: JSON.stringify({
        emailEnabled: settings.email_enabled,
        dueSoonEnabled: settings.due_soon_enabled,
        dueSoonDays: settings.due_soon_days,
        overdueEnabled: settings.overdue_enabled,
        timezone: settings.timezone,
      }),
    },
  );
