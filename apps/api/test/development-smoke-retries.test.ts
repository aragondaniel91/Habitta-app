import { describe, expect, it } from 'vitest';
import { runDevelopmentSmokeWithRetries } from '../../../scripts/release/development-smoke.mjs';

const apiUrl = 'https://api.dev.example';
const expectedWebOrigin = 'https://web.dev.example';
const expectedCommit = 'commit-123';

const healthResponse = (notificationsEmailMode = 'disabled') =>
  Response.json(
    {
      status: 'ok',
      environment: 'development',
      commit: expectedCommit,
      version: '0.0.0',
      buildTimestamp: '2026-07-28T20:26:40Z',
      notificationsEmailMode,
    },
    { headers: { 'Access-Control-Allow-Origin': expectedWebOrigin } },
  );

describe('development smoke retries', () => {
  it('retries a transient protected-route mismatch and still requires the final 401', async () => {
    let attempt = 0;
    const delays: number[] = [];
    const request = async (url: string, init?: RequestInit) => {
      if (url.endsWith('/health')) {
        attempt += 1;
        return healthResponse();
      }
      if (url.endsWith('/not-a-route')) return new Response(null, { status: 404 });
      if (url.endsWith('/v1/organizations') && init?.method === 'OPTIONS')
        return new Response(null, {
          status: 204,
          headers: { 'Access-Control-Allow-Origin': expectedWebOrigin },
        });
      if (url.endsWith('/v1/organizations'))
        return new Response(null, { status: attempt === 1 ? 200 : 401 });
      throw new Error(`unexpected request: ${url}`);
    };

    const result = await runDevelopmentSmokeWithRetries({
      apiUrl,
      expectedWebOrigin,
      expectedCommit,
      emailMode: 'disabled',
      request,
      attempts: 3,
      retryDelayMs: 10,
      sleep: async (milliseconds: number) => {
        delays.push(milliseconds);
      },
    });

    expect(result).toEqual({ errors: [], attempts: 2 });
    expect(delays).toEqual([10]);
  });

  it('does not retry a non-transient safety failure', async () => {
    let healthRequests = 0;
    const result = await runDevelopmentSmokeWithRetries({
      apiUrl,
      expectedWebOrigin,
      expectedCommit,
      emailMode: 'disabled',
      request: async () => {
        healthRequests += 1;
        return healthResponse('live');
      },
      attempts: 6,
      retryDelayMs: 0,
      sleep: async () => undefined,
    });

    expect(result).toEqual({ errors: ['invalid_email_mode'], attempts: 1 });
    expect(healthRequests).toBe(1);
  });

  it('retries temporary network failures', async () => {
    let healthRequests = 0;
    const request = async (url: string, init?: RequestInit) => {
      if (url.endsWith('/health')) {
        healthRequests += 1;
        if (healthRequests === 1) throw new Error('temporary network failure');
        return healthResponse();
      }
      if (url.endsWith('/not-a-route')) return new Response(null, { status: 404 });
      if (url.endsWith('/v1/organizations') && init?.method === 'OPTIONS')
        return new Response(null, {
          status: 204,
          headers: { 'Access-Control-Allow-Origin': expectedWebOrigin },
        });
      if (url.endsWith('/v1/organizations')) return new Response(null, { status: 401 });
      throw new Error(`unexpected request: ${url}`);
    };

    const result = await runDevelopmentSmokeWithRetries({
      apiUrl,
      expectedWebOrigin,
      expectedCommit,
      emailMode: 'disabled',
      request,
      attempts: 3,
      retryDelayMs: 0,
      sleep: async () => undefined,
    });

    expect(result).toEqual({ errors: [], attempts: 2 });
  });
});
