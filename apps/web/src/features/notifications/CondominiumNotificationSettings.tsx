import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Button } from '../../components/ui';
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
    [message, setMessage] = useState(''),
    [saving, setSaving] = useState(false);
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
        className="ux-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (saving) return;
          setSaving(true);
          void saveNotificationSettings(session, condominiumId, settings)
            .then((value) => {
              setSettings(value);
              setMessage('Configuración guardada.');
            })
            .catch(() => setMessage('No tienes permiso para modificar esta configuración.'))
            .finally(() => setSaving(false));
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
            onChange={(e) => {
              // An empty or otherwise unparsable field yields NaN from valueAsNumber; keep the
              // last valid value instead of letting NaN into state (and eventually the request
              // body, where JSON turns it into `null` and a stale-looking value gets saved).
              const parsed = e.target.valueAsNumber;
              if (Number.isNaN(parsed)) return;
              setSettings({ ...settings, due_soon_days: parsed });
            }}
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
        <Button disabled={saving} type="submit">
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
        <p>{message}</p>
      </form>
    </details>
  );
}
