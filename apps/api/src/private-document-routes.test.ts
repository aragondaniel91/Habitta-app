import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const routeUrl = new URL('./private-document-routes-base.ts', import.meta.url);
const wrapperUrl = new URL('./private-document-routes.ts', import.meta.url);
const apiUrl = new URL('./index.ts', import.meta.url);

describe('private operational document routes', () => {
  it('mounts private documents behind the authenticated condominium API', async () => {
    const source = await readFile(apiUrl, 'utf8');
    const wrapperSource = await readFile(wrapperUrl, 'utf8');
    expect(source).toContain("app.use('/v1/*'");
    expect(source).toContain("app.route('/v1/condominiums', privateDocumentRoutes)");
    expect(wrapperSource).toContain(
      "import { privateDocumentRoutes as basePrivateDocumentRoutes } from './private-document-routes-base'",
    );
    expect(wrapperSource).toContain("privateDocumentRoutes.route('/', basePrivateDocumentRoutes)");
    expect(wrapperSource).toContain("privateDocumentRoutes.route('/', maintenanceDocumentRoutes)");
  });

  it('rate-limits every private document PUT before the upload routes run', async () => {
    const source = await readFile(wrapperUrl, 'utf8');
    const limiter = source.indexOf("privateDocumentRoutes.use('*'");
    const baseRoutes = source.indexOf("privateDocumentRoutes.route('/', basePrivateDocumentRoutes)");
    const maintenanceRoutes = source.indexOf("privateDocumentRoutes.route('/', maintenanceDocumentRoutes)");

    expect(source).toContain('withinRateLimit(c.env.PROOF_UPLOAD_LIMIT');
    expect(source).toContain("c.req.method === 'PUT'");
    expect(source).toContain("return c.json({ error: 'Too many requests' }, 429)");
    expect(limiter).toBeGreaterThanOrEqual(0);
    expect(baseRoutes).toBeGreaterThan(limiter);
    expect(maintenanceRoutes).toBeGreaterThan(limiter);
  });

  it('allows the upload headers through the single CORS definition', async () => {
    const source = await readFile(new URL('./security-entry.ts', import.meta.url), 'utf8');
    expect(source).toContain("'X-Document-Type'");
    expect(source).toContain("'X-Visibility'");
    expect(source).toContain("'X-Filename'");
    expect(source).toContain("'X-Quote-Id'");
  });

  it('uses private R2 storage, authenticated RPC metadata and rollback on failure', async () => {
    const source = await readFile(routeUrl, 'utf8');
    expect(source).toContain('PAYMENT_PROOFS.put');
    expect(source).toContain('PAYMENT_PROOFS.delete');
    expect(source).toContain('record_expense_attachment');
    expect(source).toContain('record_governance_attachment');
    expect(source).toContain('record_service_request_attachment');
    expect(source).toContain('record_announcement_attachment');
    expect(source).toContain("'Cache-Control': 'private, no-store, max-age=0'");
    expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('enforces an explicit allowlist and 20 MB maximum', async () => {
    const source = await readFile(routeUrl, 'utf8');
    expect(source).toContain('MAX_DOCUMENT_BYTES = 20 * 1024 * 1024');
    expect(source).toContain("'application/pdf'");
    expect(source).toContain(
      "'application/vnd.openxmlformats-officedocument.wordprocessingml.document'",
    );
    expect(source).toContain("'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'");
  });
});
