import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const headers = readFileSync(new URL('../../platform-admin/_headers', import.meta.url), 'utf8');

/*
 * Reported directly from production: opening any Platform Admin page throws two console CSP
 * violations — an inline script (Cloudflare's own Bot Management/Challenge Platform snippet) and
 * the external Cloudflare Web Analytics beacon (https://static.cloudflareinsights.com/beacon.min.js).
 * Both are injected by Cloudflare at the edge on every page load for this zone, not by our own HTML —
 * apps/platform-admin/onboarding.html and friends never reference either script. HAB-320 already
 * solved this exact problem for apps/web by explicitly allowing static.cloudflareinsights.com in
 * script-src (and cloudflareinsights.com in connect-src, for the beacon's own reporting calls), but
 * that fix was never carried over to apps/platform-admin/_headers. Apply the same narrow allowlist
 * here: it restores Cloudflare's own traffic analytics with no new script origin trusted beyond
 * Cloudflare's own CDN. The inline Bot Management snippet stays deliberately blocked — its content is
 * a random per-request token, so no static hash could ever allow it, and broadening to
 * 'unsafe-inline' would defeat the CSP's protection against injected/XSS inline scripts across every
 * Platform Admin page.
 */
describe('Platform Admin CSP allows the Cloudflare Web Analytics beacon', () => {
  it('adds the same narrow script-src/connect-src allowance apps/web already uses (HAB-320)', () => {
    expect(headers).toContain("script-src 'self' https://static.cloudflareinsights.com");
    expect(headers).toContain('https://cloudflareinsights.com');
  });

  it('does not weaken the CSP with unsafe-inline or unsafe-eval', () => {
    expect(headers).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(headers).not.toContain('unsafe-eval');
  });

  it('keeps every other existing directive intact', () => {
    expect(headers).toContain("default-src 'self'");
    expect(headers).toContain("style-src 'self' 'unsafe-inline'");
    expect(headers).toContain("img-src 'self' data:");
    expect(headers).toContain('https://kgsfaahixbcwcmykmhat.supabase.co');
    expect(headers).toContain('https://habitta-api-prod.aragondaniel91.workers.dev');
    expect(headers).toContain('https://habitta-api-dev.aragondaniel91.workers.dev');
    expect(headers).toContain("frame-ancestors 'none'");
    expect(headers).toContain("base-uri 'self'");
    expect(headers).toContain("form-action 'self'");
  });
});
