import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const moduleContextCss = readFileSync(new URL('./module-context.css', import.meta.url), 'utf8');

describe('module context header', () => {
  it('keeps the shell title accessible while removing the visual duplicate', () => {
    expect(moduleContextCss).toContain('.page-header h1');
    expect(moduleContextCss).toContain('clip-path: inset(50%)');
    expect(moduleContextCss).toContain('.page-header__actions');
  });
});
