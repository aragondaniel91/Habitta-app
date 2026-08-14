import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import type { NotificationBindings } from './notifications/types';

type Variables = { token: string; userId: string };
type AppEnvironment = { Bindings: NotificationBindings; Variables: Variables };
type AppContext = Context<AppEnvironment>;

const uuid = z.string().uuid();
const optionalUuid = uuid.nullable().optional();
const optionalText = (maximum: number) => z.string().trim().max(maximum).nullable().optional();
const votingBasis = z.enum(['one_per_owner', 'one_per_unit']);
const attendanceMode = z.enum(['in_person', 'remote', 'proxy']);

const createSchema = z.object({
  title: z.string().trim().min(2).max(180),
  description: optionalText(5000),
  scheduledAt: z.string().datetime({ offset: true }),
  location: optionalText(240),
  votingBasis: votingBasis.default('one_per_unit'),
  quorumPercentage: z.number().min(0).max(100).default(50),
});

const agendaSchema = z.object({
  title: z.string().trim().min(2).max(180),
  description: optionalText(2000),
  proposalId: optionalUuid,
  sortOrder: z.number().int().min(0).max(1000),
});

const transitionSchema = z.object({
  action: z.enum(['schedule', 'start', 'complete', 'cancel']),
  expectedVersion: z.number().int().positive(),
});

const attendanceSchema = z.object({
  snapshotId: uuid,
  attendeePersonId: optionalUuid,
  mode: attendanceMode.default('in_person'),
});

const minutesSchema = z.object({
  minutes: z.string().trim().min(2).max(100000),
  expectedVersion: z.number().int().positive(),
});

const publishMinutesSchema = z.object({ expectedVersion: z.number().int().positive() });

const resolutionSchema = z.object({
  title: z.string().trim().min(2).max(180),
  body: z.string().trim().min(2).max(20000),
  agendaItemId: optionalUuid,
  proposalId: optionalUuid,
});

const body = async <T>(c: AppContext, schema: z.ZodType<T>) => {
  const parsed = schema.safeParse(await c.req.json());
  return parsed.success ? parsed.data : c.json({ error: parsed.error.flatten() }, 400);
};

const rest = (c: AppContext, path: string, init: RequestInit = {}) =>
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

const rpc = (c: AppContext, name: string, payload: unknown) =>
  rest(c, `rpc/${name}`, { method: 'POST', body: JSON.stringify(payload) });

const responseJson = async (c: AppContext, response: Response, successStatus: 200 | 201 = 200) => {
  const value = (await response.json()) as { code?: string; message?: string };
  if (response.ok) return c.json(value, successStatus);
  const status: 400 | 403 | 404 | 409 =
    response.status === 401 || response.status === 403 || value.code === '42501'
      ? 403
      : value.code === '23505' || value.message?.includes('version conflict')
        ? 409
        : value.message?.includes('not found') || response.status === 404
          ? 404
          : 400;
  return c.json(
    {
      error:
        status === 403
          ? 'Forbidden'
          : status === 404
            ? 'Not found'
            : status === 409
              ? 'Request conflict'
              : (value.message ?? 'Invalid request'),
    },
    status,
  );
};

export const assembliesRoutes = new Hono<AppEnvironment>();

assembliesRoutes.get('/:id/assemblies', async (c) => {
  const condominiumId = uuid.parse(c.req.param('id'));
  const response = await rest(
    c,
    `assemblies?condominium_id=eq.${condominiumId}&select=*&order=scheduled_at.desc,created_at.desc`,
  );
  return responseJson(c, response);
});

assembliesRoutes.post('/:id/assemblies', async (c) => {
  const parsed = await body(c, createSchema);
  if (parsed instanceof Response) return parsed;
  const response = await rpc(c, 'create_assembly', {
    target_condominium_id: uuid.parse(c.req.param('id')),
    assembly_title: parsed.title,
    assembly_description: parsed.description ?? null,
    assembly_scheduled_at: parsed.scheduledAt,
    assembly_location: parsed.location ?? null,
    assembly_voting_basis: parsed.votingBasis,
    assembly_quorum_percentage: parsed.quorumPercentage,
  });
  return responseJson(c, response, 201);
});

assembliesRoutes.get('/:id/assemblies/:assemblyId', async (c) => {
  const condominiumId = uuid.parse(c.req.param('id'));
  const assemblyId = uuid.parse(c.req.param('assemblyId'));
  const response = await rest(
    c,
    `assemblies?condominium_id=eq.${condominiumId}&id=eq.${assemblyId}&select=*`,
  );
  if (!response.ok) return responseJson(c, response);
  const rows = (await response.json()) as unknown[];
  return rows[0] ? c.json(rows[0], 200) : c.json({ error: 'Not found' }, 404);
});

assembliesRoutes.get('/:id/assemblies/:assemblyId/agenda', async (c) => {
  const condominiumId = uuid.parse(c.req.param('id'));
  const assemblyId = uuid.parse(c.req.param('assemblyId'));
  const response = await rest(
    c,
    `assembly_agenda_items?condominium_id=eq.${condominiumId}&assembly_id=eq.${assemblyId}&select=*&order=sort_order.asc,created_at.asc`,
  );
  return responseJson(c, response);
});

