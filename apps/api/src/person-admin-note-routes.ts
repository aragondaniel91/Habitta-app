import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { uuidSchema } from '@habitta/validation';
import type { NotificationBindings } from './notifications/types';

type Variables = { token: string; userId: string };
type AppEnvironment = { Bindings: NotificationBindings; Variables: Variables };
type AppContext = Context<AppEnvironment>;

type NoteRevision = {
  id: number;
  action: 'saved' | 'cleared';
  content: string | null;
  created_by: string;
  created_at: string;
};

const saveNoteSchema = z.object({
  content: z.string().trim().min(1).max(4000),
});

function rest(c: AppContext, path: string, init: RequestInit = {}) {
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

async function canManagePeople(c: AppContext, condominiumId: string) {
  const response = await rest(c, 'rpc/can_manage_people', {
    method: 'POST',
    body: JSON.stringify({ target: condominiumId }),
  });
  if (!response.ok) return false;
  return (await response.json()) === true;
}

async function personExists(c: AppContext, condominiumId: string, personId: string) {
  const response = await rest(
    c,
    `people?id=eq.${personId}&condominium_id=eq.${condominiumId}&select=id`,
  );
  if (!response.ok) return false;
  return ((await response.json()) as unknown[]).length > 0;
}

async function latestRevision(c: AppContext, condominiumId: string, personId: string) {
  const response = await rest(
    c,
    `person_admin_note_revisions?condominium_id=eq.${condominiumId}&person_id=eq.${personId}&select=id,action,content,created_by,created_at&order=id.desc&limit=1`,
  );
  if (!response.ok) return null;
  return ((await response.json()) as NoteRevision[])[0] ?? null;
}

export const personAdminNoteRoutes = new Hono<AppEnvironment>();

personAdminNoteRoutes.get('/:id/people/:personId/admin-notes', async (c) => {
  const condominiumId = uuidSchema.parse(c.req.param('id'));
  const personId = uuidSchema.parse(c.req.param('personId'));

  if (!(await canManagePeople(c, condominiumId))) {
    return c.json({ authorized: false, revisions: [] });
  }

  if (!(await personExists(c, condominiumId, personId))) {
    return c.json({ error: 'Person not found' }, 404);
  }

  const response = await rest(
    c,
    `person_admin_note_revisions?condominium_id=eq.${condominiumId}&person_id=eq.${personId}&select=id,action,content,created_by,created_at&order=id.desc&limit=25`,
  );
  if (!response.ok) return c.json({ error: 'Request failed' }, 403);

  return c.json({ authorized: true, revisions: await response.json() });
});

personAdminNoteRoutes.post('/:id/people/:personId/admin-notes', async (c) => {
  const condominiumId = uuidSchema.parse(c.req.param('id'));
  const personId = uuidSchema.parse(c.req.param('personId'));
  const parsed = saveNoteSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  if (!(await canManagePeople(c, condominiumId))) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  if (!(await personExists(c, condominiumId, personId))) {
    return c.json({ error: 'Person not found' }, 404);
  }

  const response = await rest(c, 'person_admin_note_revisions', {
    method: 'POST',
    body: JSON.stringify({
      condominium_id: condominiumId,
      person_id: personId,
      action: 'saved',
      content: parsed.data.content,
      created_by: c.get('userId'),
    }),
  });
  if (!response.ok) return c.json({ error: 'Request failed' }, response.status === 403 ? 403 : 400);
  const rows = (await response.json()) as NoteRevision[];
  return c.json(rows[0] ?? null, 201);
});

personAdminNoteRoutes.post('/:id/people/:personId/admin-notes/clear', async (c) => {
  const condominiumId = uuidSchema.parse(c.req.param('id'));
  const personId = uuidSchema.parse(c.req.param('personId'));

  if (!(await canManagePeople(c, condominiumId))) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  if (!(await personExists(c, condominiumId, personId))) {
    return c.json({ error: 'Person not found' }, 404);
  }

  const current = await latestRevision(c, condominiumId, personId);
  if (!current || current.action === 'cleared') {
    return c.json({ error: 'No active administrative note' }, 409);
  }

  const response = await rest(c, 'person_admin_note_revisions', {
    method: 'POST',
    body: JSON.stringify({
      condominium_id: condominiumId,
      person_id: personId,
      action: 'cleared',
      content: null,
      created_by: c.get('userId'),
    }),
  });
  if (!response.ok) return c.json({ error: 'Request failed' }, response.status === 403 ? 403 : 400);
  const rows = (await response.json()) as NoteRevision[];
  return c.json(rows[0] ?? null, 201);
});
