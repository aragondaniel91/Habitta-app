import { expect, test, type APIRequestContext } from '@playwright/test';

// Executes against the existing disposable financial fixture: two condominiums and real
// Supabase Auth sessions, behind the local Worker. Never run against a remote project.
const required = ['E2E_SUPABASE_URL', 'E2E_SUPABASE_ANON_KEY', 'E2E_FIXTURE_PASSWORD'];
const missing = required.filter((key) => !process.env[key]);
const supabaseUrl = process.env.E2E_SUPABASE_URL ?? '';
const anonKey = process.env.E2E_SUPABASE_ANON_KEY ?? '';
const password = process.env.E2E_FIXTURE_PASSWORD ?? '';
const workerUrl = process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:8787';

if (supabaseUrl) {
  const url = new URL(supabaseUrl);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '54321') {
    throw new Error('Authenticated tenant isolation E2E requires disposable local Supabase');
  }
}
if (!['127.0.0.1', 'localhost'].includes(new URL(workerUrl).hostname)) {
  throw new Error('Authenticated tenant isolation E2E requires a local Worker');
}

const ids = {
  condominiumA: '22222222-2222-4222-8222-222222222221',
  condominiumB: '22222222-2222-4222-8222-222222222222',
  unitA: '33333333-3333-4333-8333-333333333331',
  unitB: '33333333-3333-4333-8333-333333333333',
};
const email = {
  adminA: 'habitta-e2e-admin@example.invalid',
  adminB: 'habitta-e2e-isolation@example.invalid',
  familyA: 'habitta-e2e-family@example.invalid',
};

type Unit = { id: string; code: string; condominium_id: string };
type Directory = { units: Array<{ id: string; code: string; condominiumId: string }> };

const authenticate = async (request: APIRequestContext, address: string) => {
  const response = await request.post(supabaseUrl + '/auth/v1/token?grant_type=password', {
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    data: { email: address, password },
  });
  expect(response.status(), 'Local fixture user must authenticate').toBe(200);
  return ((await response.json()) as { access_token: string }).access_token;
};

const callWorker = (
  request: APIRequestContext,
  token: string,
  path: string,
  options: { method?: string; data?: Record<string, unknown> } = {},
) =>
  request.fetch(workerUrl + path, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    ...(options.data ? { data: options.data } : {}),
  });

const unitsPath = (condominiumId: string) => '/v1/condominiums/' + condominiumId + '/units';
const directoryPath = (condominiumId: string) =>
  '/v1/condominiums/' + condominiumId + '/units-directory';

test.describe('Release A: authenticated tenant isolation through real local Worker + Supabase', () => {
  test.skip(missing.length > 0, 'Disposable local Supabase fixture required: ' + missing.join(', '));

  test('administrators can read their own directory but not the other condominium directory', async ({
    request,
  }) => {
    const adminA = await authenticate(request, email.adminA);
    const adminB = await authenticate(request, email.adminB);

    for (const [token, ownCondo, ownUnit, foreignCondo, foreignUnit] of [
      [adminA, ids.condominiumA, ids.unitA, ids.condominiumB, ids.unitB],
      [adminB, ids.condominiumB, ids.unitB, ids.condominiumA, ids.unitA],
    ]) {
      const own = await callWorker(request, token, directoryPath(ownCondo));
      expect(own.status(), 'Owner should be able to read their condominium directory').toBe(200);
      const ownData = (await own.json()) as Directory;
      expect(ownData.units.some((unit) => unit.id === ownUnit)).toBe(true);
      expect(ownData.units.some((unit) => unit.id === foreignUnit)).toBe(false);

      const foreign = await callWorker(request, token, directoryPath(foreignCondo));
      if (foreign.ok()) {
        const foreignData = (await foreign.json()) as Directory;
        expect(foreignData.units, 'Cross-condominium directory must never disclose rows').toEqual([]);
      } else {
        expect([401, 403, 404, 502]).toContain(foreign.status());
      }
    }
  });

  test('authenticated unit list cannot reveal a foreign condominium', async ({ request }) => {
    const adminA = await authenticate(request, email.adminA);
    const adminB = await authenticate(request, email.adminB);
    for (const [token, ownCondo, ownUnit, foreignCondo, foreignUnit] of [
      [adminA, ids.condominiumA, ids.unitA, ids.condominiumB, ids.unitB],
      [adminB, ids.condominiumB, ids.unitB, ids.condominiumA, ids.unitA],
    ]) {
      const own = await callWorker(request, token, unitsPath(ownCondo));
      expect(own.status()).toBe(200);
      const ownUnits = (await own.json()) as Unit[];
      expect(ownUnits.some((unit) => unit.id === ownUnit)).toBe(true);

      const foreign = await callWorker(request, token, unitsPath(foreignCondo));
      if (foreign.ok()) {
        expect(await foreign.json()).toEqual([]);
      } else {
        expect([400, 401, 403, 404]).toContain(foreign.status());
      }
      expect(ownUnits.some((unit) => unit.id === foreignUnit)).toBe(false);
    }
  });

  test('foreign admin and restricted resident cannot mutate another unit', async ({ request }) => {
    const adminA = await authenticate(request, email.adminA);
    const adminB = await authenticate(request, email.adminB);
    const familyA = await authenticate(request, email.familyA);

    const initialA = await callWorker(request, adminA, unitsPath(ids.condominiumA));
    const initialB = await callWorker(request, adminB, unitsPath(ids.condominiumB));
    expect(initialA.status()).toBe(200);
    expect(initialB.status()).toBe(200);
    const codeA = ((await initialA.json()) as Unit[]).find((row) => row.id === ids.unitA)?.code;
    const codeB = ((await initialB.json()) as Unit[]).find((row) => row.id === ids.unitB)?.code;
    expect(codeA).toBe('E2E-A101');
    expect(codeB).toBe('E2E-B201');

    for (const [token, condominiumId, unitId] of [
      [adminA, ids.condominiumB, ids.unitB],
      [adminB, ids.condominiumA, ids.unitA],
      [familyA, ids.condominiumA, ids.unitA],
    ]) {
      const rejected = await callWorker(
        request,
        token,
        unitsPath(condominiumId) + '/' + unitId,
        { method: 'PATCH', data: { code: 'E2E-UNAUTHORIZED-CHANGE' } },
      );
      expect([400, 401, 403, 404], 'Unauthorized unit mutation must not succeed').toContain(
        rejected.status(),
      );
    }

    const finalA = await callWorker(request, adminA, unitsPath(ids.condominiumA));
    const finalB = await callWorker(request, adminB, unitsPath(ids.condominiumB));
    expect(finalA.status()).toBe(200);
    expect(finalB.status()).toBe(200);
    expect(((await finalA.json()) as Unit[]).find((row) => row.id === ids.unitA)?.code).toBe(codeA);
    expect(((await finalB.json()) as Unit[]).find((row) => row.id === ids.unitB)?.code).toBe(codeB);
  });
});
