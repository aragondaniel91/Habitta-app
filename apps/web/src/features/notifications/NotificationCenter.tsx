import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getNotifications, getPreferences, markAllRead, markRead, savePreference } from './api';
import type { Notification, NotificationPreference } from './types';

const labels: Record<string, string> = {
  receivable_created: 'Cargos',
  opening_balance_created: 'Cargos',
  payment_submitted: 'Pagos',
  payment_correction_requested: 'Pagos',
  payment_rejected: 'Pagos',
  payment_approved: 'Pagos',
  payment_reversed: 'Pagos',
  payment_receipt_issued: 'Recibos',
  receivable_due_soon: 'Vencimientos',
  receivable_overdue: 'Vencimientos',
};
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
    [error, setError] = useState('');
  const load = () => {
    if (!condominiumId) return;
    void Promise.all([
      getNotifications(session, condominiumId),
      getPreferences(session, condominiumId),
    ])
      .then(([n, p]) => {
        setItems(n);
        setPreferences(p);
      })
      .catch(() => setError('No se pudieron cargar las notificaciones.'));
  };
  useEffect(load, [session, condominiumId, open]);
  if (!open) return null;
  return (
    <section className="notification-center" aria-label="Centro de notificaciones">
      <header>
        <h2>Notificaciones</h2>
        <button onClick={onClose}>Cerrar</button>
      </header>
      {error && <p>{error}</p>}
      <button
        onClick={() => {
          void markAllRead(session, condominiumId).then(load);
        }}
      >
        Marcar todas como leídas
      </button>
      <div>
        {items.length ? (
          items.map((item) => (
            <button
              className={item.read_at ? 'notification read' : 'notification'}
              key={item.id}
              onClick={() => {
                void markRead(session, item.id).then(load);
              }}
            >
              <strong>{item.title}</strong>
              <span>{item.body}</span>
              <small>{new Date(item.created_at).toLocaleString('es-VE')}</small>
            </button>
          ))
        ) : (
          <p className="empty">No tienes notificaciones todavía.</p>
        )}
      </div>
      <details>
        <summary>Preferencias de correo</summary>
        {Object.entries(labels).map(([type, label]) => {
          const preference = preferences.find((item) => item.notification_type === type);
          return (
            <label key={type}>
              <input
                type="checkbox"
                checked={preference?.email_enabled ?? true}
                onChange={(event) => {
                  void savePreference(session, condominiumId, {
                    notification_type: type,
                    email_enabled: event.target.checked,
                    in_app_enabled: preference?.in_app_enabled ?? true,
                  }).then(load);
                }}
              />{' '}
              {label}
            </label>
          );
        })}
      </details>
    </section>
  );
}
