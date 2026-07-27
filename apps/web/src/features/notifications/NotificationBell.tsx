import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getUnreadCount } from './api';

export function NotificationBell({ session, onOpen }: { session: Session; onOpen: () => void }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const load = () =>
      void getUnreadCount(session)
        .then((value) => setCount(value.total))
        .catch(() => undefined);
    load();
    window.addEventListener('habitta:notifications-changed', load);
    return () => window.removeEventListener('habitta:notifications-changed', load);
  }, [session]);
  return (
    <button className="notification-bell" onClick={onOpen} aria-label="Abrir notificaciones">
      🔔{count > 0 && <span>{count > 99 ? '99+' : count}</span>}
    </button>
  );
}
