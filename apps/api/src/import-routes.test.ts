import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const routeUrl = new URL('./import-routes.ts', import.meta.url);
const apiUrl = new URL('./index.ts', import.meta.url);

describe('guided import API routes', () => {
  it('mounts imports behind the authenticated condominium API', async () => {
    const source = await readFile(apiUrl, 'utf8');
    expect(source).toContain("app.use('/v1/*'");
    expect(source).toContain("app.route('/v1/condominiums', importRoutes)");
  });

  it('uses authenticated RPCs for atomic structure preview and commit', async () => {
    const source = await readFile(routeUrl, 'utf8');
    expect(source).toContain("'preview_structure_import'");
    expect(source).toContain("'import_structure_csv'");
    expect(source).toContain("imports/people/preview");
    expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });
});
