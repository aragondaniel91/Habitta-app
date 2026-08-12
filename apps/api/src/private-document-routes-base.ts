import { Hono } from 'hono';
import type { Context } from 'hono';
import { uuidSchema } from '@habitta/validation';
import type { NotificationBindings } from './notifications/types';

type Variables = { token: string; userId: string };
type PrivateDocumentEnvironment = { Bindings: NotificationBindings; Variables: Variables };
type PrivateDocumentContext = Context<PrivateDocumentEnvironment>;
type DocumentScope = 'expenses' | 'governance' | 'requests' | 'announcements';

type DocumentRouteDefinition = {
  scope: DocumentScope;
  parentParam: string;
  table: string;
  parentColumn: string;
  filenameColumn: string;
  recordRpc: string;
};

const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
]);

const extensionContentTypes: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
};

const definitions: Record<DocumentScope, DocumentRouteDefinition> = {
  expenses: {
    scope: 'expenses',
    parentParam: 'expenseId',
    table: 'expense_attachments',
    parentColumn: 'expense_id',
    filenameColumn: 'original_filename',
    recordRpc: 'record_expense_attachment',
  },
  governance: {
    scope: 'governance',
    parentParam: 'proposalId',
    table: 'governance_attachments',
    parentColumn: 'proposal_id',
    filenameColumn: 'file_name',
    recordRpc: 'record_governance_attachment',
  },
  requests: {
    scope: 'requests',
    parentParam: 'requestId',
    table: 'service_request_attachments',
    parentColumn: 'request_id',
    filenameColumn: 'original_filename',
    recordRpc: 'record_service_request_attachment',
  },
  announcements: {
    scope: 'announcements',
    parentParam: 'announcementId',
    table: 'announcement_attachments',
    parentColumn: 'announcement_id',
    filenameColumn: 'original_filename',
    recordRpc: 'record_announcement_attachment',
  },
};

const expenseDocumentTypes = new Set(['invoice', 'receipt', 'quote', 'support', 'other']);
const governanceDocumentTypes = new Set(['quote', 'budget', 'support', 'minutes', 'other']);

const supabaseHeaders = (env: NotificationBindings, token: string) => ({
  apikey: env.SUPABASE_ANON_KEY,
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

const sanitizeFilenameCharacter = (character: string) => {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint <= 0x1f || codePoint === 0x7f || '<>:"/\\|?*'.includes(character)
    ? '_'
    : character;
};

const safeFilename = (value: string) =>
  Array.from(value.normalize('NFKC'), sanitizeFilenameCharacter).join('').trim().slice(0, 255) ||
  'documento';

const contentDispositionFilename = (value: string) => {
  const ascii = safeFilename(value).replace(/[^a-zA-Z0-9._ -]/g, '_');
  const encoded = encodeURIComponent(value).replaceAll("'", '%27');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
};

const normalizeContentType = (value: string | undefined, filename: string) => {
  const supplied = (value ?? '').split(';', 1)[0]?.trim().toLowerCase() ?? '';
  if (ALLOWED_CONTENT_TYPES.has(supplied)) return supplied;
  const extension = Object.keys(extensionContentTypes).find((candidate) =>
    filename.toLowerCase().endsWith(candidate),
  );
  return extension ? (extensionContentTypes[extension] ?? supplied) : supplied;
};

const digest = async (bytes: ArrayBuffer) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');

const callRpc = (
  env: NotificationBindings,
  token: string,
  name: string,
  payload: Record<string, unknown>,
) =>
  fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: supabaseHeaders(env, token),
    body: JSON.stringify(payload),
  });

