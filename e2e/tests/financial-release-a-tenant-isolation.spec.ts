import { expect, request as requestFactory, test, type APIRequestContext } from '@playwright/test';

// Exercise actual local Supabase Auth + Worker using the disposable financial E2E fixture.
// This file refuses a remote Worker/database and never uploads authenticated traces.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });
const required = ['E2E_SUPABASE_URL', 'E2E_SUPABASE_ANON_KEY', 'E2E_FIXTURE_PASSWORD'];
const missing = required.filter((key) => !process.env[key]);
const supabaseUrl = process.env.E2E_SUPABASE_URL ?? '';
const anonKey = process.env.E2E_SUPABASE_ANON_KEY ?? '';
const password = process.env.E2E_FIXTURE_PASSWORD ?? '';
const workerUrl = process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:8787';

if (supabaseUrl) {
  const url = new URL(supabaseUrl);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '54321') {
    throw new Error('Tenant isolation E2E requires disposable local Supabase');
  }
}
const workerTarget = new URL(workerUrl);
if (!['127.0.0.1', 'localhost'].includes(workerTarget.hostname) || workerTarget.port !== '8787') {
  throw new Error('Tenant isolation E2E requires local Worker at port 8787');
}

const ids = {
  a: '22222222-2222-4222-8222-222222222221',
  b: '22222222-2222-4222-8222-222222222222',
  unitA: '33333333-3333-4333-8333-333333333331',
  unitB: '33333333-3333-4333-8333-333333333333',
};
const emails = {
  a: 'habitta-e2e-admin@example.invalid',
  b: 'habitta-e2e-isolation@example.invalid',
  family: 'habitta-e2e-family@example.invalid',
};
type Unit = { id: string; code: string; condominium_id: string };
type Directory = { units: Array<{ id: string; condominiumId: string }> };
type Session = { context: APIRequestContext; token: string };

const openSession = async (email: string): Promise<Session> => {
  // Separate cookie jars and no inherited service-role/default client headers.
  const context = await requestFactory.newContext({ extraHTTPHeaders: {} });
  const auth = await context.post(supabaseUrl + '/auth/v1/token?grant_type=password', {
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    data: { email, password },
  });
  expect(auth.status(), 'The local fixture user must authenticate').toBe(200);
  const credentials = (await auth.json()) as { access_token?: string };
  expect(typeof credentials.access_token).toBe('string');
  expect(credentials.access_token?.length).toBeGreaterThan(30);
  return { context, token: credentials.access_token! };
};

const api = (
  session: Session,
  path: string,
  method = 'GET',
  data?: Record<string, unknown>,
) =>
  session.context.fetch(workerUrl + path, {
    method,
    headers: { Authorization: 'Bearer ' + session.token, 'Content-Type': 'application/json' },
    ...(data ? { data } : {}),
  });
const unitsPath = (c: string) => '/v1/condominiums/' + c + '/units';
const directoryPath = (c: string) => '/v1/condominiums/' + c + '/units-directory';
const unitPath = (c: string, u: string) => unitsPath(c) + '/' + u;
const requireOwnUnits = async (s: Session, condo: string, unitId: string) => {
  const response = await api(s, unitsPath(condo));
  expect(response.status()).toBe(200);
  const units = (await response.json()) as Unit[];
  expect(units.some((unit) => unit.id === unitId)).toBe(true);
  expect(units.every((unit) => unit.condominium_id === condo)).toBe(true);
  return units;
};
const assertOtherTenantInvisible = async (response: Awaited<ReturnType<typeof api>>, key: 'units' | 'list') => {
  // A deliberate RLS empty-result is 200; the API may also hide the target with 403/404.
  // Never accept 400/401/500/502: those could reflect invalid input or broken infrastructure.
  if (response.status() === 200) {
    if (key === 'units') {
      expect(await response.json()).toEqual([]);
    } else {
      expect((await response.json()) as Directory).toEqual({ units: [] });
    }
  } else {
    expect([403, 404]).toContain(response.status());
  }
};

