import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const drawerUrl = new URL('./features/people/PeopleImportDrawerV3.tsx', import.meta.url);
const wizardUrl = new URL('./features/imports/CsvImportWizard.tsx', import.meta.url);

async function source(url: URL) {
  return readFile(url, 'utf8');
}

describe('HAB-318 people CSV import consolidation', () => {
  it('routes the live People drawer through the canonical CSV wizard', async () => {
    const drawer = await source(drawerUrl);

    expect(drawer).toContain("import { CsvImportWizard } from '../imports/CsvImportWizard'");
    expect(drawer).toContain('<CsvImportWizard');
    expect(drawer).toContain('kind="people"');
    expect(drawer).not.toContain('/people/import/preview');
    expect(drawer).not.toContain('preview.valid');
  });

  it('previews with the typed import route and commits validated object rows', async () => {
    const wizard = await source(wizardUrl);

    expect(wizard).toContain('/imports/people/preview');
    expect(wizard).toContain('/people/import/commit');
    expect(wizard).toContain('rows: validRows.map((row) => row.data)');
    expect(wizard).toContain('if (file.size > 2_000_000)');
    expect(wizard).toContain('if (nextRows.length > 1000)');
  });
});
