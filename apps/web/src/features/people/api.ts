import type { Session } from '@supabase/supabase-js';
const base = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';
export async function peopleApi<T>(path: string, session: Session, init?: RequestInit) {
  const r = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? 'No se pudo completar la acción');
  return data as T;
}
