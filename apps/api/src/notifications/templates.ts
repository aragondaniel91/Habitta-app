export const notificationTemplates = {
  new_receivable: { version: 1, subject: 'Nuevo cargo', intro: 'Se registró un nuevo cargo.' },
  payment_submitted_admin: {
    version: 1,
    subject: 'Pago pendiente de revisión',
    intro: 'Se registró un pago para revisión.',
  },
  payment_correction_requested: {
    version: 1,
    subject: 'Corrección solicitada',
    intro: 'Tu pago requiere una corrección.',
  },
  payment_rejected: { version: 1, subject: 'Pago rechazado', intro: 'El pago fue rechazado.' },
  payment_approved: { version: 1, subject: 'Pago aprobado', intro: 'El pago fue aprobado.' },
  payment_reversed: { version: 1, subject: 'Pago reversado', intro: 'El pago fue reversado.' },
  payment_receipt_available: {
    version: 1,
    subject: 'Recibo disponible',
    intro: 'Tu recibo ya está disponible.',
  },
  receivable_due_soon: {
    version: 1,
    subject: 'Cargo próximo a vencer',
    intro: 'Tienes un cargo próximo a vencer.',
  },
  receivable_overdue: { version: 1, subject: 'Cargo vencido', intro: 'Tienes un cargo vencido.' },
} as const;

export type NotificationTemplateKey = keyof typeof notificationTemplates;
