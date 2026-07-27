import type { Session } from '@supabase/supabase-js';
import type { Notification, NotificationPreference } from './types';

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
  request<{ condominium_id: string; unread_count: number }[]>(
    '/v1/notifications/unread-count',
    session,
  );
export const getNotifications = (session: Session, condominiumId?: string) =>
  request<Notification[]>(
    `/v1/notifications${condominiumId ? `?condominiumId=${condominiumId}` : ''}`,
    session,
  );
export const markRead = (session: Session, id: string) =>
  request(`/v1/notifications/${id}/read`, session, { method: 'POST' });
export const markAllRead = (session: Session, condominiumId?: string) =>
  request(
    `/v1/notifications/read-all${condominiumId ? `?condominiumId=${condominiumId}` : ''}`,
    session,
    { method: 'POST' },
  );
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
  request(`/v1/notification-preferences/${condominiumId}`, session, {
    method: 'PUT',
    body: JSON.stringify({
      notificationType: preference.notification_type,
      emailEnabled: preference.email_enabled,
      inAppEnabled: preference.in_app_enabled,
    }),
  });
