import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getUnreadCount } from './api';

export function NotificationBell({ session, onOpen }: { session: Session; onOpen: () => void }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    void getUnreadCount(session)
      .then((rows) => setCount(rows.reduce((total, row) => total + Number(row.unread_count), 0)))
      .catch(() => undefined);
  }, [session]);
  return (
    <button className="notification-bell" onClick={onOpen} aria-label="Abrir notificaciones">
      🔔{count > 0 && <span>{count > 99 ? '99+' : count}</span>}
    </button>
  );
}
