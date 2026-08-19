import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { app } from '../src/index';

const condominiumA = '11111111-1111-4111-8111-111111111111';
const condominiumB = '22222222-2222-4222-8222-222222222222';
const unitA = '33333333-3333-4333-8333-333333333333';
const unitB = '44444444-4444-4444-8444-444444444444';
const personA = '55555555-5555-4555-8555-555555555555';
const personB = '66666666-6666-4666-8666-666666666666';
const environment = {
  SUPABASE_URL: 'https://supabase.example.test',
  SUPABASE_ANON_KEY: 'anon-key',
} as never;

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const unit = (id: string, condominiumId: string, buildingName: string) => ({
  id,
  condominium_id: condominiumId,
  building_id: '99999999-9999-4999-8999-999999999999',
  code: id === unitA ? 'A-101' : 'B-202',
  type: 'apartment',
  floor: '1',
  ownership_percentage: 100,
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  buildings: { id: '99999999-9999-4999-8999-999999999999', name: buildingName },
});

const owner = {
  id: '77777777-7777-4777-8777-777777777777',
  unit_id: unitA,
  ownership_percentage: 100,
  is_primary_contact: true,
  starts_at: '2026-01-01',
  ends_at: null,
  people: { id: personA, first_name: 'Ana', last_name: 'Pérez' },
};
const occupancy = {
  id: '88888888-8888-4888-8888-888888888888',
  unit_id: unitA,
  occupancy_type: 'owner_occupant',
  is_primary_contact: true,
  starts_at: '2026-01-01',
  ends_at: null,
  people: { id: personA, first_name: 'Ana', last_name: 'Pérez' },
};

const withDirectoryResponses = (failure = false) => {
  const requests: string[] = [];
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    requests.push(url);
    if (url.includes('/auth/v1/user')) return json({ id: personA });
    if (url.includes('/rest/v1/units?')) return json([unit(unitA, condominiumA, 'Torre A')]);
    if (url.includes('/rest/v1/unit_owners?'))
      return json(failure ? { error: 'denied' } : [owner], failure ? 403 : 200);
    return json([occupancy]);
  });
  return { fetchMock, requests };
};

describe('units directory aggregate', () => {
  it('keeps the existing bearer authentication middleware', async () => {
    const response = await app.request(
      `/v1/condominiums/${condominiumA}/units-directory`,
      {},
      environment,
    );
    expect(response.status).toBe(401);
  });

  it('returns a camelCase active directory in three bounded caller-scoped queries', async () => {
    const { fetchMock, requests } = withDirectoryResponses();
    try {
      const response = await app.request(
        `/v1/condominiums/${condominiumA}/units-directory`,
        { headers: { Authorization: 'Bearer caller-token' } },
        environment,
      );
      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload).toEqual({
        units: [
          expect.objectContaining({
            id: unitA,
            condominiumId: condominiumA,
            building: { id: '99999999-9999-4999-8999-999999999999', name: 'Torre A' },
            owners: [expect.objectContaining({ personId: personA, firstName: 'Ana' })],
            occupancies: [
              expect.objectContaining({ personId: personA, occupancyType: 'owner_occupant' }),
            ],
          }),
        ],
      });
      const serialized = JSON.stringify(payload);
      expect(serialized).not.toContain('admin_note');
      expect(serialized).not.toContain('adminNotes');
      expect(serialized).not.toContain('invitation');
      expect(serialized).not.toContain('token');
      expect(serialized).not.toContain('secret');
      const restRequests = requests.filter((url) => url.includes('/rest/v1/'));
      expect(restRequests).toHaveLength(3);
      expect(
        restRequests.some((url) => url.includes(`units?condominium_id=eq.${condominiumA}`)),
      ).toBe(true);
      expect(
        restRequests.filter((url) =>
          url.includes(`units!inner(condominium_id=eq.${condominiumA})`),
        ),
      ).toHaveLength(2);
      expect(restRequests.join('\n')).not.toContain(condominiumB);
      expect(restRequests.join('\n')).not.toContain(unitB);
      expect(restRequests.join('\n')).not.toContain(personB);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('fails closed instead of serializing a partial directory', async () => {
    const { fetchMock } = withDirectoryResponses(true);
    try {
      const response = await app.request(
        `/v1/condominiums/${condominiumA}/units-directory`,
        { headers: { Authorization: 'Bearer caller-token' } },
        environment,
      );
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ error: 'Units directory is unavailable' });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('requires active, tenant-scoped joins and does not request private fields', async () => {
    const source = await readFile(
      new URL('../src/units-directory-routes.ts', import.meta.url),
      'utf8',
    );
    expect(source).toContain("uuidSchema.parse(c.req.param('id'))");
    expect(source.match(/ends_at=is.null/g)).toHaveLength(2);
    expect(source.match(/units!inner\(condominium_id=eq\.\$\{condominiumId\}\)/g)).toHaveLength(2);
    expect(source).toContain('SUPABASE_ANON_KEY');
    expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(source).not.toContain('admin_note');
    expect(source).not.toContain('invitation');
    expect(source).not.toContain('secret');
  });
});
