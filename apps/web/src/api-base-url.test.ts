import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const apiClientUrl = new URL('./lib/api.ts', import.meta.url);

describe('API base URL configuration', () => {
  it('prefers the release variable before the legacy variable and localhost fallback', async () => {
    const source = await readFile(apiClientUrl, 'utf8');
    const configured = source.indexOf('import.meta.env.VITE_API_BASE_URL');
    const legacy = source.indexOf('import.meta.env.VITE_API_URL');
    const local = source.indexOf("'http://localhost:8787'");

    expect(configured).toBeGreaterThan(-1);
    expect(legacy).toBeGreaterThan(configured);
    expect(local).toBeGreaterThan(legacy);
    expect(source).toContain('fetch(`${apiBaseUrl}${path}`');
  });
});
