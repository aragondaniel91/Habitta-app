import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const headers = readFileSync(new URL('../../platform-admin/_headers', import.meta.url), 'utf8');
const onboardingScript = readFileSync(
  new URL('../../platform-admin/onboarding.js', import.meta.url),
  'utf8',
);

/*
 * HAB-484 wired the customer-invitation queue (list/create/revoke) straight to the Worker API via
 * workerRequest(), but apps/platform-admin/_headers was never updated to allow that origin in
 * connect-src. The browser silently blocked every call ("Failed to fetch"), so the entire
 * onboarding queue — including the HAB-486 blocker/next-action rendering — was inert in production
 * from the moment HAB-484 shipped. Lock the CSP to the exact Worker origins onboarding.js's
 * apiBaseUrl() resolves to, so this class of regression fails CI instead of shipping silently.
 */
describe('HAB-486 Platform Admin onboarding CSP allows the Worker API it depends on', () => {
  it('keeps a strict connect-src while allowing the production and preview Worker origins', () => {
    expect(headers).toContain("connect-src 'self'");
    expect(headers).toContain('https://kgsfaahixbcwcmykmhat.supabase.co');
    expect(headers).toContain('https://habitta-api-prod.aragondaniel91.workers.dev');
    expect(headers).toContain('https://habitta-api-dev.aragondaniel91.workers.dev');
  });

  it('matches every Worker origin onboarding.js can resolve at runtime', () => {
    const cspLine = headers.split('\n').find((line) => line.includes('Content-Security-Policy'));
    expect(cspLine).toBeDefined();

    const resolvableOrigins = [...onboardingScript.matchAll(/return\s+'(https:\/\/[^']+)'/g)]
      .map((match) => match[1])
      .filter((origin): origin is string => Boolean(origin));
    expect(resolvableOrigins).toEqual(
      expect.arrayContaining([
        'https://habitta-api-prod.aragondaniel91.workers.dev',
        'https://habitta-api-dev.aragondaniel91.workers.dev',
      ]),
    );
    for (const origin of resolvableOrigins) {
      if (origin.includes('workers.dev')) {
        expect(cspLine).toContain(origin);
      }
    }
  });
});
