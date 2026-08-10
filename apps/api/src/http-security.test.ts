import { describe, expect, it } from 'vitest';
import {
  withinRateLimit,
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

  it('allows deployment previews only for the configured Pages project outside production', () => {
    const configured = 'https://development.habitta-web-dev.pages.dev';

    expect(
      isAllowedCorsOrigin('https://7238fa53.habitta-web-dev.pages.dev', configured, 'development'),
    ).toBe(true);
    expect(
      isAllowedCorsOrigin('https://preview.other-project.pages.dev', configured, 'development'),
    ).toBe(false);
    expect(
      isAllowedCorsOrigin('http://7238fa53.habitta-web-dev.pages.dev', configured, 'development'),
    ).toBe(false);
  });

  it('does not broaden production CORS to Pages deployment previews', () => {
    expect(
      isAllowedCorsOrigin(
        'https://7238fa53.habitta-web-prod.pages.dev',
        'https://habitta-web-prod.pages.dev',
        'production',
      ),
    ).toBe(false);
  });

  it('normalizes configured origins and ignores invalid values', () => {
    const origins = allowedCorsOrigins(
      'https://habitta.example/path,not a url, https://admin.habitta.example',
      'production',
    );

    expect([...origins]).toEqual(['https://habitta.example', 'https://admin.habitta.example']);
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

describe('rate limiting', () => {
  it('allows the request when the limiter says so', async () => {
    const limiter = { limit: async () => ({ success: true }) } as unknown as RateLimit;
    await expect(withinRateLimit(limiter, 'user-1')).resolves.toBe(true);
  });

  it('blocks the request once the limiter refuses', async () => {
    const limiter = { limit: async () => ({ success: false }) } as unknown as RateLimit;
    await expect(withinRateLimit(limiter, 'user-1')).resolves.toBe(false);
  });

  it('keys the limiter by the caller so one user cannot exhaust another', async () => {
    const seen: string[] = [];
    const limiter = {
      limit: async ({ key }: { key: string }) => {
        seen.push(key);
        return { success: true };
      },
    } as unknown as RateLimit;

    await withinRateLimit(limiter, 'user-a');
    await withinRateLimit(limiter, 'user-b');
    expect(seen).toEqual(['user-a', 'user-b']);
  });

  it('stays open when no limiter is bound, so local runs and tests are unaffected', async () => {
    await expect(withinRateLimit(undefined, 'user-1')).resolves.toBe(true);
  });

  it('stays open if the limiter itself fails rather than taking the API down', async () => {
    const limiter = {
      limit: async () => {
        throw new Error('limiter unavailable');
      },
    } as unknown as RateLimit;

    await expect(withinRateLimit(limiter, 'user-1')).resolves.toBe(true);
  });
});
