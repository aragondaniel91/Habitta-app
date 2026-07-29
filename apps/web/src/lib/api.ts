import type { Session } from '@supabase/supabase-js';

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_URL ?? 'http://localhost:8787';

export class ApiRequestError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(status: number, message: string, path: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.path = path;
  }
}

const messageForStatus = (status: number, path: string) => {
  const message =
    status === 401
      ? 'Tu sesión expiró. Vuelve a iniciar sesión.'
      : status === 403
        ? 'No tienes permisos para realizar esta acción.'
        : status >= 500
          ? 'Habitta no pudo completar la solicitud. Intenta nuevamente.'
          : 'No se pudo completar la solicitud.';

  return import.meta.env.VITE_APP_ENV === 'development'
    ? `${message} [${status} ${path}]`
    : message;
};

export async function apiRequest<T>(path: string, session: Session, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${session.access_token}`);
  if (init?.body && !(init.body instanceof FormData))
    headers.set('Content-Type', 'application/json');

  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });

  if (!response.ok) throw new ApiRequestError(response.status, messageForStatus(response.status, path), path);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
