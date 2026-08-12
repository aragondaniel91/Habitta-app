import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/security-entry';
import type { NotificationBindings } from '../src/notifications/types';

const bindings = (success = true) =>
  ({
    APP_ENV: 'development',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173',
    BUILD_COMMIT: 'test-sha',
    APP_VERSION: 'test-version',
    TELEMETRY_LIMIT: { limit: vi.fn().mockResolvedValue({ success }) },
  }) as unknown as NotificationBindings;

afterEach(() => vi.restoreAllMocks());

describe('client telemetry endpoint', () => {
  it('accepts and logs a sanitized browser error with a correlation ID', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await app.request(
      '/telemetry/client-error',
      {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:5173',
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '203.0.113.10',
        },
        body: JSON.stringify({
          kind: 'error',
          message: 'Crash for owner@example.com',
          stack: 'at https://app.mihabitta.com/payments?token=secret',
          path: '/payments?token=secret',
        }),
      },
      bindings(),
    );

    expect(response.status).toBe(202);
    const requestId = response.headers.get('X-Request-Id');
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    await expect(response.json()).resolves.toMatchObject({ accepted: true, requestId });
    expect(error).toHaveBeenCalledTimes(1);
    const event = error.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(event).toMatchObject({
      event: 'client_error',
      requestId,
      commit: 'test-sha',
      path: '/payments',
      message: 'Crash for [redacted-email]',
    });
    expect(JSON.stringify(event)).not.toContain('token=secret');
  });

  it('rejects oversized telemetry before it can be logged', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await app.request(
      '/telemetry/client-error',
      {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:5173',
          'Content-Type': 'application/json',
          'Content-Length': '5000',
        },
        body: JSON.stringify({ kind: 'error', message: 'x', path: '/' }),
      },
      bindings(),
    );

    expect(response.status).toBe(413);
    expect(error).not.toHaveBeenCalled();
  });

  it('returns 429 when the telemetry limiter rejects the caller', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await app.request(
      '/telemetry/client-error',
      {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:5173',
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '203.0.113.11',
        },
        body: JSON.stringify({ kind: 'error', message: 'boom', path: '/' }),
      },
      bindings(false),
    );

    expect(response.status).toBe(429);
    expect(error).not.toHaveBeenCalled();
  });
});
