import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { uuidSchema } from '@habitta/validation';
import type { NotificationBindings } from './notifications/types';

type Variables = { token: string; userId: string };
type PeopleContext = Context<{ Bindings: NotificationBindings; Variables: Variables }>;

export const peopleRelationshipRoutes = new Hono<{
  Bindings: NotificationBindings;
  Variables: Variables;
}>();

const condominiumRelationshipInputSchema = z.object({
  relationshipType: z.enum([
    'board_member',
    'administrator_contact',
    'representative',
    'emergency_contact',
    'other',
  ]),
  title: z.string().trim().min(1).max(120).optional(),
  startsAt: z.string().date().optional(),
});

const closeRelationshipSchema = z.object({ endsAt: z.string().date() });

const personOwnershipInputSchema = z.object({
  unitId: uuidSchema,
  ownershipPercentage: z.number().positive().max(100).optional(),
  isPrimaryContact: z.boolean().default(false),
  startsAt: z.string().date().optional(),
});

const personOccupancyInputSchema = z.object({
  unitId: uuidSchema,
  occupancyType: z.enum(['owner_occupant', 'tenant', 'family_member', 'authorized_occupant']),
  isPrimaryContact: z.boolean().default(false),
  startsAt: z.string().date().optional(),
  endsAt: z.string().date().optional(),
});

const communicationResponsibilitySchema = z.object({
  financialRole: z.enum(['none', 'primary', 'additional']),
  generalRecipient: z.boolean(),
});

