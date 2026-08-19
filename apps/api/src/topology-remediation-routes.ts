import { condominiumTopologyRemediationSchema, uuidSchema } from '@habitta/validation';
import { Hono } from 'hono';
import type { NotificationBindings } from './notifications/types';

type Environment = { Bindings: NotificationBindings; Variables: { token: string; userId: string } };
export const topologyRemediationRoutes = new Hono<Environment>();

topologyRemediationRoutes.post('/:id/topology-remediation', async (c) => {
  const target = uuidSchema.safeParse(c.req.param('id'));
  if (!target.success) return c.json({ error: 'Invalid condominium identifier' }, 400);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  const input = condominiumTopologyRemediationSchema.safeParse(body);
  if (!input.success) return c.json({ error: input.error.flatten() }, 400);
  const response = await fetch(`${c.env.SUPABASE_URL}/rest/v1/rpc/remediate_condominium_topology`, {
    method: 'POST',
    headers: {
      apikey: c.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${c.get('token')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      target: target.data,
      requested_topology: input.data.propertyTopology,
      requested_unit_count: input.data.declaredUnitCount ?? null,
      requested_building_count: input.data.declaredBuildingCount ?? null,
    }),
  });
  if (!response.ok) {
    const message = await response.text();
    const status =
      response.status === 401 || response.status === 403
        ? 403
        : response.status === 409 ||
            /already resolved|incompatible|cannot be smaller/i.test(message)
          ? 409
          : 400;
    return c.json(
      {
        error:
          status === 403
            ? 'No tiene permisos para definir la estructura.'
            : status === 409
              ? 'La estructura ya fue resuelta o es incompatible con los datos existentes.'
              : 'No se pudo definir el tipo de propiedad.',
      },
      status,
    );
  }
  return c.json(await response.json());
});
