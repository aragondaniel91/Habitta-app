import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dialogUrl = new URL('./components/Dialog.tsx', import.meta.url);
const drawerUrl = new URL('./components/Drawer.tsx', import.meta.url);
const dangerZoneUrl = new URL('./features/settings/CondominiumDangerZone.tsx', import.meta.url);
const structureUrl = new URL('./pages/StructureManagementPage.tsx', import.meta.url);
const sourceRoot = new URL('.', import.meta.url);

async function productionSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return productionSourceFiles(path);
      if (!['.ts', '.tsx'].includes(extname(entry.name))) return [];
      if (entry.name.includes('.test.') || entry.name.includes('.spec.')) return [];
      return [path];
    }),
  );
  return nested.flat();
}

describe('HAB-210 shared app dialogs', () => {
  it('uses the shared focus trap and accessible dialog semantics', async () => {
    const [dialog, drawer] = await Promise.all([
      readFile(dialogUrl, 'utf8'),
      readFile(drawerUrl, 'utf8'),
    ]);

    expect(dialog).toContain("import { useDialogBehavior } from './Drawer'");
    expect(dialog).toContain('aria-modal="true"');
    expect(dialog).toContain('aria-labelledby={titleId}');
    expect(dialog).toContain('aria-describedby={description ? descriptionId : undefined}');
    expect(drawer).toContain("querySelector<HTMLElement>('[autofocus]')");
    expect(drawer).toContain("event.key === 'Escape'");
  });

  it('keeps destructive confirmation focus on the safe cancel action', async () => {
    const dialog = await readFile(dialogUrl, 'utf8');

    expect(dialog).toContain('autoFocus={destructive}');
    expect(dialog).toContain('autoFocus={!destructive}');
    expect(dialog).toContain("variant={destructive ? 'danger' : 'primary'}");
  });

  it('migrates the structure editor and condominium deletion to Habitta dialogs', async () => {
    const [structure, dangerZone] = await Promise.all([
      readFile(structureUrl, 'utf8'),
      readFile(dangerZoneUrl, 'utf8'),
    ]);

    expect(structure).toContain("import { Dialog, DialogBody, DialogFooter } from '../components/Dialog'");
    expect(structure).toContain('<Dialog');
    expect(structure).not.toContain('structure-dialog-backdrop');
    expect(dangerZone).toContain("import { ConfirmDialog } from '../../components/Dialog'");
    expect(dangerZone).toContain('<ConfirmDialog');
  });

  it('does not allow native browser confirm, alert or prompt calls in product source', async () => {
    const rootPath = sourceRoot.pathname;
    const files = await productionSourceFiles(rootPath);
    const violations: string[] = [];

    await Promise.all(
      files.map(async (path) => {
        const source = await readFile(path, 'utf8');
        if (/window\.(confirm|alert|prompt)\s*\(/.test(source)) {
          violations.push(path.replace(rootPath, ''));
        }
      }),
    );

    expect(violations.sort()).toEqual([]);
  });
});
