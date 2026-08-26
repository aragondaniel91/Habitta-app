import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcDir = fileURLToPath(new URL('.', import.meta.url));
const sheets = readdirSync(srcDir).filter((name) => name.endsWith('.css'));
const read = (name: string) => readFileSync(join(srcDir, name), 'utf8');

const definitionsIn = (css: string) =>
  [...css.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((match) => match[1] as string);

const allDefined = new Set(sheets.flatMap((name) => definitionsIn(read(name))));

describe('HAB-364 colour tokens', () => {
  it('never references a token that does not exist without a fallback', () => {
    /*
     * A `var()` naming an undefined token with no fallback is invalid at computed-value time: text
     * falls back to the inherited colour, backgrounds to transparent, borders to currentColor. It
     * fails silently, which is why 149 of these had gone unnoticed.
     */
    const broken: string[] = [];
    for (const name of sheets) {
      for (const use of read(name).matchAll(/var\((--[a-z0-9-]+)\s*(,)?/g)) {
        const token = use[1] as string;
        if (!use[2] && !allDefined.has(token)) broken.push(`${name} :: var(${token})`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('defines each palette token exactly once', () => {
    // The palette used to be declared in two sheets with seven conflicting values; whichever
    // imported last won by accident rather than by decision.
    const counts = new Map<string, string[]>();
    for (const name of sheets) {
      if (name === 'print.css') continue;
      // Only :root declarations. A token redefined on a component selector is a deliberate local
      // override -- a drawer widening its own form padding -- not a second global palette.
      const rootBlocks = read(name).match(/:root\s*\{[^}]*\}/g) ?? [];
      for (const token of definitionsIn(rootBlocks.join('\n'))) {
        if (!token.startsWith('--ux-')) counts.set(token, [...(counts.get(token) ?? []), name]);
      }
    }
    const duplicated = [...counts.entries()]
      .filter(([, files]) => new Set(files).size > 1)
      .map(([token, files]) => `${token} :: ${[...new Set(files)].join(', ')}`);
    expect(duplicated).toEqual([]);
  });

  it('keeps the palette in the palette sheet', () => {
    const palette = read('brand-palette.css');
    for (const token of [
      '--surface',
      '--text',
      '--muted',
      '--border',
      '--green',
      '--red',
      '--amber',
      '--chart-green',
    ]) {
      expect(palette).toContain(`${token}:`);
    }
    // The dark block has to live beside the light one or it loses to a later sheet.
    expect(palette).toContain("[data-theme='dark']");
    expect(palette.indexOf("[data-theme='dark']")).toBeGreaterThan(palette.indexOf('--surface:'));
  });

  it('keeps raw hex out of the module sheets', () => {
    // 318 loose hex values across 137 colours became 21. What is left is a deliberate one-off
    // (a print black, a category accent), not a fifth shade of the same grey.
    let loose = 0;
    for (const name of sheets) {
      if (name === 'brand-palette.css') continue;
      loose += (read(name).match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).length;
    }
    expect(loose).toBeLessThanOrEqual(21);
  });
});
