import { describe, expect, it } from 'vitest';
import {
  clientErrorLog,
  parseClientErrorEvent,
  sanitizeDiagnosticText,
  sanitizePathname,
  workerErrorLog,
} from '../src/observability';

describe('observability sanitization', () => {
  it('redacts common credentials, emails and URL query strings', () => {
    const text = sanitizeDiagnosticText(
      'user daniel@example.com Bearer abc.def.ghi https://app.mihabitta.com/payments?token=secret#proof',
    );

    expect(text).not.toContain('daniel@example.com');
    expect(text).not.toContain('token=secret');
    expect(text).toContain('[redacted-email]');
    expect(text).toContain('Bearer [redacted]');
    expect(text).toContain('https://app.mihabitta.com/payments');
  });

  it('keeps only a pathname and removes query or hash data', () => {
    expect(sanitizePathname('/payments/abc?token=secret#proof')).toBe('/payments/abc');
    expect(sanitizePathname('https://evil.example/path')).toBe('/');
  });

  it('accepts only the narrow client error contract', () => {
    expect(
      parseClientErrorEvent({
        kind: 'error',
        message: 'Failed for owner@example.com',
        stack: 'at https://app.mihabitta.com/app?access_token=secret',
        path: '/app?access_token=secret',
        authorization: 'Bearer should-never-be-accepted',
      }),
    ).toEqual({
      kind: 'error',
      message: 'Failed for [redacted-email]',
      stack: 'at https://app.mihabitta.com/app',
      path: '/app',
    });
    expect(parseClientErrorEvent({ kind: 'custom', message: 'x', path: '/' })).toBeNull();
  });

  it('builds structured server and client events without request bodies or headers', () => {
    const request = new Request('https://api.mihabitta.com/v1/payments?proof=secret', {
      method: 'POST',
      headers: { Authorization: 'Bearer secret' },
      body: JSON.stringify({ amount: 999 }),
    });
    const server = workerErrorLog(new Error('Failed for owner@example.com'), request, 'req-1', {
      APP_ENV: 'production',
      BUILD_COMMIT: 'abc123',
      APP_VERSION: '1.2.3',
    });
    const client = clientErrorLog(
      { kind: 'error', message: 'Boom', path: '/app' },
      'req-2',
      { APP_ENV: 'production', BUILD_COMMIT: 'abc123' },
    );

    expect(server).toMatchObject({
      event: 'worker_error',
      requestId: 'req-1',
      environment: 'production',
      commit: 'abc123',
      method: 'POST',
      path: '/v1/payments',
    });
    expect(JSON.stringify(server)).not.toContain('999');
    expect(JSON.stringify(server)).not.toContain('Bearer secret');
    expect(JSON.stringify(server)).not.toContain('owner@example.com');
    expect(client).toMatchObject({ event: 'client_error', requestId: 'req-2', path: '/app' });
  });
});
