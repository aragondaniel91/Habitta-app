import type { PaymentMethod } from './types';

/** The method configuration owns whether a reference is required. */
export const paymentReferenceCopy = (method?: Pick<PaymentMethod, 'requires_reference'>) => ({
  label: `Referencia de la operación${
    method?.requires_reference ? ' (obligatoria)' : ' (opcional)'
  }`,
  hint: method?.requires_reference
    ? 'Ingresa el número de confirmación de la operación. Este método lo exige; no es el número interno de Habitta.'
    : 'Si tu método entregó un número de confirmación, puedes indicarlo aquí.',
});

export const paymentNotesCopy = {
  label: 'Comentario para revisión (opcional)',
  hint: 'Describe algo útil para identificar o revisar el pago. No sustituye la referencia ni el comprobante.',
};
