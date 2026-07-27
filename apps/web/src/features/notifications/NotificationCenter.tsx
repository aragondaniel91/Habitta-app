import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  archiveNotification,
  getNotifications,
  getPreferences,
  markAllRead,
  markRead,
} from './api';
import type { Notification, NotificationPreference } from './types';
import { CondominiumNotificationSettings } from './CondominiumNotificationSettings';
import { NotificationDropdown } from './NotificationDropdown';
import { NotificationItem } from './NotificationItem';
import { NotificationPreferences } from './NotificationPreferences';

const changed = () => window.dispatchEvent(new Event('habitta:notifications-changed'));
export function NotificationCenter({
  session,
  condominiumId,
  open,
  onClose,
}: {
  session: Session;
  condominiumId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [items, setItems] = useState<Notification[]>([]),
    [preferences, setPreferences] = useState<NotificationPreference[]>([]),
    [unreadOnly, setUnreadOnly] = useState(false),
    [onlyCurrent, setOnlyCurrent] = useState(true),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  const load = useCallback(
    async (append = false) => {
      setLoading(true);
      setError('');
      try {
        const options: { condominiumId?: string; unreadOnly?: boolean; cursorAt?: string } = {
          unreadOnly,
        };
        if (onlyCurrent && condominiumId) options.condominiumId = condominiumId;
        const cursor = append ? items.at(-1)?.created_at : undefined;
        if (cursor) options.cursorAt = cursor;
        const [notifications, prefs] = await Promise.all([
          getNotifications(session, options),
          condominiumId ? getPreferences(session, condominiumId) : Promise.resolve([]),
        ]);
        setItems((current) => (append ? [...current, ...notifications] : notifications));
        setPreferences(prefs);
      } catch {
        setError('No se pudieron cargar las notificaciones.');
      } finally {
        setLoading(false);
      }
    },
    [session, condominiumId, unreadOnly, onlyCurrent, items],
  );
  useEffect(() => {
    if (open) void load();
  }, [open, unreadOnly, onlyCurrent, condominiumId]);
  const refresh = async () => {
    changed();
    await load();
  };
  return (
    <NotificationDropdown open={open} onClose={onClose}>
      <div className="notification-filters">
        <label>
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
          />{' '}
          Solo no leídas
        </label>
        <label>
          <input
            type="checkbox"
            checked={onlyCurrent}
            onChange={(e) => setOnlyCurrent(e.target.checked)}
          />{' '}
          Solo condominio actual
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      <button
        onClick={() =>
          void markAllRead(session, onlyCurrent ? condominiumId : undefined).then(refresh)
        }
      >
        Marcar todas como leídas
      </button>
      <div>
        {items.map((item) => (
          <NotificationItem
            key={item.id}
            item={item}
            onRead={() => void markRead(session, item.id).then(refresh)}
            onArchive={() => void archiveNotification(session, item.id).then(refresh)}
            onNavigate={() => {
              if (item.action_url?.startsWith('/app/') && !item.action_url.startsWith('//'))
                window.location.assign(item.action_url);
            }}
          />
        ))}
        {!loading && !items.length && <p className="empty">No tienes notificaciones.</p>}
      </div>
      {items.length >= 30 && (
        <button disabled={loading} onClick={() => void load(true)}>
          Cargar más
        </button>
      )}
      {loading && <p>Cargando…</p>}
      {condominiumId && (
        <>
          <NotificationPreferences
            session={session}
            condominiumId={condominiumId}
            preferences={preferences}
            onSaved={() => void load()}
          />
          <CondominiumNotificationSettings session={session} condominiumId={condominiumId} />
        </>
      )}
    </NotificationDropdown>
  );
}
