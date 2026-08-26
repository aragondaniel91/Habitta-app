import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const page = source('./pages/DocumentsPage.tsx');
const api = source('./features/documents/community-api.ts');
const migration = source(
  '../../../supabase/migrations/20260826060000_hab360_edit_document_catalog.sql',
);

describe('HAB-360 correctable document catalog', () => {
  it('lets the same composer correct an existing entry', () => {
    expect(page).toContain('Crear una carpeta nueva');
    expect(page).toContain('Crear una categoría nueva');
    expect(page).toContain('selectFolderToEdit');
    expect(page).toContain('selectCategoryToEdit');
  });

  it('names the action for what it is', () => {
    expect(page).toContain("? 'Editar carpeta'");
    expect(page).toContain("? 'Editar categoría'");
    // Assert the branch, not one Prettier-dependent spelling of its indentation.
    expect(page).toMatch(/editingFolderId\s*\?\s*'Guardar cambios'/);
  });

  it('prefills the form from the selected entry', () => {
    expect(page).toContain("setFolderParentId(folder?.parent_folder_id ?? '')");
    expect(page).toContain("setCategoryAudience(category?.default_audience ?? 'management')");
    expect(page).toContain('category?.default_retention_days');
  });

  it('routes corrections through the guarded PATCH endpoints', () => {
    expect(api).toContain('export async function updateCommunityDocumentCategory');
    expect(api).toContain('export async function updateCommunityDocumentFolder');
    expect(api).toContain('`${basePath(condominiumId)}/categories/${categoryId}`');
    expect(api).toContain('`${basePath(condominiumId)}/folders/${folderId}`');
    expect(api).toContain("method: 'PATCH'");
  });

  it('archives instead of deleting and only when correcting', () => {
    expect(page).toContain('<option value="archived">Archivada</option>');
    expect(page).toContain('Una carpeta archivada deja de ofrecerse y conserva sus documentos.');
    expect(page).toContain('{editingFolderId ? (');
    expect(page).not.toMatch(/method:\s*'DELETE'/);
    expect(page).not.toMatch(/window\.(confirm|alert|prompt)\s*\(/);
  });

  it('shows archived entries as archived rather than hiding them from the chooser', () => {
    expect(page).toContain('`${folder.name} (archivada)`');
    expect(page).toContain('`${category.name} (archivada)`');
  });

  it('protects the tree and the in-use rule in the database', () => {
    expect(migration).toContain('folder cannot contain itself');
    expect(migration).toContain('with recursive descendants as (');
    expect(migration).toContain('document folder still in use');
    expect(migration).toContain('document category still in use');
    expect(migration).not.toMatch(/delete\s+from\s+public\.community_document/i);
  });
});
