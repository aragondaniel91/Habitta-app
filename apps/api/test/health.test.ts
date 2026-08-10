import { describe, expect, it } from 'vitest';
import { allowedCorsOrigins } from '../src/http-security';
import { app } from '../src/index';

describe('health endpoint', () => {
  it('reports the API health', async () => {
    const response = await app.request('/health');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      environment: 'development',
      commit: 'unknown',
      version: 'unknown',
      buildTimestamp: 'unknown',
      notificationsEmailMode: 'disabled',
    });
  });
});

describe('development CORS origins', () => {
  it('normalizes configured Pages origins and rejects wildcard input', () => {
    expect(allowedCorsOrigins(' https://preview.pages.dev/path,not-a-url,* ')).toEqual(
      new Set(['http://localhost:5173', 'https://preview.pages.dev']),
    );
  });

  it('is the only definition, so production can no longer trust localhost by accident', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../src/index.ts', import.meta.url), 'utf8'),
    );

    expect(source).not.toContain('allowedCorsOrigins');
    expect(source).not.toContain("from 'hono/cors'");
    expect(allowedCorsOrigins('https://app.mihabitta.com', 'production')).toEqual(
      new Set(['https://app.mihabitta.com']),
    );
  });
});
