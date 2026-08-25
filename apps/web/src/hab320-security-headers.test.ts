import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const headersUrl = new URL('../public/_headers', import.meta.url);

async function headers() {
  return readFile(headersUrl, 'utf8');
}

describe('HAB-320 main web security headers', () => {
  it('blocks framing and common browser capability abuse', async () => {
    const value = await headers();

    expect(value).toContain("frame-ancestors 'none'");
    expect(value).toContain('X-Frame-Options: DENY');
    expect(value).toContain('X-Content-Type-Options: nosniff');
    expect(value).toContain('Referrer-Policy: strict-origin-when-cross-origin');
    expect(value).toContain(
      'Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    );
  });

  it('keeps scripts locked down while allowing required production runtime dependencies', async () => {
    const value = await headers();

    expect(value).toContain("script-src 'self' https://static.cloudflareinsights.com");
    expect(value).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(value).not.toContain('sha256-rzYL7hOwHzQqRFNJOlaxJfjShAIx5DDvf4KFTSIA7Xo=');
    expect(value).not.toContain('sha256-qi6h5hk1m/LyOmzF1sS5yp7wJAY8PAYzz6Fi9P0WZKo=');
    expect(value).toContain('Cache-Control: no-transform');
    expect(value).toContain('https://fonts.googleapis.com');
    expect(value).toContain('https://fonts.gstatic.com');
    expect(value).toContain('https://cloudflareinsights.com');
    expect(value).toContain('https://kgsfaahixbcwcmykmhat.supabase.co');
    expect(value).toContain('https://habitta-api-prod.aragondaniel91.workers.dev');
    expect(value).toContain('https://habitta-api-dev.aragondaniel91.workers.dev');
    expect(value).toContain("object-src 'none'");
    expect(value).toContain("base-uri 'self'");
    expect(value).toContain("form-action 'self'");
  });
});