function rest(c: PeopleContext, path: string, init: RequestInit = {}) {
  return fetch(`${c.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: c.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${c.get('token')}`,
      Prefer: 'return=representation',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

async function parseBody<T extends z.ZodTypeAny>(c: PeopleContext, schema: T) {
  const parsed = schema.safeParse(await c.req.json());
  return parsed.success ? parsed.data : c.json({ error: parsed.error.flatten() }, 400);
}

async function scopedResourceExists(c: PeopleContext, path: string) {
  const response = await rest(c, path);
  if (!response.ok) return false;
  return ((await response.json()) as unknown[]).length > 0;
}

async function ensurePersonAndUnit(
  c: PeopleContext,
  condominiumId: string,
  personId: string,
  unitId: string,
) {
  const [personExists, unitExists] = await Promise.all([
    scopedResourceExists(
      c,
      `people?id=eq.${personId}&condominium_id=eq.${condominiumId}&select=id`,
    ),
    scopedResourceExists(c, `units?id=eq.${unitId}&condominium_id=eq.${condominiumId}&select=id`),
  ]);
  return personExists && unitExists;
}

function communicationAssignmentQuery(condominiumId: string, filter: string) {
  return `unit_communication_assignments?condominium_id=eq.${condominiumId}&${filter}&select=id,condominium_id,unit_id,person_id,financial_role,general_recipient,effective_from,effective_to,created_at,ended_at,units!inner(id,code,condominium_id,building_id,buildings(id,name))&order=effective_from.desc`;
}

peopleRelationshipRoutes.get('/:id/people/:personId/communication-responsibilities', async (c) => {
  const condominiumId = uuidSchema.parse(c.req.param('id'));
  const personId = uuidSchema.parse(c.req.param('personId'));
  const [personResponse, assignmentsResponse] = await Promise.all([
    rest(c, `people?id=eq.${personId}&condominium_id=eq.${condominiumId}&select=id`),
    rest(c, communicationAssignmentQuery(condominiumId, `person_id=eq.${personId}`)),
  ]);
  if (!personResponse.ok || !assignmentsResponse.ok)
    return c.json({ error: 'Request failed' }, 403);
  if (!((await personResponse.json()) as unknown[])[0])
    return c.json({ error: 'Person not found' }, 404);
  return c.json({ assignments: await assignmentsResponse.json() });
});

peopleRelationshipRoutes.get('/:id/units/:unitId/communication-responsibilities', async (c) => {
  const condominiumId = uuidSchema.parse(c.req.param('id'));
  const unitId = uuidSchema.parse(c.req.param('unitId'));
  const [unitResponse, assignmentsResponse] = await Promise.all([
    rest(c, `units?id=eq.${unitId}&condominium_id=eq.${condominiumId}&select=id`),
    rest(c, communicationAssignmentQuery(condominiumId, `unit_id=eq.${unitId}`)),
  ]);
  if (!unitResponse.ok || !assignmentsResponse.ok) return c.json({ error: 'Request failed' }, 403);
  if (!((await unitResponse.json()) as unknown[])[0])
    return c.json({ error: 'Unit not found' }, 404);
  return c.json({ assignments: await assignmentsResponse.json() });
});

peopleRelationshipRoutes.patch(
  '/:id/people/:personId/communication-responsibilities/:unitId',
  async (c) => {
    const condominiumId = uuidSchema.parse(c.req.param('id'));
    const personId = uuidSchema.parse(c.req.param('personId'));
    const unitId = uuidSchema.parse(c.req.param('unitId'));
    const parsed = await parseBody(c, communicationResponsibilitySchema);
    if (parsed instanceof Response) return parsed;
    if (!(await ensurePersonAndUnit(c, condominiumId, personId, unitId)))
      return c.json({ error: 'Person or unit not found in condominium' }, 404);
    const response = await rest(c, 'rpc/set_unit_communication_assignment', {
      method: 'POST',
      body: JSON.stringify({
        target_condominium: condominiumId,
        target_unit: unitId,
        target_person: personId,
        target_financial_role: parsed.financialRole,
        target_general_recipient: parsed.generalRecipient,
      }),
    });
    const result: unknown = await response.json().catch(() => null);
    if (
      !response.ok &&
      typeof result === 'object' &&
      result !== null &&
      'message' in result &&
      result.message === 'financial_primary_required'
    ) {
      return c.json(
        {
          error: 'financial_primary_required',
          publicMessage:
            'Esta unidad necesita un responsable financiero principal antes de agregar otros destinatarios financieros.',
        },
        409,
      );
    }
    if (!response.ok) return c.json({ error: 'Communication responsibility unavailable' }, 403);
    return c.json(result);
  },
);

peopleRelationshipRoutes.get('/:id/people/:personId/relationships', async (c) => {
  const condominiumId = uuidSchema.parse(c.req.param('id'));
  const personId = uuidSchema.parse(c.req.param('personId'));
  const [personResponse, ownershipResponse, occupancyResponse, relationshipResponse] =
    await Promise.all([
      rest(c, `people?id=eq.${personId}&condominium_id=eq.${condominiumId}&select=*`),
      rest(
        c,
        `unit_owners?person_id=eq.${personId}&units.condominium_id=eq.${condominiumId}&select=id,person_id,unit_id,ownership_percentage,is_primary_contact,starts_at,ends_at,units!inner(id,code,condominium_id,building_id,buildings(id,name))&order=starts_at.desc`,
      ),
      rest(
        c,
        `unit_occupancies?person_id=eq.${personId}&units.condominium_id=eq.${condominiumId}&select=id,person_id,unit_id,occupancy_type,is_primary_contact,starts_at,ends_at,units!inner(id,code,condominium_id,building_id,buildings(id,name))&order=starts_at.desc`,
      ),
      rest(
        c,
        `condominium_person_relationships?condominium_id=eq.${condominiumId}&person_id=eq.${personId}&select=*&order=starts_at.desc`,
      ),
    ]);

  if (
    !personResponse.ok ||
    !ownershipResponse.ok ||
    !occupancyResponse.ok ||
    !relationshipResponse.ok
  )
    return c.json({ error: 'Request failed' }, 403);

  const people = (await personResponse.json()) as unknown[];
  if (!people[0]) return c.json({ error: 'Person not found' }, 404);

  return c.json({
    person: people[0],
    ownerships: await ownershipResponse.json(),
    occupancies: await occupancyResponse.json(),
    condominiumRelationships: await relationshipResponse.json(),
  });
});

peopleRelationshipRoutes.post('/:id/people/:personId/ownerships', async (c) => {
  const condominiumId = uuidSchema.parse(c.req.param('id'));
  const personId = uuidSchema.parse(c.req.param('personId'));
  const parsed = await parseBody(c, personOwnershipInputSchema);
  if (parsed instanceof Response) return parsed;

  if (!(await ensurePersonAndUnit(c, condominiumId, personId, parsed.unitId)))
    return c.json({ error: 'Person or unit not found in condominium' }, 404);

  const response = await rest(c, 'unit_owners', {
    method: 'POST',
    body: JSON.stringify({
      unit_id: parsed.unitId,
      person_id: personId,
      ownership_percentage: parsed.ownershipPercentage ?? null,
      is_primary_contact: parsed.isPrimaryContact,
      starts_at: parsed.startsAt ?? undefined,
      created_by: c.get('userId'),
    }),
  });
  return c.json(await response.json(), response.ok ? 201 : 400);
});

peopleRelationshipRoutes.post('/:id/people/:personId/occupancies', async (c) => {
  const condominiumId = uuidSchema.parse(c.req.param('id'));
  const personId = uuidSchema.parse(c.req.param('personId'));
  const parsed = await parseBody(c, personOccupancyInputSchema);
  if (parsed instanceof Response) return parsed;

  if (!(await ensurePersonAndUnit(c, condominiumId, personId, parsed.unitId)))
    return c.json({ error: 'Person or unit not found in condominium' }, 404);

  const response = await rest(c, 'unit_occupancies', {
    method: 'POST',
    body: JSON.stringify({
      unit_id: parsed.unitId,
      person_id: personId,
      occupancy_type: parsed.occupancyType,
      is_primary_contact: parsed.isPrimaryContact,
      starts_at: parsed.startsAt ?? undefined,
      ends_at: parsed.endsAt ?? undefined,
      created_by: c.get('userId'),
    }),
  });
  return c.json(await response.json(), response.ok ? 201 : 400);
});

peopleRelationshipRoutes.post('/:id/people/:personId/condominium-relationships', async (c) => {
  const condominiumId = uuidSchema.parse(c.req.param('id'));
  const personId = uuidSchema.parse(c.req.param('personId'));
  const parsed = await parseBody(c, condominiumRelationshipInputSchema);
  if (parsed instanceof Response) return parsed;

  if (
    !(await scopedResourceExists(
      c,
      `people?id=eq.${personId}&condominium_id=eq.${condominiumId}&select=id`,
    ))
  )
    return c.json({ error: 'Person not found in condominium' }, 404);

  const response = await rest(c, 'condominium_person_relationships', {
    method: 'POST',
    body: JSON.stringify({
      condominium_id: condominiumId,
      person_id: personId,
      relationship_type: parsed.relationshipType,
      title: parsed.title ?? null,
      starts_at: parsed.startsAt ?? undefined,
      created_by: c.get('userId'),
    }),
  });
  return c.json(await response.json(), response.ok ? 201 : 400);
});

peopleRelationshipRoutes.patch(
  '/:id/people/:personId/condominium-relationships/:relationshipId',
  async (c) => {
    const condominiumId = uuidSchema.parse(c.req.param('id'));
    const personId = uuidSchema.parse(c.req.param('personId'));
    const relationshipId = uuidSchema.parse(c.req.param('relationshipId'));
    const parsed = await parseBody(c, closeRelationshipSchema);
    if (parsed instanceof Response) return parsed;

    const current = await rest(
      c,
      `condominium_person_relationships?id=eq.${relationshipId}&condominium_id=eq.${condominiumId}&person_id=eq.${personId}&select=id,starts_at,ends_at`,
    );
    const rows = current.ok
      ? ((await current.json()) as { id: string; starts_at: string; ends_at?: string | null }[])
      : [];
    if (!rows[0]) return c.json({ error: 'Relationship not found' }, 404);
    if (rows[0].ends_at) return c.json({ error: 'Relationship is already closed' }, 409);
    if (parsed.endsAt < rows[0].starts_at)
      return c.json({ error: 'ends_at must not precede starts_at' }, 400);

    const response = await rest(c, `condominium_person_relationships?id=eq.${relationshipId}`, {
      method: 'PATCH',
      body: JSON.stringify({ ends_at: parsed.endsAt }),
    });
    return c.json(await response.json(), response.ok ? 200 : 400);
  },
);
