import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const routeUrl = new URL('./private-document-routes.ts', import.meta.url);
const apiUrl = new URL('./index.ts', import.meta.url);

describe('private operational document routes', () => {
  it('mounts private documents behind the authenticated condominium API', async () => {
    const source = await readFile(apiUrl, 'utf8');
    expect(source).toContain("app.use('/v1/*'");
    expect(source).toContain("app.route('/v1/condominiums', privateDocumentRoutes)");
    expect(source).toContain("'X-Document-Type'");
    expect(source).toContain("'X-Visibility'");
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
