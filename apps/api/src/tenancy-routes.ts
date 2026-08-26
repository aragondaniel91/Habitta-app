import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { uuidSchema } from '@habitta/validation';
import type { NotificationBindings } from './notifications/types';

type Variables = { token: string; userId: string };
type TenancyEnvironment = { Bindings: NotificationBindings; Variables: Variables };
type TenancyContext = Context<TenancyEnvironment>;

type TenancyFailure = { status: 400 | 403 | 409 | 422; error: string; publicMessage: string };

/**
 * Domain vocabulary for tenancy identity. The administrator has to read what is wrong and what to
 * do about it, never a PostgreSQL constraint name.
 */
const tenancyFailures: Record<string, TenancyFailure> = {
  'permission denied': {
    status: 403,
    error: 'tenancy_forbidden',
    publicMessage: 'No tienes permisos para editar los datos de este condominio.',
  },
  'organization owner required': {
    status: 403,
    error: 'organization_owner_required',
    publicMessage: 'Solo el propietario de la organización puede cambiar su nombre.',
  },
  'condominium unavailable': {
    status: 409,
    error: 'condominium_unavailable',
    publicMessage: 'El condominio ya no está disponible. Actualiza la información.',
  },
  'organization unavailable': {
    status: 409,
    error: 'organization_unavailable',
    publicMessage: 'La organización ya no está disponible. Actualiza la información.',
  },
  'condominium name already exists': {
    status: 409,
    error: 'condominium_name_taken',
    publicMessage: 'Ya existe otro condominio con ese nombre en tu organización.',
  },
  'invalid condominium profile': {
    status: 422,
    error: 'condominium_profile_invalid',
    publicMessage:
      'Revisa los datos obligatorios: nombre, país, dirección, ciudad y moneda principal. La moneda secundaria debe ser distinta de la principal.',
  },
  'invalid condominium timezone': {
    status: 422,
    error: 'condominium_timezone_invalid',
    publicMessage: 'Selecciona una zona horaria válida.',
  },
  'invalid organization name': {
    status: 422,
    error: 'organization_name_invalid',
    publicMessage: 'Escribe un nombre de organización de hasta 120 caracteres.',
  },
};

export function tenancyFailureFromPostgrest(payload: unknown): TenancyFailure | null {
  if (!payload || typeof payload !== 'object') return null;
  const message = (payload as { message?: unknown }).message;
  if (typeof message !== 'string') return null;
  return tenancyFailures[message] ?? null;
}

const optionalText = (max: number) => z.string().trim().max(max).optional();

const condominiumProfileSchema = z.object({
  name: z.string().trim().min(1).max(120),
  countryCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/),
  addressLine1: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(120),
  timezone: z.string().trim().min(1).max(64),
  primaryCurrencyCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/),
  secondaryCurrencyCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/)
    .optional(),
  legalName: optionalText(160),
  legalIdType: optionalText(24),
  legalIdNumber: optionalText(40),
  addressLine2: optionalText(200),
  stateRegion: optionalText(120),
  municipality: optionalText(120),
  parish: optionalText(120),
  postalCode: optionalText(24),
});

const organizationNameSchema = z.object({ name: z.string().trim().min(1).max(120) });

const rest = (c: TenancyContext, path: string, init: RequestInit = {}) =>
  fetch(`${c.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: c.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${c.get('token')}`,
      Prefer: 'return=representation',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

const rpc = (c: TenancyContext, name: string, payload: Record<string, unknown>) =>
  rest(c, `rpc/${name}`, { method: 'POST', body: JSON.stringify(payload) });

const rpcResult = async (c: TenancyContext, response: Response) => {
  const payload = await response
    .clone()
    .json()
    .catch(() => null);
  if (response.ok) return c.json(payload, 200);

  const failure = tenancyFailureFromPostgrest(payload);
  if (failure) {
    return c.json({ error: failure.error, publicMessage: failure.publicMessage }, failure.status);
  }
  if (response.status === 401 || response.status === 403) {
    return c.json(
      { error: 'tenancy_forbidden', publicMessage: 'No tienes permisos para esta acción.' },
      403,
    );
  }
  if (response.status >= 500) return c.json({ error: 'tenancy_upstream_failure' }, 502);
  return c.json({ error: 'tenancy_operation_failed' }, 400);
};

async function parseBody<T extends z.ZodTypeAny>(c: TenancyContext, schema: T) {
  const parsed = schema.safeParse(await c.req.json());
  return parsed.success ? parsed.data : c.json({ error: parsed.error.flatten() }, 400);
}

export const tenancyRoutes = new Hono<TenancyEnvironment>();

tenancyRoutes.patch('/v1/condominiums/:id', async (c) => {
  const condominiumId = uuidSchema.parse(c.req.param('id'));
  const parsed = await parseBody(c, condominiumProfileSchema);
  if (parsed instanceof Response) return parsed;

  const response = await rpc(c, 'update_condominium_profile', {
    target: condominiumId,
    condominium_name: parsed.name,
    country_code: parsed.countryCode,
    address_line1: parsed.addressLine1,
    city: parsed.city,
    timezone: parsed.timezone,
    primary_currency_code: parsed.primaryCurrencyCode,
    secondary_currency_code: parsed.secondaryCurrencyCode ?? null,
    legal_name: parsed.legalName ?? null,
    legal_id_type: parsed.legalIdType ?? null,
    legal_id_number: parsed.legalIdNumber ?? null,
    address_line2: parsed.addressLine2 ?? null,
    state_region: parsed.stateRegion ?? null,
    municipality: parsed.municipality ?? null,
    parish: parsed.parish ?? null,
    postal_code: parsed.postalCode ?? null,
  });
  return rpcResult(c, response);
});

tenancyRoutes.patch('/v1/organizations/:organizationId', async (c) => {
  const organizationId = uuidSchema.parse(c.req.param('organizationId'));
  const parsed = await parseBody(c, organizationNameSchema);
  if (parsed instanceof Response) return parsed;

  const response = await rpc(c, 'rename_organization', {
    target: organizationId,
    organization_name: parsed.name,
  });
  return rpcResult(c, response);
});
