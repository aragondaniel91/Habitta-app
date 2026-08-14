const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const FINANCIAL_ROUTE_FAMILIES = new Set([
  'payments',
  'payment-methods',
  'expenses',
  'treasury',
  'receivables',
  'charge-concepts',
  'opening-balances',
  'late-fees',
]);

export type RequestRateLimitScope =
  | { kind: 'organization-signup'; key: string }
  | { kind: 'financial-write'; key: string };

const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const bearerCredential = (request: Request) => {
  const authorization = request.headers.get('Authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
};

export const requestRateLimitScope = async (
  request: Request,
): Promise<RequestRateLimitScope | null> => {
  const method = request.method.toUpperCase();
  if (SAFE_METHODS.has(method)) return null;

  const url = new URL(request.url);
  const path = url.pathname;
  const callerIp = request.headers.get('CF-Connecting-IP')?.trim() || 'unknown';

  if (method === 'POST' && path === '/v1/organizations') {
    return { kind: 'organization-signup', key: `organization-signup:${callerIp}` };
  }

  const match = /^\/v1\/condominiums\/([0-9a-f-]{36})\/([^/]+)(?:\/|$)/i.exec(path);
  if (!match || !FINANCIAL_ROUTE_FAMILIES.has(match[2].toLowerCase())) return null;

  const bearer = bearerCredential(request);
  const actorKey = bearer ? await sha256Hex(bearer) : `ip:${callerIp}`;
  return {
    kind: 'financial-write',
    key: `financial-write:${match[1].toLowerCase()}:${actorKey}`,
  };
};
