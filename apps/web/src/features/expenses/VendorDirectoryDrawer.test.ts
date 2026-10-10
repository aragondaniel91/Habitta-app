import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const pageUrl = new URL('../../pages/ExpensesPage.tsx', import.meta.url);
const drawerUrl = new URL('./VendorDirectoryDrawer.tsx', import.meta.url);

describe('vendor directory workflow', () => {
  it('has one dedicated directory entry point and removes quick-create from categories', async () => {
    const page = await readFile(pageUrl, 'utf8');

    expect(page).toContain('Directorio de proveedores');
    expect(page).toContain("setDrawer('vendors')");
    expect(page).not.toContain('Categorías y proveedores');
    expect(page).not.toContain('const createVendor = async () =>');
  });

  it('uses the scoped API route for profile create, edit, archive, and restore', async () => {
    const drawer = await readFile(drawerUrl, 'utf8');

    expect(drawer).toContain("method: editing ? 'PATCH' : 'POST'");
    expect(drawer).toContain("vendors${editing ? `/${editing.id}` : ''}");
    expect(drawer).toContain('isActive: !archiveTarget.is_active');
    expect(drawer).toContain('No incluye credenciales');
    expect(drawer).toContain('bancarias.');
  });
});
