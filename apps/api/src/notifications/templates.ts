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
  announcement_published: {
    version: 1,
    subject: 'Nuevo anuncio',
    intro: 'Se publicó un nuevo anuncio en tu condominio.',
  },
  maintenance_quote_submitted: {
    version: 1,
    subject: 'Nueva cotización de mantenimiento',
    intro: 'Se registró una nueva cotización para una orden de trabajo.',
  },
  maintenance_quote_approved: {
    version: 1,
    subject: 'Cotización aprobada',
    intro: 'Se aprobó una cotización de mantenimiento.',
  },
  maintenance_quote_rejected: {
    version: 1,
    subject: 'Cotización rechazada',
    intro: 'Se rechazó una cotización de mantenimiento.',
  },
  maintenance_evidence_added: {
    version: 1,
    subject: 'Nueva evidencia de mantenimiento',
    intro: 'Se agregó evidencia privada a una orden de trabajo.',
  },
  maintenance_expense_linked: {
    version: 1,
    subject: 'Gasto vinculado a mantenimiento',
    intro: 'Se vinculó un gasto existente a una orden de trabajo.',
  },
  service_request_submitted: {
    version: 1,
    subject: 'Nueva solicitud de servicio',
    intro: 'Se registró una nueva solicitud que requiere seguimiento.',
  },
  service_request_assigned: {
    version: 1,
    subject: 'Solicitud asignada',
    intro: 'Se te asignó una solicitud de servicio.',
  },
  service_request_resident_attention: {
    version: 1,
    subject: 'Tu solicitud requiere atención',
    intro: 'Hay una actualización en tu solicitud de servicio.',
  },
  service_request_resolved: {
    version: 1,
    subject: 'Solicitud resuelta',
    intro: 'Tu solicitud de servicio fue marcada como resuelta.',
  },
  service_request_cancelled: {
    version: 1,
    subject: 'Solicitud cancelada',
    intro: 'La solicitud de servicio fue cancelada.',
  },
  governance_opened: {
    version: 1,
    subject: 'Nueva votación disponible',
    intro: 'Ya puedes revisar y votar una nueva propuesta comunitaria.',
  },
  governance_due_soon: {
    version: 1,
    subject: 'Votación próxima a cerrar',
    intro: 'Una votación comunitaria cerrará dentro de las próximas 24 horas.',
  },
  governance_result_available: {
    version: 1,
    subject: 'Resultado de votación disponible',
    intro: 'La votación fue cerrada y su resultado ya puede revisarse.',
  },
  governance_decision_final: {
    version: 1,
    subject: 'Decisión comunitaria final',
    intro: 'Una propuesta comunitaria tiene una decisión final.',
  },
} as const;

export type NotificationTemplateKey = keyof typeof notificationTemplates;