assembliesRoutes.post('/:id/assemblies/:assemblyId/agenda', async (c) => {
  const parsed = await body(c, agendaSchema);
  if (parsed instanceof Response) return parsed;
  const response = await rpc(c, 'add_assembly_agenda_item', {
    target_condominium_id: uuid.parse(c.req.param('id')),
    target_assembly_id: uuid.parse(c.req.param('assemblyId')),
    item_title: parsed.title,
    item_description: parsed.description ?? null,
    linked_proposal_id: parsed.proposalId ?? null,
    item_sort_order: parsed.sortOrder,
  });
  return responseJson(c, response, 201);
});

assembliesRoutes.post('/:id/assemblies/:assemblyId/transition', async (c) => {
  const parsed = await body(c, transitionSchema);
  if (parsed instanceof Response) return parsed;
  const response = await rpc(c, 'transition_assembly', {
    target_condominium_id: uuid.parse(c.req.param('id')),
    target_assembly_id: uuid.parse(c.req.param('assemblyId')),
    action: parsed.action,
    expected_version: parsed.expectedVersion,
  });
  return responseJson(c, response);
});

assembliesRoutes.get('/:id/assemblies/:assemblyId/eligibility', async (c) => {
  const condominiumId = uuid.parse(c.req.param('id'));
  const assemblyId = uuid.parse(c.req.param('assemblyId'));
  const response = await rest(
    c,
    `assembly_eligibility_snapshots?condominium_id=eq.${condominiumId}&assembly_id=eq.${assemblyId}&select=*&order=label.asc`,
  );
  return responseJson(c, response);
});

assembliesRoutes.get('/:id/assemblies/:assemblyId/attendance', async (c) => {
  const condominiumId = uuid.parse(c.req.param('id'));
  const assemblyId = uuid.parse(c.req.param('assemblyId'));
  const response = await rest(
    c,
    `assembly_attendance?condominium_id=eq.${condominiumId}&assembly_id=eq.${assemblyId}&select=*&order=recorded_at.asc`,
  );
  return responseJson(c, response);
});

assembliesRoutes.post('/:id/assemblies/:assemblyId/attendance', async (c) => {
  const parsed = await body(c, attendanceSchema);
  if (parsed instanceof Response) return parsed;
  const response = await rpc(c, 'record_assembly_attendance', {
    target_condominium_id: uuid.parse(c.req.param('id')),
    target_assembly_id: uuid.parse(c.req.param('assemblyId')),
    target_snapshot_id: parsed.snapshotId,
    attendee_id: parsed.attendeePersonId ?? null,
    attendance_mode: parsed.mode,
  });
  return responseJson(c, response, 201);
});

assembliesRoutes.get('/:id/assemblies/:assemblyId/quorum', async (c) => {
  const response = await rpc(c, 'get_assembly_quorum', {
    target_condominium_id: uuid.parse(c.req.param('id')),
    target_assembly_id: uuid.parse(c.req.param('assemblyId')),
  });
  return responseJson(c, response);
});

assembliesRoutes.post('/:id/assemblies/:assemblyId/minutes', async (c) => {
  const parsed = await body(c, minutesSchema);
  if (parsed instanceof Response) return parsed;
  const response = await rpc(c, 'save_assembly_minutes', {
    target_condominium_id: uuid.parse(c.req.param('id')),
    target_assembly_id: uuid.parse(c.req.param('assemblyId')),
    minutes: parsed.minutes,
    expected_version: parsed.expectedVersion,
  });
  return responseJson(c, response);
});

assembliesRoutes.post('/:id/assemblies/:assemblyId/minutes/publish', async (c) => {
  const parsed = await body(c, publishMinutesSchema);
  if (parsed instanceof Response) return parsed;
  const response = await rpc(c, 'publish_assembly_minutes', {
    target_condominium_id: uuid.parse(c.req.param('id')),
    target_assembly_id: uuid.parse(c.req.param('assemblyId')),
    expected_version: parsed.expectedVersion,
  });
  return responseJson(c, response);
});

assembliesRoutes.get('/:id/assemblies/:assemblyId/resolutions', async (c) => {
  const condominiumId = uuid.parse(c.req.param('id'));
  const assemblyId = uuid.parse(c.req.param('assemblyId'));
  const response = await rest(
    c,
    `assembly_resolutions?condominium_id=eq.${condominiumId}&assembly_id=eq.${assemblyId}&select=*&order=created_at.asc`,
  );
  return responseJson(c, response);
});

assembliesRoutes.post('/:id/assemblies/:assemblyId/resolutions', async (c) => {
  const parsed = await body(c, resolutionSchema);
  if (parsed instanceof Response) return parsed;
  const response = await rpc(c, 'create_assembly_resolution', {
    target_condominium_id: uuid.parse(c.req.param('id')),
    target_assembly_id: uuid.parse(c.req.param('assemblyId')),
    resolution_title: parsed.title,
    resolution_body: parsed.body,
    linked_agenda_item_id: parsed.agendaItemId ?? null,
    linked_proposal_id: parsed.proposalId ?? null,
  });
  return responseJson(c, response, 201);
});

assembliesRoutes.post('/:id/assemblies/:assemblyId/resolutions/:resolutionId/publish', async (c) => {
  const response = await rpc(c, 'publish_assembly_resolution', {
    target_condominium_id: uuid.parse(c.req.param('id')),
    target_assembly_id: uuid.parse(c.req.param('assemblyId')),
    target_resolution_id: uuid.parse(c.req.param('resolutionId')),
  });
  return responseJson(c, response);
});
