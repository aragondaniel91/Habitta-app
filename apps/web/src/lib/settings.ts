import type { NotificationPreference } from '../features/notifications/types';

export const notificationTypes = [
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
] as const;

export type NotificationType = (typeof notificationTypes)[number];

export type NotificationPreferenceDraft = {
  notification_type: NotificationType;
  in_app_enabled: boolean;
  email_enabled: boolean;
};

export const notificationTypeMetadata: Record<
  NotificationType,
  { label: string; description: string; group: 'cobranza' | 'pagos' | 'vencimientos' }
> = {
  receivable_created: {
    label: 'Nueva cuota o cargo',
    description: 'Se genera una nueva obligación para la unidad.',
    group: 'cobranza',
  },
  opening_balance_created: {
    label: 'Saldo inicial importado',
    description: 'Se registra un saldo de apertura durante la configuración.',
    group: 'cobranza',
  },
  payment_submitted: {
    label: 'Pago enviado',
    description: 'Un residente envía un pago para revisión.',
    group: 'pagos',
  },
  payment_correction_requested: {
    label: 'Corrección solicitada',
    description: 'Administración devuelve un pago para corregir información.',
    group: 'pagos',
  },
  payment_rejected: {
    label: 'Pago rechazado',
    description: 'El pago no supera la revisión administrativa.',
    group: 'pagos',
  },
  payment_approved: {
    label: 'Pago aprobado',
    description: 'El pago es validado y aplicado a la cuenta.',
    group: 'pagos',
  },
  payment_reversed: {
    label: 'Pago reversado',
    description: 'Un pago previamente aprobado es reversado con trazabilidad.',
    group: 'pagos',
  },
  payment_receipt_issued: {
    label: 'Recibo emitido',
    description: 'Se genera el comprobante oficial del pago aprobado.',
    group: 'pagos',
  },
  receivable_due_soon: {
    label: 'Cuota próxima a vencer',
    description: 'La obligación se acerca a su fecha límite.',
    group: 'vencimientos',
  },
  receivable_overdue: {
    label: 'Cuota vencida',
    description: 'La obligación supera su fecha de vencimiento.',
    group: 'vencimientos',
  },
};

export const notificationGroupLabels = {
  cobranza: 'Cuotas y saldos',
  pagos: 'Pagos y recibos',
  vencimientos: 'Recordatorios de vencimiento',
} as const;

export function normalizeNotificationPreferences(
  preferences: NotificationPreference[],
): NotificationPreferenceDraft[] {
  const byType = new Map(
    preferences.map((preference) => [preference.notification_type, preference]),
  );
  return notificationTypes.map((notificationType) => {
    const preference = byType.get(notificationType);
    return {
      notification_type: notificationType,
      in_app_enabled: preference?.in_app_enabled ?? true,
      email_enabled: preference?.email_enabled ?? false,
    };
  });
}

export function getChangedNotificationPreferences(
  original: NotificationPreferenceDraft[],
  current: NotificationPreferenceDraft[],
) {
  const originalByType = new Map(
    original.map((preference) => [preference.notification_type, preference]),
  );
  return current.filter((preference) => {
    const previous = originalByType.get(preference.notification_type);
    return (
      !previous ||
      previous.in_app_enabled !== preference.in_app_enabled ||
      previous.email_enabled !== preference.email_enabled
    );
  });
}

export function getNotificationChannelTotals(preferences: NotificationPreferenceDraft[]) {
  return {
    inAppEnabled: preferences.filter((preference) => preference.in_app_enabled).length,
    emailEnabled: preferences.filter((preference) => preference.email_enabled).length,
    total: preferences.length,
  };
}
