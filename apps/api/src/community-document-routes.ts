import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { uuidSchema } from '@habitta/validation';
import type { NotificationBindings } from './notifications/types';

type Variables = { token: string; userId: string };
type CommunityDocumentEnvironment = { Bindings: NotificationBindings; Variables: Variables };
type CommunityDocumentContext = Context<CommunityDocumentEnvironment>;

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

const audienceSchema = z.enum(['management', 'owners', 'residents']);
const linkTypeSchema = z.enum([
  'announcement',
  'service_request',
  'expense',
  'assembly',
  'proposal',
]);

const categoryInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullish(),
  defaultAudience: audienceSchema.default('management'),
  defaultRetentionDays: z.number().int().positive().max(36500).nullish(),
});

const folderInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullish(),
  parentFolderId: uuidSchema.nullish(),
});

const documentInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).nullish(),
  folderId: uuidSchema.nullish(),
  categoryId: uuidSchema.nullish(),
  audience: audienceSchema.default('management'),
  retentionDays: z.number().int().positive().max(36500).nullish(),
});

const linkInputSchema = z.object({
  targetType: linkTypeSchema,
  targetId: uuidSchema,
});

const supabaseHeaders = (env: NotificationBindings, token: string) => ({
  apikey: env.SUPABASE_ANON_KEY,
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

const readUuid = (value: string | undefined) => {
  const parsed = uuidSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

const safeFilename = (value: string) =>
  Array.from(value.normalize('NFKC'), (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f || '<>:"/\\|?*'.includes(character)
      ? '_'
      : character;
  })
    .join('')
    .trim()
    .slice(0, 255) || 'documento';

const contentDispositionFilename = (value: string) => {
  const ascii = safeFilename(value).replace(/[^a-zA-Z0-9._ -]/g, '_');
  const encoded = encodeURIComponent(value).replaceAll("'", '%27');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
};

const normalizeContentType = (value: string | undefined) =>
  (value ?? '').split(';', 1)[0]?.trim().toLowerCase() ?? '';

const digest = async (bytes: ArrayBuffer) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');

const errorPayload = async (response: Response, fallback: string) => {
  try {
    const value = (await response.json()) as { message?: string; error?: string };
    return { error: value.message ?? value.error ?? fallback };
  } catch {
    return { error: fallback };
  }
};

const supabase = (c: CommunityDocumentContext, path: string, init: RequestInit = {}) =>
  fetch(`${c.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...supabaseHeaders(c.env, c.get('token')),
      Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  });

const callRpc = (c: CommunityDocumentContext, name: string, payload: Record<string, unknown>) =>
  supabase(c, `rpc/${name}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

const parseJson = async <T extends z.ZodTypeAny>(c: CommunityDocumentContext, schema: T) => {
  try {
    const parsed = schema.safeParse(await c.req.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

const ensureManager = async (c: CommunityDocumentContext, condominiumId: string) => {
  const response = await callRpc(c, 'can_manage_community_documents', {
    target_condominium_id: condominiumId,
  });
  if (!response.ok) return false;
  return (await response.json()) === true;
};

export const communityDocumentRoutes = new Hono<CommunityDocumentEnvironment>();

communityDocumentRoutes.get('/:condominiumId/community-documents/categories', async (c) => {
  const condominiumId = readUuid(c.req.param('condominiumId'));
  if (!condominiumId) return c.json({ error: 'Invalid condominium identifier' }, 400);
  const response = await supabase(
    c,
    `community_document_categories?condominium_id=eq.${condominiumId}&select=*&order=name.asc`,
  );
  return c.json(await response.json(), response.ok ? 200 : 400);
});

communityDocumentRoutes.post('/:condominiumId/community-documents/categories', async (c) => {
  const condominiumId = readUuid(c.req.param('condominiumId'));
  const input = await parseJson(c, categoryInputSchema);
  if (!condominiumId || !input) return c.json({ error: 'Invalid category input' }, 400);
  const response = await callRpc(c, 'create_community_document_category', {
    target_condominium_id: condominiumId,
    target_name: input.name,
    target_description: input.description ?? null,
    target_default_audience: input.defaultAudience,
    target_default_retention_days: input.defaultRetentionDays ?? null,
  });
  return c.json(
    response.ok
      ? await response.json()
      : await errorPayload(response, 'Category could not be created'),
    response.ok ? 201 : response.status === 401 || response.status === 403 ? 403 : 400,
  );
});

communityDocumentRoutes.get('/:condominiumId/community-documents/folders', async (c) => {
  const condominiumId = readUuid(c.req.param('condominiumId'));
  if (!condominiumId) return c.json({ error: 'Invalid condominium identifier' }, 400);
  const response = await supabase(
    c,
    `community_document_folders?condominium_id=eq.${condominiumId}&select=*&order=name.asc`,
  );
  return c.json(await response.json(), response.ok ? 200 : 400);
});

communityDocumentRoutes.post('/:condominiumId/community-documents/folders', async (c) => {
  const condominiumId = readUuid(c.req.param('condominiumId'));
  const input = await parseJson(c, folderInputSchema);
  if (!condominiumId || !input) return c.json({ error: 'Invalid folder input' }, 400);
  const response = await callRpc(c, 'create_community_document_folder', {
    target_condominium_id: condominiumId,
    target_name: input.name,
    target_parent_folder_id: input.parentFolderId ?? null,
    target_description: input.description ?? null,
  });
  return c.json(
    response.ok
      ? await response.json()
      : await errorPayload(response, 'Folder could not be created'),
    response.ok ? 201 : response.status === 401 || response.status === 403 ? 403 : 400,
  );
});

communityDocumentRoutes.get('/:condominiumId/community-documents', async (c) => {
  const condominiumId = readUuid(c.req.param('condominiumId'));
  if (!condominiumId) return c.json({ error: 'Invalid condominium identifier' }, 400);
  const response = await supabase(
    c,
    `community_documents?condominium_id=eq.${condominiumId}&select=*&order=updated_at.desc`,
  );
  return c.json(await response.json(), response.ok ? 200 : 400);
});

communityDocumentRoutes.post('/:condominiumId/community-documents', async (c) => {
  const condominiumId = readUuid(c.req.param('condominiumId'));
  const input = await parseJson(c, documentInputSchema);
  if (!condominiumId || !input) return c.json({ error: 'Invalid document input' }, 400);
  const response = await callRpc(c, 'create_community_document', {
    target_condominium_id: condominiumId,
    target_title: input.title,
    target_description: input.description ?? null,
    target_folder_id: input.folderId ?? null,
    target_category_id: input.categoryId ?? null,
    target_audience: input.audience,
    target_retention_days: input.retentionDays ?? null,
  });
  return c.json(
    response.ok
      ? await response.json()
      : await errorPayload(response, 'Document could not be created'),
    response.ok ? 201 : response.status === 401 || response.status === 403 ? 403 : 400,
  );
});

communityDocumentRoutes.get(
  '/:condominiumId/community-documents/:documentId/versions',
  async (c) => {
    const condominiumId = readUuid(c.req.param('condominiumId'));
    const documentId = readUuid(c.req.param('documentId'));
    if (!condominiumId || !documentId) return c.json({ error: 'Invalid document identifier' }, 400);
    const response = await supabase(
      c,
      `community_document_versions?condominium_id=eq.${condominiumId}&document_id=eq.${documentId}&select=*&order=version_number.desc`,
    );
    return c.json(await response.json(), response.ok ? 200 : 400);
  },
);

communityDocumentRoutes.put(
  '/:condominiumId/community-documents/:documentId/versions',
  async (c) => {
    const condominiumId = readUuid(c.req.param('condominiumId'));
    const documentId = readUuid(c.req.param('documentId'));
    if (!condominiumId || !documentId) return c.json({ error: 'Invalid document identifier' }, 400);

    if (!(await ensureManager(c, condominiumId)))
      return c.json({ error: 'Community document manager required' }, 403);

    const metadataResponse = await supabase(
      c,
      `community_documents?id=eq.${documentId}&condominium_id=eq.${condominiumId}&select=id,status`,
    );
    const metadata = (await metadataResponse.json()) as Array<{ id: string; status: string }>;
    if (!metadataResponse.ok || !metadata[0]) return c.json({ error: 'Document not found' }, 404);
    if (metadata[0].status !== 'active') return c.json({ error: 'Document is archived' }, 409);

    const filename = safeFilename(c.req.header('X-Filename') ?? 'documento');
    const contentType = normalizeContentType(c.req.header('Content-Type'));
    if (!ALLOWED_CONTENT_TYPES.has(contentType))
      return c.json({ error: 'Unsupported document type' }, 415);

    const declaredLength = Number(c.req.header('Content-Length') ?? '0');
    if (declaredLength > MAX_DOCUMENT_BYTES)
      return c.json({ error: 'Document exceeds the 10 MB limit' }, 413);

    const bytes = await c.req.arrayBuffer();
    if (bytes.byteLength < 1) return c.json({ error: 'Document is empty' }, 400);
    if (bytes.byteLength > MAX_DOCUMENT_BYTES)
      return c.json({ error: 'Document exceeds the 10 MB limit' }, 413);

    const versionId = crypto.randomUUID();
    const storageKey = `community-documents/${condominiumId}/${documentId}/${versionId}`;
    const hash = await digest(bytes);
    const changeNote = c.req.header('X-Change-Note')?.trim().slice(0, 1000) || null;

    await c.env.PAYMENT_PROOFS.put(storageKey, bytes, {
      httpMetadata: { contentType },
      customMetadata: {
        condominiumId,
        documentId,
        versionId,
        sha256: hash,
        scope: 'community-documents',
      },
    });

    const recorded = await callRpc(c, 'record_community_document_version', {
      target_document_id: documentId,
      target_version_id: versionId,
      target_original_filename: filename,
      target_content_type: contentType,
      target_size_bytes: bytes.byteLength,
      target_sha256: hash,
      target_storage_key: storageKey,
      target_change_note: changeNote,
    });

    if (!recorded.ok) {
      await c.env.PAYMENT_PROOFS.delete(storageKey);
      const status = recorded.status === 401 || recorded.status === 403 ? 403 : 400;
      return c.json(await errorPayload(recorded, 'Document version could not be saved'), status);
    }

    return c.json(await recorded.json(), 201);
  },
);

communityDocumentRoutes.get(
  '/:condominiumId/community-documents/:documentId/versions/:versionId/file',
  async (c) => {
    const condominiumId = readUuid(c.req.param('condominiumId'));
    const documentId = readUuid(c.req.param('documentId'));
    const versionId = readUuid(c.req.param('versionId'));
    if (!condominiumId || !documentId || !versionId)
      return c.json({ error: 'Invalid document identifier' }, 400);

    const response = await supabase(
      c,
      `community_document_versions?id=eq.${versionId}&document_id=eq.${documentId}&condominium_id=eq.${condominiumId}&select=storage_key,original_filename,content_type,size_bytes`,
    );
    const rows = (await response.json()) as Array<{
      storage_key: string;
      original_filename: string;
      content_type: string;
      size_bytes: number;
    }>;
    if (!response.ok || !rows[0]) return c.json({ error: 'Document version not found' }, 404);

    const object = await c.env.PAYMENT_PROOFS.get(rows[0].storage_key);
    if (!object) return c.json({ error: 'Document file is unavailable' }, 404);

    // Audit is fail-closed: a sensitive binary is never delivered without a
    // durable actor/version event. This call re-checks audience authorization
    // inside the database before recording the event.
    const audited = await callRpc(c, 'record_community_document_download', {
      target_document_id: documentId,
      target_version_id: versionId,
    });
    if (!audited.ok) {
      const status = audited.status === 401 || audited.status === 403 ? 403 : 500;
      return c.json(await errorPayload(audited, 'Download audit could not be recorded'), status);
    }

    return new Response(object.body, {
      headers: {
        'Content-Type': rows[0].content_type,
        'Content-Disposition': contentDispositionFilename(rows[0].original_filename),
        'Content-Length': String(object.size),
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  },
);

communityDocumentRoutes.post(
  '/:condominiumId/community-documents/:documentId/archive',
  async (c) => {
    const condominiumId = readUuid(c.req.param('condominiumId'));
    const documentId = readUuid(c.req.param('documentId'));
    if (!condominiumId || !documentId) return c.json({ error: 'Invalid document identifier' }, 400);
    if (!(await ensureManager(c, condominiumId)))
      return c.json({ error: 'Community document manager required' }, 403);

    const metadata = await supabase(
      c,
      `community_documents?id=eq.${documentId}&condominium_id=eq.${condominiumId}&select=id`,
    );
    const rows = (await metadata.json()) as Array<{ id: string }>;
    if (!metadata.ok || !rows[0]) return c.json({ error: 'Document not found' }, 404);

    const response = await callRpc(c, 'archive_community_document', {
      target_document_id: documentId,
    });
    return c.json(
      response.ok
        ? await response.json()
        : await errorPayload(response, 'Document could not be archived'),
      response.ok ? 200 : response.status === 401 || response.status === 403 ? 403 : 400,
    );
  },
);

communityDocumentRoutes.get('/:condominiumId/community-documents/:documentId/links', async (c) => {
  const condominiumId = readUuid(c.req.param('condominiumId'));
  const documentId = readUuid(c.req.param('documentId'));
  if (!condominiumId || !documentId) return c.json({ error: 'Invalid document identifier' }, 400);
  const response = await supabase(
    c,
    `community_document_links?condominium_id=eq.${condominiumId}&document_id=eq.${documentId}&select=*&order=created_at.asc`,
  );
  return c.json(await response.json(), response.ok ? 200 : 400);
});

communityDocumentRoutes.post('/:condominiumId/community-documents/:documentId/links', async (c) => {
  const condominiumId = readUuid(c.req.param('condominiumId'));
  const documentId = readUuid(c.req.param('documentId'));
  const input = await parseJson(c, linkInputSchema);
  if (!condominiumId || !documentId || !input)
    return c.json({ error: 'Invalid document link input' }, 400);
  if (!(await ensureManager(c, condominiumId)))
    return c.json({ error: 'Community document manager required' }, 403);

  const metadata = await supabase(
    c,
    `community_documents?id=eq.${documentId}&condominium_id=eq.${condominiumId}&select=id`,
  );
  const rows = (await metadata.json()) as Array<{ id: string }>;
  if (!metadata.ok || !rows[0]) return c.json({ error: 'Document not found' }, 404);

  const response = await callRpc(c, 'link_community_document', {
    target_document_id: documentId,
    target_type: input.targetType,
    target_id: input.targetId,
  });
  return c.json(
    response.ok
      ? await response.json()
      : await errorPayload(response, 'Document link could not be created'),
    response.ok ? 201 : response.status === 401 || response.status === 403 ? 403 : 400,
  );
});

communityDocumentRoutes.get('/:condominiumId/community-documents/download-events', async (c) => {
  const condominiumId = readUuid(c.req.param('condominiumId'));
  if (!condominiumId) return c.json({ error: 'Invalid condominium identifier' }, 400);
  const documentIdHeader = c.req.query('documentId');
  const documentId = documentIdHeader ? readUuid(documentIdHeader) : null;
  if (documentIdHeader && !documentId) return c.json({ error: 'Invalid document identifier' }, 400);
  const filter = documentId ? `&document_id=eq.${documentId}` : '';
  const response = await supabase(
    c,
    `community_document_download_events?condominium_id=eq.${condominiumId}${filter}&select=*&order=occurred_at.desc`,
  );
  return c.json(await response.json(), response.ok ? 200 : 400);
});
