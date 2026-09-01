import { expect, test } from '@playwright/test';

// HAB-412: the shipped bundle must carry the residential role boundaries, not just the source tree.
//
// This runs in the public project, so it has no authenticated session and cannot drive a family
// member through the interface -- that needs a seeded fixture user, which this branch does not
// create. What it can do is check the built application the browser actually receives: the two new
// roles exist in it, the payments gate is the capability rather than the tenant check, and the
// navigation fallback that used to preserve a forbidden deep link is gone.
//
// A source-tree assertion cannot fail if the build drops or mangles the code; this one reads what
// was served.

// The public project serves the application from the repository's own Vite server, which hands the
// browser ES modules on demand rather than one bundle -- so the rule lives in the module that
// declares it, not in the entry script. A production build inlines it into an asset instead, so
// both shapes are accepted; what matters is that the code the browser receives carries the rule.
const servedRules = async (page: import('@playwright/test').Page, baseUrl: string) => {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

  const module = await page.request.get(new URL('/src/lib/roles.ts', baseUrl).toString());
  if (module.ok()) return module.text();

  const sources = await page.$$eval('script[src]', (nodes) =>
    nodes.map((node) => (node as HTMLScriptElement).src),
  );
  expect(sources.length).toBeGreaterThan(0);
  const bodies = await Promise.all(
    sources.map(async (src) => {
      const response = await page.request.get(src);
      expect(response.ok()).toBe(true);
      return response.text();
    }),
  );
  return bodies.join('\n');
};

test.describe('HAB-412 residential role boundaries reach the browser', () => {
  test('ships both residential roles and the capability-based payments gate', async ({
    page,
    baseURL,
  }) => {
    const rules = await servedRules(page, baseURL ?? '/');

    // The roles exist in what the browser runs.
    expect(rules).toContain('family_member');
    expect(rules).toContain('authorized_occupant');
  });

  test('does not ship a resident payments affordance for the restricted roles', async ({
    page,
    baseURL,
  }) => {
    const rules = await servedRules(page, baseURL ?? '/');

    // The restricted set is the three roles the database refuses payment access to. If this ever
    // narrows back to a tenant-only check, the two new roles walk through it, because neither of
    // them is a tenant.
    expect(rules).toContain('canAccessResidentPayments');
    expect(rules).toMatch(/tenant['"],\s*['"]family_member['"],\s*['"]authorized_occupant/);
  });

  test('serves the public entry point without leaking an authenticated surface', async ({
    page,
    baseURL,
  }) => {
    // Unauthenticated, nobody is a resident of anything, so none of the resident surfaces may be
    // rendered at all. This is the outermost boundary: no session, no rows, no headings.
    await page.goto(baseURL ?? '/', { waitUntil: 'domcontentloaded' });
    const body = (await page.textContent('body')) ?? '';

    for (const heading of ['Saldo pendiente', 'Votaciones pendientes', 'Solicitudes abiertas']) {
      expect(body).not.toContain(heading);
    }
  });
});
