import type { Session } from '@supabase/supabase-js';
export const paymentApi = async <T>(path: string, session: Session, init?: RequestInit) => {
  const r = await fetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:8787'}${path}`, {
    ...init,
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
    `${import.meta.env.VITE_API_URL ?? 'http://localhost:8787'}${path}`,
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
