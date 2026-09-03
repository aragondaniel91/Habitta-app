import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const app = source('./App.tsx');
const community = source('./pages/ResidentCommunityPage.tsx');
const documents = source('./pages/ResidentDocumentsPage.tsx');
const css = source('./resident-community.css');

describe('HAB-431 resident community surfaces stay separate from administrative workspaces', () => {
  it('routes pure residents to dedicated community and document experiences', () => {
    expect(app).toContain("import('./pages/ResidentCommunityPage')");
    expect(app).toContain("import('./pages/ResidentDocumentsPage')");
    expect(app).toContain('<ResidentCommunityPage');
    expect(app).toContain('<ResidentDocumentsPage');
    expect(app).toContain('<CommunityPage');
    expect(app).toContain('<DocumentsPage');
  });

  it('keeps the resident community hub free of administrative directory statistics', () => {
    expect(community).toContain('canAccessRoute(route, roles)');
    expect(community).toContain('Lo importante, sin herramientas de administración');
    expect(community).toContain('Anuncios');
    expect(community).toContain('Documentos');
    expect(community).not.toContain('getCommunityStats');
    expect(community).not.toContain('Cobertura de contacto');
    expect(community).not.toContain('Completar directorio');
    expect(community).not.toContain('apiRequest');
  });

  it('makes resident documents a read/download surface only', () => {
    for (const allowed of [
      'listCommunityDocumentCategories',
      'listCommunityDocumentFolders',
      'listCommunityDocuments',
      'listCommunityDocumentVersions',
      'downloadCommunityDocumentVersion',
    ]) {
      expect(documents).toContain(allowed);
    }

    for (const forbidden of [
      'createCommunityDocument',
      'createCommunityDocumentCategory',
      'createCommunityDocumentFolder',
      'updateCommunityDocumentCategory',
      'updateCommunityDocumentFolder',
      'uploadCommunityDocumentVersion',
      'archiveCommunityDocument',
      'listCommunityDocumentDownloadEvents',
      'listCommunityDocumentLinks',
      'linkCommunityDocument',
      'uuidPattern',
      'shortId',
      'targetId',
    ]) {
      expect(documents).not.toContain(forbidden);
    }
  });

  it('does not turn client filtering into an authorization boundary', () => {
    expect(documents).toContain('setDocuments(documentRows)');
    expect(documents).toContain('listCommunityDocuments(condominiumId, session)');
    expect(documents).not.toContain("document.audience === 'owners'");
    expect(documents).not.toContain("document.audience === 'residents'");
  });

  it('uses HQ layout tokens and intentional resident breakpoints', () => {
    expect(css).toContain('var(--hq-space-5)');
    expect(css).toContain('var(--hq-control-standard)');
    expect(css).toContain('var(--hq-touch-target)');
    expect(css).toContain('@media (max-width: 900px)');
    expect(css).toContain('@media (max-width: 700px)');
    expect(css).toContain('@media (max-width: 520px)');
  });
});
