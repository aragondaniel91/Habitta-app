import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import type { NotificationBindings } from './notifications/types';

type Variables = { token: string; userId: string };
type AppEnvironment = { Bindings: NotificationBindings; Variables: Variables };
type AppContext = Context<AppEnvironment>;

const uuid = z.string().uuid();
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const documentType = z.enum([
  'quote',
  'completion_photo',
  'completion_document',
  'invoice',
  'support',
  'other',
]);
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
const supabaseHeaders = (c: AppContext) => ({
  apikey: c.env.SUPABASE_ANON_KEY,
  Authorization: `Bearer ${c.get('token')}`,
  'Content-Type': 'application/json',
});
const errorPayload = async (response: Response, fallback: string) => {
  try {
    const value = (await response.json()) as { message?: string; error?: string };
    return { error: value.message ?? value.error ?? fallback };
  } catch {
    return { error: fallback };
  }
};

export const maintenanceDocumentRoutes = new Hono<AppEnvironment>();

maintenanceDocumentRoutes.get(
  '/:condominiumId/maintenance/work-orders/:workOrderId/attachments',
  async (c) => {
    const condominiumId = uuid.parse(c.req.param('condominiumId'));
    const workOrderId = uuid.parse(c.req.param('workOrderId'));
    const response = await fetch(
      `${c.env.SUPABASE_URL}/rest/v1/maintenance_attachments?condominium_id=eq.${condominiumId}&work_order_id=eq.${workOrderId}&select=*&order=created_at.asc,id.asc`,
      { headers: supabaseHeaders(c) },
    );
    return c.json(await response.json(), response.ok ? 200 : 403);
  },
);

maintenanceDocumentRoutes.put(
  '/:condominiumId/maintenance/work-orders/:workOrderId/attachments',
  async (c) => {
    const condominiumId = uuid.parse(c.req.param('condominiumId'));
    const workOrderId = uuid.parse(c.req.param('workOrderId'));
    const filename = safeFilename(c.req.header('X-Filename') ?? 'documento');
    const parsedDocumentType = documentType.safeParse(
      (c.req.header('X-Document-Type') ?? 'support').trim().toLowerCase(),
    );
    if (!parsedDocumentType.success) return c.json({ error: 'Invalid maintenance document type' }, 400);
    const quoteHeader = c.req.header('X-Quote-Id');
    const parsedQuote = quoteHeader ? uuid.safeParse(quoteHeader) : null;
    if (parsedQuote && !parsedQuote.success)
      return c.json({ error: 'Invalid maintenance quote identifier' }, 400);
    const quoteId = parsedQuote?.data ?? null;
    if (parsedDocumentType.data === 'quote' && !quoteId)
      return c.json({ error: 'Quote documents require X-Quote-Id' }, 400);

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
    const storageKey = `maintenance/${attachmentId}`;
    const hash = await digest(bytes);
    await c.env.PAYMENT_PROOFS.put(storageKey, bytes, {
      httpMetadata: { contentType },
      customMetadata: {
        condominiumId,
        scope: 'maintenance',
        parentId: workOrderId,
        sha256: hash,
      },
    });

    const recorded = await fetch(`${c.env.SUPABASE_URL}/rest/v1/rpc/record_maintenance_attachment`, {
      method: 'POST',
      headers: supabaseHeaders(c),
      body: JSON.stringify({
        target_condominium: condominiumId,
        target_work_order: workOrderId,
        target_quote: quoteId,
        target_attachment: attachmentId,
        document_kind: parsedDocumentType.data,
        key_value: storageKey,
        filename,
        mime: contentType,
        bytes: bytes.byteLength,
        hash,
      }),
    });
    if (!recorded.ok) {
      await c.env.PAYMENT_PROOFS.delete(storageKey);
      const status = recorded.status === 401 || recorded.status === 403 ? 403 : 400;
      return c.json(await errorPayload(recorded, 'Document metadata could not be saved'), status);
    }
    return c.json(await recorded.json(), 201);
  },
);

maintenanceDocumentRoutes.get(
  '/:condominiumId/maintenance/work-orders/:workOrderId/attachments/:attachmentId/file',
  async (c) => {
    const condominiumId = uuid.parse(c.req.param('condominiumId'));
    const workOrderId = uuid.parse(c.req.param('workOrderId'));
    const attachmentId = uuid.parse(c.req.param('attachmentId'));
    const response = await fetch(
      `${c.env.SUPABASE_URL}/rest/v1/maintenance_attachments?id=eq.${attachmentId}&condominium_id=eq.${condominiumId}&work_order_id=eq.${workOrderId}&select=storage_key,original_filename,content_type`,
      { headers: supabaseHeaders(c) },
    );
    const rows = (await response.json()) as Array<{
      storage_key?: string | null;
      original_filename?: string | null;
      content_type?: string | null;
    }>;
    if (!response.ok || !rows[0]) return c.json({ error: 'Document not found' }, 404);
    const { storage_key: storageKey, original_filename: filename, content_type: contentType } = rows[0];
    if (!storageKey || !filename || !contentType)
      return c.json({ error: 'Document metadata is incomplete' }, 409);
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
  },
);
