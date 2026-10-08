import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/index';
import type { NotificationBindings } from '../src/notifications/types';

const condominiumId = '0a5e90f2-1ff3-433c-abe1-55fab3e206c3';
const personId = '8dcc9bf7-30d1-4131-a94c-374e61e9312d';
const unitId = '22d68987-bf35-4fd6-a900-07fd4eca0b35';
const assignmentId = 'e19b2393-b229-40f6-b620-5f27df17b0aa';

const environment = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
} as unknown as NotificationBindings;

afterEach(() => vi.unstubAllGlobals());

function authenticatedUser() {
  return new Response(JSON.stringify({ id: '00000000-0000-0000-0000-000000000001' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('person-centric relationships', () => {
  it('loads a complete person relationship view with a fixed number of backend reads', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/v1/user')) return authenticatedUser();
      if (url.includes('/rest/v1/people?'))
        return Response.json([
          { id: personId, first_name: 'Ana', last_name: 'Pérez', condominium_id: condominiumId },
        ]);
      if (url.includes('/rest/v1/unit_owners?'))
        return Response.json([
          {
            id: 'e19b2393-b229-40f6-b620-5f27df17b0aa',
            person_id: personId,
            unit_id: unitId,
            starts_at: '2026-01-01',
            ends_at: null,
            units: {
              id: unitId,
              code: 'A-12',
              condominium_id: condominiumId,
              buildings: { id: '35acfcb5-5545-41f4-87ec-19ca0ec27f46', name: 'Torre Este' },
            },
          },
        ]);
      if (url.includes('/rest/v1/unit_occupancies?')) return Response.json([]);
      if (url.includes('/rest/v1/condominium_person_relationships?'))
        return Response.json([
          {
            id: '91b86fc0-e27b-4eb4-92ea-03a8a9a490c0',
            person_id: personId,
            relationship_type: 'board_member',
            title: 'Presidenta',
            starts_at: '2026-01-01',
            ends_at: null,
          },
        ]);
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await app.request(
      `/v1/condominiums/${condominiumId}/people/${personId}/relationships`,
      { headers: { Authorization: 'Bearer test-token' } },
      environment,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      person: { id: personId, first_name: 'Ana' },
      ownerships: [{ unit_id: unitId, units: { code: 'A-12', buildings: { name: 'Torre Este' } } }],
      occupancies: [],
      condominiumRelationships: [{ relationship_type: 'board_member', title: 'Presidenta' }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes(`unit_owners?person_id=eq.${personId}`))).toBe(true);
    expect(urls.some((url) => url.includes(`units.condominium_id=eq.${condominiumId}`))).toBe(true);
  });

  it('rejects a person-centric ownership before insert when the unit is outside the URL condominium', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/v1/user')) return authenticatedUser();
      if (url.includes('/rest/v1/people?')) return Response.json([{ id: personId }]);
      if (url.includes('/rest/v1/units?')) return Response.json([]);
      if (init?.method === 'POST' && url.endsWith('/rest/v1/unit_owners'))
        throw new Error('unit_owners insert must not happen');
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await app.request(
      `/v1/condominiums/${condominiumId}/people/${personId}/ownerships`,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitId, isPrimaryContact: true }),
      },
      environment,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'Person or unit not found in condominium',
    });
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith('/rest/v1/unit_owners') &&
          (init as RequestInit | undefined)?.method === 'POST',
      ),
    ).toBe(false);
  });

  it('routes unit attribute edits through audited correction RPCs instead of a lifecycle close', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/v1/user')) return authenticatedUser();
      if (url.includes('/rest/v1/unit_owners?'))
        return Response.json([
          { unit_id: unitId, starts_at: '2026-01-01', units: { condominium_id: condominiumId } },
        ]);
      if (url.includes('/rest/v1/unit_occupancies?'))
        return Response.json([
          { unit_id: unitId, starts_at: '2026-01-01', units: { condominium_id: condominiumId } },
        ]);
      if (url.endsWith('/rest/v1/rpc/correct_unit_owner_percentage'))
        return Response.json({ id: assignmentId, ownership_percentage: 60 });
      if (url.endsWith('/rest/v1/rpc/correct_unit_occupancy_type'))
        return Response.json({ id: assignmentId, occupancy_type: 'tenant' });
      throw new Error(`Unexpected request: ${url} (${init?.method})`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await app.request(
      `/v1/condominiums/${condominiumId}/unit-owners/${assignmentId}`,
      {
        method: 'PATCH',
        headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownershipPercentage: 60 }),
      },
      environment,
    );

    expect(response.status).toBe(200);
    const correction = fetchMock.mock.calls.find(([input]) =>
      String(input).endsWith('/rest/v1/rpc/correct_unit_owner_percentage'),
    );
    expect(correction?.[1]).toMatchObject({ method: 'POST' });
    expect(JSON.parse(String((correction?.[1] as RequestInit).body))).toEqual({
      target: condominiumId,
      target_assignment: assignmentId,
      next_percentage: 60,
    });

    const occupancyResponse = await app.request(
      `/v1/condominiums/${condominiumId}/unit-occupancies/${assignmentId}`,
      {
        method: 'PATCH',
        headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ occupancyType: 'tenant' }),
      },
      environment,
    );

    expect(occupancyResponse.status).toBe(200);
    const occupancyCorrection = fetchMock.mock.calls.find(([input]) =>
      String(input).endsWith('/rest/v1/rpc/correct_unit_occupancy_type'),
    );
    expect(JSON.parse(String((occupancyCorrection?.[1] as RequestInit).body))).toEqual({
      target: condominiumId,
      target_assignment: assignmentId,
      next_type: 'tenant',
    });
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('ends_at'))).toBe(false);
  });

  it('routes a community role edit through its audited correction RPC', async () => {
    const relationshipId = '91b86fc0-e27b-4eb4-92ea-03a8a9a490c0';
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/v1/user')) return authenticatedUser();
      if (url.includes('/rest/v1/condominium_person_relationships?'))
        return Response.json([{ id: relationshipId }]);
      if (url.endsWith('/rest/v1/rpc/correct_community_person_relationship'))
        return Response.json({
          id: relationshipId,
          relationship_type: 'representative',
          title: 'Vocal',
        });
      throw new Error(`Unexpected request: ${url} (${init?.method})`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await app.request(
      `/v1/condominiums/${condominiumId}/people/${personId}/condominium-relationships/${relationshipId}`,
      {
        method: 'PATCH',
        headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ relationshipType: 'representative', title: 'Vocal' }),
      },
      environment,
    );

    expect(response.status).toBe(200);
    const correction = fetchMock.mock.calls.find(([input]) =>
      String(input).endsWith('/rest/v1/rpc/correct_community_person_relationship'),
    );
    expect(correction?.[1]).toMatchObject({ method: 'POST' });
    expect(JSON.parse(String((correction?.[1] as RequestInit).body))).toEqual({
      target: condominiumId,
      target_relationship: relationshipId,
      next_type: 'representative',
      next_title: 'Vocal',
    });
  });

  it('returns actionable relationship-management copy when a share would preserve an invalid owner total', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/v1/user')) return authenticatedUser();
      if (url.includes('/rest/v1/unit_owners?'))
        return Response.json([
          { unit_id: unitId, starts_at: '2026-01-01', units: { condominium_id: condominiumId } },
        ]);
      if (url.endsWith('/rest/v1/rpc/correct_unit_owner_percentage'))
        return Response.json(
          {
            message:
              'unit ownership percentage total above 100 must be strictly reduced for unit x',
          },
          { status: 400 },
        );
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await app.request(
      `/v1/condominiums/${condominiumId}/unit-owners/${assignmentId}`,
      {
        method: 'PATCH',
        headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownershipPercentage: 60 }),
      },
      environment,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error:
        'Los porcentajes conocidos de propiedad de esta unidad superan 100%. Corrige una relación existente reduciendo su porcentaje antes de aumentar o agregar otra.',
    });
  });

  it('does not correct a community role through a mismatched person URL', async () => {
    const relationshipId = '91b86fc0-e27b-4eb4-92ea-03a8a9a490c0';
    const otherPersonId = '85a506c1-6d41-4a5b-bb7b-92f3a43f72a1';
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/v1/user')) return authenticatedUser();
      if (url.includes('/rest/v1/condominium_person_relationships?')) return Response.json([]);
      if (url.endsWith('/rest/v1/rpc/correct_community_person_relationship'))
        throw new Error('correction RPC must not be invoked for another person');
      throw new Error(`Unexpected request: ${url} (${init?.method})`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await app.request(
      `/v1/condominiums/${condominiumId}/people/${otherPersonId}/condominium-relationships/${relationshipId}`,
      {
        method: 'PATCH',
        headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ relationshipType: 'representative', title: 'Vocal' }),
      },
      environment,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Relationship not found' });
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/rpc/'))).toBe(false);
  });
});
