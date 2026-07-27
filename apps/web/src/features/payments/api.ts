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
