import { describe, expect, it } from 'vitest';
import { allowedCorsOrigins, app } from '../src/index';

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
      workerVersionId: 'unknown',
      workerVersionTag: 'unknown',
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
});
