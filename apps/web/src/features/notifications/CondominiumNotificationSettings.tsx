import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getNotificationSettings, saveNotificationSettings } from './api';
import type { NotificationSettings } from './types';

export function CondominiumNotificationSettings({
  session,
  condominiumId,
}: {
  session: Session;
  condominiumId: string;
}) {
  const [settings, setSettings] = useState<NotificationSettings | null>(null),
    [message, setMessage] = useState('');
  useEffect(() => {
    if (!condominiumId) return;
    void getNotificationSettings(session, condominiumId)
      .then(setSettings)
      .catch(() => setSettings(null));
  }, [session, condominiumId]);
  if (!settings) return null;
  return (
    <details>
      <summary>Configuración administrativa</summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void saveNotificationSettings(session, condominiumId, settings)
            .then((value) => {
              setSettings(value);
              setMessage('Configuración guardada.');
            })
            .catch(() => setMessage('No tienes permiso para modificar esta configuración.'));
        }}
      >
        <label>
          <input
            type="checkbox"
            checked={settings.email_enabled}
            onChange={(e) => setSettings({ ...settings, email_enabled: e.target.checked })}
          />{' '}
          Emails habilitados
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.due_soon_enabled}
            onChange={(e) => setSettings({ ...settings, due_soon_enabled: e.target.checked })}
          />{' '}
          Aviso antes del vencimiento
        </label>
        <label>
          Días de anticipación
          <input
            type="number"
            min="1"
            max="30"
            value={settings.due_soon_days}
            onChange={(e) => setSettings({ ...settings, due_soon_days: e.target.valueAsNumber })}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.overdue_enabled}
            onChange={(e) => setSettings({ ...settings, overdue_enabled: e.target.checked })}
          />{' '}
          Avisos vencidos
        </label>
        <label>
          Zona horaria
          <input
            value={settings.timezone}
            onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
          />
        </label>
        <button>Guardar</button>
        <p>{message}</p>
      </form>
    </details>
  );
}
