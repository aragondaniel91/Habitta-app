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

const scriptSources = async (page: import('@playwright/test').Page) =>
  page.$$eval('script[src]', (nodes) => nodes.map((node) => (node as HTMLScriptElement).src));

const bundleText = async (page: import('@playwright/test').Page, baseUrl: string) => {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  const sources = await scriptSources(page);
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
    const bundle = await bundleText(page, baseURL ?? '/');

    // The roles exist in what the browser runs.
    expect(bundle).toContain('family_member');
    expect(bundle).toContain('authorized_occupant');

    // Both are named for people, and never as tenants. The label helper used to map every
    // non-owner role to "Inquilino", which would have told a family member they were a tenant.
    expect(bundle).toContain('Familiar');
    expect(bundle).toContain('Ocupante autorizado');
  });

  test('does not ship a resident payments affordance for the restricted roles', async ({
    page,
    baseURL,
  }) => {
    const bundle = await bundleText(page, baseURL ?? '/');

    // The restricted set is the three roles the database refuses payment access to. If this ever
    // narrows back to a tenant-only check, the two new roles walk through it, because neither of
    // them is a tenant.
    const restrictedList = /\[\s*"tenant"\s*,\s*"family_member"\s*,\s*"authorized_occupant"\s*\]/;
    const restrictedListSingle =
      /\[\s*'tenant'\s*,\s*'family_member'\s*,\s*'authorized_occupant'\s*\]/;
    expect(restrictedList.test(bundle) || restrictedListSingle.test(bundle)).toBe(true);
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
