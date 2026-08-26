import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcDir = fileURLToPath(new URL('.', import.meta.url));

const walk = (dir: string, match: (name: string) => boolean): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full, match);
    return match(entry) ? [full] : [];
  });

const relative = (file: string) => file.slice(srcDir.length).split(sep).join('/');

const tsxFiles = walk(srcDir, (name) => name.endsWith('.tsx'));
const contract = readFileSync(join(srcDir, 'ux-contract.css'), 'utf8');

describe('HAB-362 one design standard across every module', () => {
  it('routes every form in the app through the shared form contract', () => {
    // A form that opts out drifts on control height, label size and spacing, which is exactly the
    // inconsistency a user sees when moving between modules.
    const offenders: string[] = [];
    for (const file of tsxFiles) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/<form\b[\s\S]*?>/g)) {
        if (!match[0].includes('ux-form')) {
          offenders.push(`${relative(file)} :: ${match[0].slice(0, 60)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('covers every module, not just the ones redesigned first', () => {
    const adopting = tsxFiles.filter((file) => readFileSync(file, 'utf8').includes('ux-form'));
    expect(adopting.length).toBeGreaterThanOrEqual(40);
    // Modules that previously carried their own form styling.
    for (const module of [
      'features/treasury/',
      'features/governance/',
      'features/maintenance/',
      'features/payments/',
      'features/expenses/',
      'features/notifications/',
      'pages/RequestsPage.tsx',
      'pages/AnnouncementsPage.tsx',
      'pages/StructureManagementPage.tsx',
      'components/PasswordAuthExperience.tsx',
    ]) {
      expect(adopting.some((file) => relative(file).includes(module))).toBe(true);
    }
  });

  it('names the type scale so modules stop re-deriving their own sizes', () => {
    for (const token of [
      '--ux-text-xs',
      '--ux-text-sm',
      '--ux-text-md',
      '--ux-text-control',
      '--ux-text-lg',
    ]) {
      expect(contract).toContain(`${token}:`);
    }
    // The contract itself must consume the scale rather than repeat literal sizes.
    const formContract = contract.slice(0, contract.indexOf('/* Shared workspace drawer.'));
    const literals = formContract.match(/font-size:\s*[0-9.]+rem/g) ?? [];
    expect(literals).toEqual([]);
  });

  it('does not let the contract flatten a control that needs its own room', () => {
    // The contract loads after the global sheets, so the password toggle's padding had to be
    // restated at contract specificity or the typed text would run under the show/hide button.
    const passwordCss = readFileSync(join(srcDir, 'password-auth.css'), 'utf8');
    expect(passwordCss).toContain('.ux-form .password-input .input');
    expect(passwordCss).toContain('padding-right: 5.25rem');
  });

  it('keeps the control contract the whole app now depends on', () => {
    expect(contract).toContain('--ux-control-height: 48px');
    expect(contract).toContain('min-height: var(--ux-control-height)');
    expect(contract).toContain('border-radius: var(--ux-control-radius)');
  });
});
