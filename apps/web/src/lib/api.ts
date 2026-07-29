import type { Session } from '@supabase/supabase-js';

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_URL ?? 'http://localhost:8787';

export class ApiRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
}

const messageForStatus = (status: number) => {
  if (status === 401) return 'Tu sesión expiró. Vuelve a iniciar sesión.';
  if (status === 403) return 'No tienes permisos para realizar esta acción.';
  if (status >= 500) return 'Habitta no pudo completar la solicitud. Intenta nuevamente.';
  return 'No se pudo completar la solicitud.';
};

export async function apiRequest<T>(path: string, session: Session, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${session.access_token}`);
  if (init?.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');

  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });

  if (!response.ok) throw new ApiRequestError(response.status, messageForStatus(response.status));
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