const readUuid = (value: string | undefined) => {
  const parsed = uuidSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

const documentTypeFor = (scope: DocumentScope, raw: string | undefined) => {
  const value = (raw ?? 'support').trim().toLowerCase();
  if (scope === 'expenses') return expenseDocumentTypes.has(value) ? value : null;
  if (scope === 'governance') return governanceDocumentTypes.has(value) ? value : null;
  return null;
};

const errorPayload = async (response: Response, fallback: string) => {
  try {
    const value = (await response.json()) as { message?: string; error?: string };
    return { error: value.message ?? value.error ?? fallback };
  } catch {
    return { error: fallback };
  }
};

export const privateDocumentRoutes = new Hono<PrivateDocumentEnvironment>();

const upload = (definition: DocumentRouteDefinition) => async (c: PrivateDocumentContext) => {
  const condominiumId = readUuid(c.req.param('condominiumId'));
  const parentId = readUuid(c.req.param(definition.parentParam));
  if (!condominiumId || !parentId)
    return c.json({ error: 'Invalid document target identifier' }, 400);

  const filename = safeFilename(c.req.header('X-Filename') ?? 'documento');
  const contentType = normalizeContentType(c.req.header('Content-Type'), filename);
  if (!ALLOWED_CONTENT_TYPES.has(contentType))
    return c.json({ error: 'Unsupported document type' }, 415);

  const declaredLength = Number(c.req.header('Content-Length') ?? '0');
  if (declaredLength > MAX_DOCUMENT_BYTES)
    return c.json({ error: 'Document exceeds the 20 MB limit' }, 413);

  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength < 1) return c.json({ error: 'Document is empty' }, 400);
  if (bytes.byteLength > MAX_DOCUMENT_BYTES)
    return c.json({ error: 'Document exceeds the 20 MB limit' }, 413);

  const attachmentId = crypto.randomUUID();
  const storageKey = `${definition.scope}/${attachmentId}`;
  const hash = await digest(bytes);
  const payload: Record<string, unknown> = {
    target_condominium: condominiumId,
    target_attachment: attachmentId,
    key_value: storageKey,
    filename,
    mime: contentType,
    bytes: bytes.byteLength,
    hash,
  };

  if (definition.scope === 'expenses') {
    const documentKind = documentTypeFor(definition.scope, c.req.header('X-Document-Type'));
    if (!documentKind) return c.json({ error: 'Invalid expense document type' }, 400);
    payload.target_expense = parentId;
    payload.document_kind = documentKind;
  } else if (definition.scope === 'governance') {
    const documentKind = documentTypeFor(definition.scope, c.req.header('X-Document-Type'));
    if (!documentKind) return c.json({ error: 'Invalid governance document type' }, 400);
    payload.target_proposal = parentId;
    payload.document_kind = documentKind;
  } else if (definition.scope === 'requests') {
    const visibility = (c.req.header('X-Visibility') ?? 'public').trim().toLowerCase();
    if (!['public', 'internal'].includes(visibility))
      return c.json({ error: 'Invalid attachment visibility' }, 400);
    const commentHeader = c.req.header('X-Comment-Id');
    const commentId = commentHeader ? readUuid(commentHeader) : null;
    if (commentHeader && !commentId)
      return c.json({ error: 'Invalid request comment identifier' }, 400);
    payload.target_request = parentId;
    payload.target_comment = commentId;
    payload.attachment_visibility = visibility;
  } else {
    payload.target_announcement = parentId;
  }

  await c.env.PAYMENT_PROOFS.put(storageKey, bytes, {
    httpMetadata: { contentType },
    customMetadata: {
      condominiumId,
      scope: definition.scope,
      parentId,
      sha256: hash,
    },
  });

  const recorded = await callRpc(c.env, c.get('token'), definition.recordRpc, payload);
  if (!recorded.ok) {
    await c.env.PAYMENT_PROOFS.delete(storageKey);
    const status = recorded.status === 401 || recorded.status === 403 ? 403 : 400;
    return c.json(await errorPayload(recorded, 'Document metadata could not be saved'), status);
  }

  return c.json(await recorded.json(), 201);
};

const download = (definition: DocumentRouteDefinition) => async (c: PrivateDocumentContext) => {
  const condominiumId = readUuid(c.req.param('condominiumId'));
  const parentId = readUuid(c.req.param(definition.parentParam));
  const attachmentId = readUuid(c.req.param('attachmentId'));
  if (!condominiumId || !parentId || !attachmentId)
    return c.json({ error: 'Invalid document identifier' }, 400);

  const query = [
    `${definition.table}?id=eq.${attachmentId}`,
    `condominium_id=eq.${condominiumId}`,
    `${definition.parentColumn}=eq.${parentId}`,
    `select=storage_key,${definition.filenameColumn},content_type`,
  ].join('&');
  const response = await fetch(`${c.env.SUPABASE_URL}/rest/v1/${query}`, {
    headers: supabaseHeaders(c.env, c.get('token')),
  });
  const rows = (await response.json()) as Array<Record<string, string | null>>;
  if (!response.ok || !rows[0]) return c.json({ error: 'Document not found' }, 404);

  const storageKey = rows[0].storage_key;
  const filename = rows[0][definition.filenameColumn];
  const contentType = rows[0].content_type;
  if (!storageKey || !filename || !contentType)
    return c.json({ error: 'Legacy external document has no private file' }, 409);

  const object = await c.env.PAYMENT_PROOFS.get(storageKey);
  if (!object) return c.json({ error: 'Document file is unavailable' }, 404);

  return new Response(object.body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': contentDispositionFilename(filename),
      'Content-Length': String(object.size),
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};

privateDocumentRoutes.get('/:condominiumId/expenses/:expenseId/attachments', async (c) => {
  const condominiumId = readUuid(c.req.param('condominiumId'));
  const expenseId = readUuid(c.req.param('expenseId'));
  if (!condominiumId || !expenseId) return c.json({ error: 'Invalid expense identifier' }, 400);
  const response = await fetch(
    `${c.env.SUPABASE_URL}/rest/v1/expense_attachments?condominium_id=eq.${condominiumId}&expense_id=eq.${expenseId}&select=*&order=created_at.asc,id.asc`,
    { headers: supabaseHeaders(c.env, c.get('token')) },
  );
  return c.json(await response.json(), response.ok ? 200 : 400);
});

privateDocumentRoutes.put(
  '/:condominiumId/expenses/:expenseId/attachments',
  upload(definitions.expenses),
);
privateDocumentRoutes.get(
  '/:condominiumId/expenses/:expenseId/attachments/:attachmentId/file',
  download(definitions.expenses),
);

privateDocumentRoutes.put(
  '/:condominiumId/governance-proposals/:proposalId/attachments',
  upload(definitions.governance),
);
privateDocumentRoutes.get(
  '/:condominiumId/governance-proposals/:proposalId/attachments/:attachmentId/file',
  download(definitions.governance),
);

privateDocumentRoutes.put(
  '/:condominiumId/requests/:requestId/attachments',
  upload(definitions.requests),
);
privateDocumentRoutes.get(
  '/:condominiumId/requests/:requestId/attachments/:attachmentId/file',
  download(definitions.requests),
);

privateDocumentRoutes.put(
  '/:condominiumId/announcements/:announcementId/attachments',
  upload(definitions.announcements),
);
privateDocumentRoutes.get(
  '/:condominiumId/announcements/:announcementId/attachments/:attachmentId/file',
  download(definitions.announcements),
);
