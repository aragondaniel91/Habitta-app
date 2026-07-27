import type { Session } from '@supabase/supabase-js';
import { savePreference } from './api';
import type { NotificationPreference } from './types';

const types = [
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
];
export function NotificationPreferences({
  session,
  condominiumId,
  preferences,
  onSaved,
}: {
  session: Session;
  condominiumId: string;
  preferences: NotificationPreference[];
  onSaved: () => void;
}) {
  return (
    <details>
      <summary>Preferencias</summary>
      <p>
        Los correos pueden desactivarse. Las alertas financieras críticas dentro de Habitta siempre
        permanecerán activas.
      </p>
      {types.map((type) => {
        const preference = preferences.find((item) => item.notification_type === type);
        return (
          <label key={type}>
            <input
              type="checkbox"
              checked={preference?.email_enabled ?? true}
              onChange={(event) =>
                void savePreference(session, condominiumId, {
                  notification_type: type,
                  email_enabled: event.target.checked,
                  in_app_enabled: preference?.in_app_enabled ?? true,
                }).then(onSaved)
              }
            />{' '}
            Email: {type.replaceAll('_', ' ')}
          </label>
        );
      })}
    </details>
  );
}