test.describe('Release A - real authenticated tenant boundaries (isolated local)', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(!process.env.CI && missing.length > 0, 'Disposable local fixture not configured');
  test.beforeAll(() => {
    // Never let a mandatory CI security test report success because all cases were skipped.
    if (process.env.CI && missing.length > 0) {
      throw new Error('Mandatory authenticated tenant tests missing: ' + missing.join(', '));
    }
  });

  test('admin A and B: own directory visible; foreign directory hidden', async () => {
    const sessions = await Promise.all([openSession(emails.a), openSession(emails.b)]);
    try {
      const cases = [
        { me: sessions[0], own: ids.a, unit: ids.unitA, foreign: ids.b },
        { me: sessions[1], own: ids.b, unit: ids.unitB, foreign: ids.a },
      ];
      for (const item of cases) {
        const ownResponse = await api(item.me, directoryPath(item.own));
        expect(ownResponse.status()).toBe(200);
        const own = (await ownResponse.json()) as Directory;
        expect(own.units.some((unit) => unit.id === item.unit)).toBe(true);
        expect(own.units.every((unit) => unit.condominiumId === item.own)).toBe(true);
        const foreign = await api(item.me, directoryPath(item.foreign));
        await assertOtherTenantInvisible(foreign, 'list');
      }
    } finally {
      await Promise.all(sessions.map((s) => s.context.dispose()));
    }
  });

  test('admin A and B: raw units endpoint also isolates both directions', async () => {
    const sessions = await Promise.all([openSession(emails.a), openSession(emails.b)]);
    try {
      const cases = [
        { me: sessions[0], own: ids.a, unit: ids.unitA, foreign: ids.b },
        { me: sessions[1], own: ids.b, unit: ids.unitB, foreign: ids.a },
      ];
      for (const item of cases) {
        await requireOwnUnits(item.me, item.own, item.unit);
        await assertOtherTenantInvisible(await api(item.me, unitsPath(item.foreign)), 'units');
      }
    } finally {
      await Promise.all(sessions.map((s) => s.context.dispose()));
    }
  });

  test('authorized PATCH control, then foreign-IDOR and resident PATCH denied with no mutation', async () => {
    const sessions = await Promise.all([
      openSession(emails.a),
      openSession(emails.b),
      openSession(emails.family),
    ]);
    const [a, b, family] = sessions;
    const originalA = 'E2E-A101';
    const originalB = 'E2E-B201';
    let bWasChanged = false;
    try {
      const initialA = await requireOwnUnits(a, ids.a, ids.unitA);
      const initialB = await requireOwnUnits(b, ids.b, ids.unitB);
      expect(initialA.find((unit) => unit.id === ids.unitA)?.code).toBe(originalA);
      expect(initialB.find((unit) => unit.id === ids.unitB)?.code).toBe(originalB);

      // Positive control proves PATCH route, schema and caller-token permissions work.
      const authorized = await api(b, unitPath(ids.b, ids.unitB), 'PATCH', {
        code: 'E2E-B201-PATCH-CONTROL',
      });
      expect(authorized.status(), 'Owning admin PATCH must work as positive control').toBe(200);
      bWasChanged = true;
      const patched = await requireOwnUnits(b, ids.b, ids.unitB);
      expect(patched.find((unit) => unit.id === ids.unitB)?.code).toBe(
        'E2E-B201-PATCH-CONTROL',
      );

      const denied = [
        { actor: a, condo: ids.b, unit: ids.unitB }, // A targets B as if B were selected
        { actor: b, condo: ids.a, unit: ids.unitA }, // B targets A
        { actor: family, condo: ids.a, unit: ids.unitA }, // restricted resident
        { actor: a, condo: ids.a, unit: ids.unitB }, // IDOR mismatch: A scope, B unit
        { actor: b, condo: ids.b, unit: ids.unitA }, // IDOR mismatch: B scope, A unit
      ];
      for (const item of denied) {
        const response = await api(item.actor, unitPath(item.condo, item.unit), 'PATCH', {
          code: 'E2E-UNAUTHORIZED-CHANGE',
        });
        expect([403, 404], 'Unauthorized PATCH should not update any row').toContain(
          response.status(),
        );
      }
      const checkedA = await requireOwnUnits(a, ids.a, ids.unitA);
      const checkedB = await requireOwnUnits(b, ids.b, ids.unitB);
      expect(checkedA.find((unit) => unit.id === ids.unitA)?.code).toBe(originalA);
      expect(checkedB.find((unit) => unit.id === ids.unitB)?.code).toBe(
        'E2E-B201-PATCH-CONTROL',
      );
    } finally {
      if (bWasChanged) {
        const restored = await api(b, unitPath(ids.b, ids.unitB), 'PATCH', {
          code: originalB,
        });
        expect(restored.status(), 'Fixture must be restored after the test').toBe(200);
      }
      await Promise.all(sessions.map((s) => s.context.dispose()));
    }
    const aAfter = await openSession(emails.a);
    const bAfter = await openSession(emails.b);
    try {
      const aUnits = await requireOwnUnits(aAfter, ids.a, ids.unitA);
      const bUnits = await requireOwnUnits(bAfter, ids.b, ids.unitB);
      expect(aUnits.find((unit) => unit.id === ids.unitA)?.code).toBe(originalA);
      expect(bUnits.find((unit) => unit.id === ids.unitB)?.code).toBe(originalB);
    } finally {
      await aAfter.context.dispose();
      await bAfter.context.dispose();
    }
  });
});
