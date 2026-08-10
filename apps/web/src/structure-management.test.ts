import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const appUrl = new URL('./App.tsx', import.meta.url);
const pageUrl = new URL('./pages/StructureManagementPage.tsx', import.meta.url);
const mainUrl = new URL('./main.tsx', import.meta.url);

describe('physical structure management workspace', () => {
  it('routes Units to the dedicated structure workspace and loads its styles', async () => {
    const [app, main] = await Promise.all([readFile(appUrl, 'utf8'), readFile(mainUrl, 'utf8')]);

    expect(app).toContain("activeRoute.key === 'units'");
    expect(app).toContain('<StructureManagementPage');
    expect(main).toContain("import './structure-management.css'");
  });

  it('supports building administration and non-destructive unit editing', async () => {
    const source = await readFile(pageUrl, 'utf8');

    expect(source).toContain('Nueva torre o edificio');
    expect(source).toContain('Torres y edificios');
    expect(source).toContain("method: building ? 'PATCH' : 'POST'");
    expect(source).toContain("method: unit ? 'PATCH' : 'POST'");
    expect(source).toContain('Inactiva / archivada');
    expect(source).toContain('Sin torre asignada');
    expect(source).not.toContain("method: 'DELETE'");
  });
});
