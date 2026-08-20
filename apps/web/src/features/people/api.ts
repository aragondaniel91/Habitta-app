import type { Session } from '@supabase/supabase-js';
import { apiBaseUrl } from '../../lib/api';
export async function peopleApi<T>(path: string, session: Session, init?: RequestInit) {
  const r = await fetch(`${apiBaseUrl}${path}`, {
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
