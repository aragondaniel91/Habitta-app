import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
const navigationSource = readFileSync(new URL('./navigation.ts', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('./pages/DocumentsPage.tsx', import.meta.url), 'utf8');
const apiSource = readFileSync(
  new URL('./features/documents/community-api.ts', import.meta.url),
  'utf8',
);
const cssSource = readFileSync(
  new URL('./features/documents/community-documents.css', import.meta.url),
  'utf8',
);

describe('HAB-193 Community Documents workspace contract', () => {
  it('ships as a dedicated lazy module with the standard page header', () => {
    expect(navigationSource).toContain("key: 'documents'");
    expect(navigationSource).toContain("path: '/app/documents'");
    expect(appSource).toContain("import('./pages/DocumentsPage')");
    expect(appSource).toContain("activeRoute.key === 'documents'");
    expect(pageSource).toContain("import { PageHeader } from '../components/PageHeader'");
    expect(pageSource).toContain('title="Documentos"');
  });

  it('uses only authenticated Community Documents API routes for lifecycle operations', () => {
    for (const fragment of [
      '/community-documents`',
      '/categories',
      '/folders',
      '/versions',
      '/archive',
      '/links',
      '/download-events',
    ]) {
      expect(apiSource).toContain(fragment);
    }
    expect(apiSource).toContain('Authorization: `Bearer ${session.access_token}`');
    expect(apiSource).not.toContain('/rest/v1/');
    expect(apiSource).not.toContain('supabase.from(');
    expect(apiSource).not.toContain('r2.dev');
    expect(apiSource).not.toContain('publicUrl');
  });

  it('keeps the browser file contract aligned with the hardened backend', () => {
    expect(apiSource).toContain("'application/pdf'");
    expect(apiSource).toContain("'image/jpeg'");
    expect(apiSource).toContain("'image/png'");
    expect(apiSource).toContain('10 * 1024 * 1024');
    expect(apiSource).toContain('El archivo supera el límite de 10 MB.');
    expect(pageSource).toContain('PDF, JPG o PNG · máximo 10 MB.');
  });

  it('offers mutations only to the document-manager roles from the database contract', () => {
    expect(pageSource).toContain("'condominium_admin'");
    expect(pageSource).toContain("'accountant'");
    expect(pageSource).toContain("'assistant'");
    expect(pageSource).toContain("'board_member'");
    const managerRoleBlock = pageSource.slice(
      pageSource.indexOf('const DOCUMENT_MANAGER_ROLES'),
      pageSource.indexOf('const audienceLabels'),
    );
    expect(managerRoleBlock).not.toContain('payment_reviewer');
    expect(pageSource).toContain('canManageDocuments ?');
    expect(pageSource).toContain('archiveCommunityDocument');
    expect(pageSource).toContain('uploadCommunityDocumentVersion');
  });

  it('keeps version history, download audit, related records and responsive layouts visible', () => {
    expect(pageSource).toContain('Historial de descargas');
    expect(pageSource).toContain('Registros relacionados');
    expect(pageSource).toContain('El historial es inmutable');
    expect(cssSource).toContain('@media (max-width: 820px)');
    expect(cssSource).toContain('@media (max-width: 580px)');
  });
});
