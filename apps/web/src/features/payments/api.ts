import type { Session } from '@supabase/supabase-js';
import { apiBaseUrl } from '../../lib/api';

const normalizeJsonBody = (body: BodyInit | null | undefined) => {
  if (typeof body !== 'string') return body;
  try {
    const value = JSON.parse(body) as unknown;
    if (!value || Array.isArray(value) || typeof value !== 'object') return body;
    return JSON.stringify(
      Object.fromEntries(
        Object.entries(value).filter(([, fieldValue]) => fieldValue !== '' && fieldValue !== undefined),
      ),
    );
  } catch {
    return body;
  }
};

export const paymentApi = async <T>(path: string, session: Session, init?: RequestInit) => {
  const normalizedBody = normalizeJsonBody(init?.body);
  const r = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    ...(normalizedBody === undefined ? {} : { body: normalizedBody }),
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? 'No se pudo completar la operación');
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
    const value = (await response.json()) as { error?: string };
    throw new Error(value.error ?? 'No se pudo procesar el comprobante');
  }
  return file ? ((await response.json()) as { id: string }) : response.blob();
};
