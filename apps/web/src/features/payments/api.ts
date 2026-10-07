import type { Session } from '@supabase/supabase-js';
import { apiBaseUrl } from '../../lib/api';

const normalizeJsonBody = (body: BodyInit | null | undefined, preserveEmptyStrings = false) => {
  if (typeof body !== 'string') return body;
  try {
    const value = JSON.parse(body) as unknown;
    if (!value || Array.isArray(value) || typeof value !== 'object') return body;
    return JSON.stringify(
      Object.fromEntries(
        Object.entries(value).filter(
          ([, fieldValue]) =>
            fieldValue !== undefined && (preserveEmptyStrings || fieldValue !== ''),
        ),
      ),
    );
  } catch {
    return body;
  }
};

/** Spanish explanation and next step for each domain reason the API forwards. */
export const paymentFailureMessages: Record<string, string> = {
  'independent payment approval required':
    'Requiere aprobaci\u00f3n de otro revisor. Este pago fue registrado por ti y debe aprobarlo otro revisor.',
  'payment cannot be submitted':
    'Este pago ya no está en borrador ni devuelto para corrección, así que no puede enviarse otra vez. Actualiza la lista para ver su estado actual.',
  'payment reference required':
    'El método de pago exige una referencia. Edita el borrador, agrega la referencia bancaria y vuelve a enviarlo.',
  'payment proof required':
    'El método de pago exige un comprobante. Adjunta el comprobante en el detalle del pago y vuelve a enviarlo.',
  'payment update denied':
    'Solo se pueden editar pagos en borrador o devueltos para corrección, con monto, moneda y pagador válidos.',
  'invalid payment draft':
    'Revisa el borrador: la unidad, la fecha, un monto positivo con hasta dos decimales y el pagador son obligatorios.',
  'invalid payment method or unit':
    'El método de pago no está activo, no coincide con la moneda o la unidad no pertenece al condominio.',
  'invalid payment method or currency':
    'El método de pago está inactivo o usa otra moneda. Elige un método activo en la moneda del pago.',
  'invalid represented person':
    'La persona representada debe ser propietaria u ocupante vigente de la unidad.',
  'invalid transition':
    'El pago cambió de estado o falta el motivo. Actualiza la lista e indica el motivo si es una devolución o un rechazo.',
  'invalid payment status':
    'El pago ya no está pendiente de revisión. Actualiza la lista para ver su estado actual.',
  'invalid payment allocations':
    'La aplicación del pago ya no es válida (saldos o montos cambiaron). Vuelve a calcular la vista previa antes de aprobar.',
  'payment not found': 'No encontramos el pago. Es posible que se haya eliminado o pertenezca a otro condominio.',
  'payment not reversible': 'Solo se pueden reversar pagos aprobados.',
  'reversal reason required': 'Indica el motivo del reverso.',
  'treasury account can only be selected while payment is under review':
    'La cuenta de tesorería solo puede elegirse mientras el pago está en revisión.',
  'payment method not found': 'No encontramos el método de pago. Actualiza la lista.',
  'payment method in use':
    'Este método ya tiene pagos registrados y forma parte de su historial, por eso no puede eliminarse. Desactívalo para que no se ofrezca en pagos nuevos.',
  'idempotency conflict':
    'Ya existe un pago registrado con esta misma solicitud y datos distintos. Actualiza la lista antes de intentarlo de nuevo.',
};

const genericFailureMessages: Record<string, string> = {
  Forbidden: 'No tienes permiso para realizar esta acción en Pagos.',
  'Request conflict':
    'No se pudo completar la operación porque el pago cambió o no cumple una regla. Actualiza la información e inténtalo de nuevo.',
  'Payment method not found': 'No encontramos el método de pago o no tienes permiso para editarlo.',
  'Payment not found': 'No encontramos el pago.',
  'Receipt not found': 'Este pago todavía no tiene recibo emitido.',
  'Proof not found': 'Este pago no tiene un comprobante adjunto.',
  'Proof unavailable':
    'El comprobante está registrado, pero el archivo no está disponible. Solicita una corrección para que el pagador lo adjunte de nuevo.',
  'Unsupported proof type': 'Formato no admitido. Adjunta un JPEG, PNG, WebP o PDF.',
  'Proof is empty': 'El archivo está vacío. Selecciona el comprobante de nuevo.',
  'Proof exceeds 10 MB': 'El comprobante supera 10 MB. Reduce su tamaño e inténtalo de nuevo.',
  'Proof metadata could not be saved':
    'No se pudo guardar el comprobante. Solo se adjunta a pagos en borrador o devueltos para corrección.',
  'Too many requests': 'Demasiados intentos seguidos. Espera un momento e inténtalo de nuevo.',
};

export const paymentFailureMessage = (data: unknown) => {
  const value = (data ?? {}) as { error?: unknown; reason?: unknown };
  if (typeof value.reason === 'string' && paymentFailureMessages[value.reason])
    return paymentFailureMessages[value.reason]!;
  if (typeof value.error === 'string')
    return genericFailureMessages[value.error] ?? value.error;
  if (value.error && typeof value.error === 'object')
    return 'Revisa los datos del formulario: hay campos con un formato inválido.';
  return 'No se pudo completar la operación.';
};

export const paymentApi = async <T>(path: string, session: Session, init?: RequestInit) => {
  const isPaymentMethodPatch =
    init?.method?.toUpperCase() === 'PATCH' &&
    /^\/v1\/condominiums\/[^/]+\/payment-methods\/[^/?#]+(?:[/?#]|$)/.test(path);
  const normalizedBody = normalizeJsonBody(init?.body, isPaymentMethodPatch);
  const r = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    ...(normalizedBody === undefined ? {} : { body: normalizedBody }),
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(paymentFailureMessage(data));
  return data as T;
};
export const paymentProof = async (
  path: string,
  session: Session,
  file?: File,
): Promise<Blob | { id: string }> => {
  const response = await fetch(
    `${apiBaseUrl}${path}`,
    file
      ? {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': file.type,
            'X-Filename': file.name,
          },
          body: file,
        }
      : { headers: { Authorization: `Bearer ${session.access_token}` } },
  );
  if (!response.ok) {
    const value = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(
      value?.error ? paymentFailureMessage(value) : 'No se pudo procesar el comprobante.',
    );
  }
  return file ? ((await response.json()) as { id: string }) : response.blob();
};
