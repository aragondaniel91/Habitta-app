import { describe, expect, it } from 'vitest';
import {
  allowedCorsOrigins,
  isAllowedCorsOrigin,
  publicErrorForStatus,
  readPostgrestError,
} from './http-security';

describe('HTTP security helpers', () => {
  it('excludes localhost from production CORS origins', () => {
    const origins = allowedCorsOrigins('https://habitta-web-prod.pages.dev', 'production');

    expect(origins.has('https://habitta-web-prod.pages.dev')).toBe(true);
    expect(origins.has('http://localhost:5173')).toBe(false);
    expect(
      isAllowedCorsOrigin(
        'http://localhost:5173',
        'https://habitta-web-prod.pages.dev',
        'production',
      ),
    ).toBe(false);
  });

  it('keeps localhost available outside production', () => {
    expect(isAllowedCorsOrigin('http://localhost:5173', undefined, 'development')).toBe(true);
  });

  it('normalizes configured origins and ignores invalid values', () => {
    const origins = allowedCorsOrigins(
      'https://habitta.example/path,not a url, https://admin.habitta.example',
      'production',
    );

    expect([...origins]).toEqual([
      'https://habitta.example',
      'https://admin.habitta.example',
    ]);
  });

  it('recognizes PostgREST errors without treating validation responses as internal errors', async () => {
    const postgrest = new Response(
      JSON.stringify({ code: '23505', message: 'duplicate key', details: 'constraint_name' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    );
    const validation = new Response(JSON.stringify({ error: { fieldErrors: {} } }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });

    await expect(readPostgrestError(postgrest)).resolves.toMatchObject({ code: '23505' });
    await expect(readPostgrestError(validation)).resolves.toBeNull();
  });

  it('maps internal failures to stable public messages', () => {
    expect(publicErrorForStatus(403)).toBe('Forbidden');
    expect(publicErrorForStatus(409)).toBe('Request conflict');
    expect(publicErrorForStatus(500)).toBe('Request failed');
  });
});
