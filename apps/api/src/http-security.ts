const LOCAL_DEV_ORIGIN = 'http://localhost:5173';

type PostgrestError = {
  code: string;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
};

const normalizeOrigin = (value: string) => {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

export const allowedCorsOrigins = (raw?: string, appEnv = 'development') => {
  const candidates = [
    ...(appEnv.trim().toLowerCase() === 'production' ? [] : [LOCAL_DEV_ORIGIN]),
    ...(raw ?? '').split(','),
  ];

  return new Set(
    candidates
      .map((origin) => origin.trim())
      .filter(Boolean)
      .map(normalizeOrigin)
      .filter((origin): origin is string => origin !== null),
  );
};

export const isAllowedCorsOrigin = (
  origin: string | undefined,
  raw?: string,
  appEnv = 'development',
) => {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  return normalized !== null && allowedCorsOrigins(raw, appEnv).has(normalized);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const readPostgrestError = async (response: Response): Promise<PostgrestError | null> => {
  if (response.ok || !response.headers.get('Content-Type')?.includes('application/json'))
    return null;

  try {
    const value = (await response.clone().json()) as unknown;
    if (!isRecord(value) || typeof value.code !== 'string') return null;
    if (!('message' in value) && !('details' in value) && !('hint' in value)) return null;
    return value as PostgrestError;
  } catch {
    return null;
  }
};

export const publicErrorForStatus = (status: number) => {
  if (status === 400) return 'Invalid request';
  if (status === 401) return 'Unauthorized';
  if (status === 403) return 'Forbidden';
  if (status === 404) return 'Not found';
  if (status === 409) return 'Request conflict';
  if (status === 413) return 'Payload too large';
  if (status === 415) return 'Unsupported media type';
  return 'Request failed';
};
