import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import type { NotificationBindings } from './notifications/types';

type Variables = { token: string; userId: string };
type AppEnvironment = { Bindings: NotificationBindings; Variables: Variables };
type AppContext = Context<AppEnvironment>;

type DeletionJob = {
  job_id: string;
  deleted_condominium_id: string;
  deleted_condominium_name: string;
  storage_object_count: number;
  storage_keys: string[];
};

const uuid = z.string().uuid();
const deletionSchema = z.object({ confirmation: z.string().trim().min(1).max(300) });

const rpc = (c: AppContext, name: string, payload: Record<string, unknown>) =>
  fetch(`${c.env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: c.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${c.get('token')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

const errorMessage = async (response: Response, fallback: string) => {
  try {
    const value = (await response.json()) as { message?: string; error?: string };
    return value.message ?? value.error ?? fallback;
  } catch {
    return fallback;
  }
};

const finishCleanup = async (
  c: AppContext,
  jobId: string,
  succeeded: boolean,
  message: string | null = null,
) => {
  const response = await rpc(c, 'finish_condominium_deletion_storage_cleanup', {
    target_job_id: jobId,
    cleanup_succeeded: succeeded,
    cleanup_error: message,
  });
  if (!response.ok || (await response.json()) !== true) {
    throw new Error('Deletion cleanup status could not be recorded');
  }
};

const deleteStorageObjects = async (c: AppContext, jobId: string, keys: string[]) => {
  try {
    for (let index = 0; index < keys.length; index += 1000) {
      await c.env.PAYMENT_PROOFS.delete(keys.slice(index, index + 1000));
    }
    await finishCleanup(c, jobId, true);
    return keys.length;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'R2 cleanup failed';
    try {
      await finishCleanup(c, jobId, false, message);
    } catch {
      // Database deletion is already committed. The retry endpoint can recover the manifest later.
    }
    throw new Error(message);
  }
};

const loadRetryKeys = async (c: AppContext, jobId: string) => {
  const response = await rpc(c, 'get_condominium_deletion_storage_keys', {
    target_job_id: jobId,
  });
  if (!response.ok) return null;
  const value = (await response.json()) as string[] | null;
  return Array.isArray(value) ? value : null;
};

export const condominiumDeletionRoutes = new Hono<AppEnvironment>();

condominiumDeletionRoutes.post('/:id/danger-zone/delete', async (c) => {
  const condominiumId = uuid.safeParse(c.req.param('id'));
  if (!condominiumId.success) return c.json({ error: 'Invalid condominium identifier' }, 400);

  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  const input = deletionSchema.safeParse(rawBody);
  if (!input.success) return c.json({ error: input.error.flatten() }, 400);

  const response = await rpc(c, 'request_condominium_deletion', {
    target_condominium_id: condominiumId.data,
    confirmation_value: input.data.confirmation,
  });
  if (!response.ok) {
    const status: 400 | 403 = response.status === 401 || response.status === 403 ? 403 : 400;
    return c.json(
      { error: await errorMessage(response, 'Residence could not be deleted') },
      status,
    );
  }

  const rows = (await response.json()) as DeletionJob[];
  const job = rows[0];
  if (!job) return c.json({ error: 'Deletion did not return a cleanup job' }, 500);

  try {
    const deletedStorageObjects = await deleteStorageObjects(c, job.job_id, job.storage_keys ?? []);
    return c.json({
      deleted: true,
      condominiumId: job.deleted_condominium_id,
      condominiumName: job.deleted_condominium_name,
      databaseDeleted: true,
      storageCleanup: 'completed' as const,
      deletedStorageObjects,
    });
  } catch {
    return c.json(
      {
        deleted: true,
        condominiumId: job.deleted_condominium_id,
        condominiumName: job.deleted_condominium_name,
        databaseDeleted: true,
        storageCleanup: 'pending' as const,
        cleanupJobId: job.job_id,
        message: 'Residence data was deleted, but private-file cleanup must be retried.',
      },
      502,
    );
  }
});

condominiumDeletionRoutes.post('/deletion-jobs/:jobId/retry-storage-cleanup', async (c) => {
  const jobId = uuid.safeParse(c.req.param('jobId'));
  if (!jobId.success) return c.json({ error: 'Invalid cleanup job identifier' }, 400);

  const keys = await loadRetryKeys(c, jobId.data);
  if (!keys) return c.json({ error: 'Cleanup job not found' }, 404);

  try {
    const deletedStorageObjects = await deleteStorageObjects(c, jobId.data, keys);
    return c.json({ storageCleanup: 'completed' as const, deletedStorageObjects });
  } catch {
    return c.json({ error: 'Private-file cleanup is still pending' }, 502);
  }
});
