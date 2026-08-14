import { describe, expect, it } from 'vitest';
import {
  clientErrorLog,
  criticalFinancialRoute,
  financial5xxLog,
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
    const env = {
      APP_ENV: 'production',
      BUILD_COMMIT: 'abc123',
      APP_VERSION: '1.2.3',
    };
    const serverError = new Error('Failed for owner@example.com');
    serverError.stack =
      'Error: Failed for owner@example.com\n at https://api.mihabitta.com/payments?token=secret\n Bearer abc.def.ghi';
    const server = workerErrorLog(serverError, request, 'req-1', env);
    const browserError = { kind: 'error' as const, message: 'Boom', path: '/app' };
    const client = clientErrorLog(browserError, 'req-2', env);

    expect(server).toMatchObject({
      event: 'worker_error',
      requestId: 'req-1',
      environment: 'production',
      commit: 'abc123',
      method: 'POST',
      path: '/v1/payments',
      message: 'Failed for [redacted-email]',
    });
    expect(server.stack).toContain('https://api.mihabitta.com/payments');
    expect(JSON.stringify(server)).not.toContain('999');
    expect(JSON.stringify(server)).not.toContain('Bearer abc.def.ghi');
    expect(JSON.stringify(server)).not.toContain('owner@example.com');
    expect(JSON.stringify(server)).not.toContain('token=secret');
    expect(client).toMatchObject({
      event: 'client_error',
      requestId: 'req-2',
      path: '/app',
    });
  });

  it('classifies only the critical financial route families', () => {
    const condo = '11111111-1111-1111-1111-111111111111';
    expect(criticalFinancialRoute(`/v1/condominiums/${condo}/payments/abc`)).toBe('payments');
    expect(criticalFinancialRoute(`/v1/condominiums/${condo}/treasury/transfers`)).toBe('treasury');
    expect(criticalFinancialRoute(`/v1/condominiums/${condo}/expenses`)).toBe('expenses');
    expect(criticalFinancialRoute(`/v1/condominiums/${condo}/people`)).toBeNull();
  });

  it('emits a compact sanitized event for critical financial 5xx responses only', () => {
    const request = new Request(
      'https://api.mihabitta.com/v1/condominiums/11111111-1111-1111-1111-111111111111/payments/pay-1?token=secret',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer raw-secret' },
        body: JSON.stringify({ payerEmail: 'owner@example.com', amount: 999 }),
      },
    );
    const error = new Error('Payment failed for owner@example.com Bearer raw-secret');
    error.stack =
      'Error: Payment failed for owner@example.com\n at https://api.mihabitta.com/secret?token=secret';
    const event = financial5xxLog(
      request,
      'req-fin-1',
      { APP_ENV: 'production', BUILD_COMMIT: 'abc123', APP_VERSION: '1.2.3' },
      500,
      error,
    );

    expect(event).toMatchObject({
      event: 'critical_financial_5xx',
      requestId: 'req-fin-1',
      route: 'payments',
      status: 500,
      environment: 'production',
    });
    expect(JSON.stringify(event)).not.toContain('raw-secret');
    expect(JSON.stringify(event)).not.toContain('owner@example.com');
    expect(JSON.stringify(event)).not.toContain('token=secret');
    expect(JSON.stringify(event)).not.toContain('999');
    expect(
      financial5xxLog(
        new Request('https://api.mihabitta.com/v1/condominiums/x/people', { method: 'POST' }),
        'req-2',
        {},
        500,
      ),
    ).toBeNull();
  });
});
