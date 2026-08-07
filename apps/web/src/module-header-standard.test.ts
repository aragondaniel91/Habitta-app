import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const moduleHeaderSelectors = [
  '.announcements-overview',
  '.directory-heading',
  '.community-overview',
  '.expenses-overview',
  '.governance-overview',
  '.payments-overview',
  '.receivables-overview',
  '.reports-overview',
  '.requests-overview',
  '.settings-overview',
  '.structure-hero',
  '.team-access-overview',
  '.treasury-overview',
];

describe('module header visual standard', () => {
  it('loads after the module-specific styles so the contract remains authoritative', () => {
    const entrypoint = readSource('./main.tsx');
    const standardImport = entrypoint.indexOf("import './module-header-standard.css';");

    expect(standardImport).toBeGreaterThan(entrypoint.indexOf("import './module-context.css';"));
    expect(standardImport).toBeGreaterThan(entrypoint.indexOf("import './announcements.css';"));
  });

  it('covers every administrative module and the upcoming Treasury workspace', () => {
    const stylesheet = readSource('./module-header-standard.css');

    for (const selector of moduleHeaderSelectors) {
      expect(stylesheet).toContain(selector);
    }
  });

  it('defines one hierarchy for kicker, title, description, actions, and responsive layout', () => {
    const stylesheet = readSource('./module-header-standard.css');

    expect(stylesheet).toContain('--module-header-title-size: clamp(2rem, 3vw, 3rem);');
    expect(stylesheet).toContain('--module-header-title-size: clamp(2rem, 5vw, 2.5rem);');
    expect(stylesheet).toContain('--module-header-title-size: 2rem;');
    expect(stylesheet).toContain('font-size: 0.75rem !important;');
    expect(stylesheet).toContain('font-size: 1rem !important;');
    expect(stylesheet).toContain('font-family: var(--font-heading) !important;');
    expect(stylesheet).toContain('> :last-child:not(:first-child)');
    expect(stylesheet).toContain('@media (max-width: 960px)');
    expect(stylesheet).toContain('@media (max-width: 720px)');
    expect(stylesheet).toContain('background: transparent !important;');
    expect(stylesheet).toContain('border-bottom: 1px solid var(--border) !important;');
  });
});
