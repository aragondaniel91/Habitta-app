import { describe, expect, it } from 'vitest';
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
