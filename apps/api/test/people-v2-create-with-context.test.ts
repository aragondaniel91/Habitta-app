import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/index';
import type { NotificationBindings } from '../src/notifications/types';

const condominiumId = '23520000-0000-0000-0000-000000000001';
const unitId = '23530000-0000-0000-0000-000000000001';
const environment = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
} as unknown as NotificationBindings;

afterEach(() => vi.unstubAllGlobals());

function authenticatedUser() {
  return Response.json({ id: '23500000-0000-0000-0000-000000000001' });
}

function request(body: object) {
  return app.request(
    `/v1/condominiums/${condominiumId}/people/create-with-context`,
    {
      method: 'POST',
      headers: { Authorization: 'Bearer caller-token', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    environment,
  );
}

const person = { firstName: 'Ana', lastName: 'Pérez', email: 'ana@235.test' };

describe('People V2 atomic create route', () => {
  it.each([
    ['person only', { person }],
    [
      'person only with communication no-op',
      { person, communication: { financialRole: 'none', generalRecipient: false } },
    ],
    ['owner', { person, initialRelationship: { kind: 'owner', unitId, ownershipPercentage: 100 } }],
    [
      'owner occupant',
      { person, initialRelationship: { kind: 'owner_occupant', unitId, ownershipPercentage: 100 } },
    ],
    ['tenant', { person, initialRelationship: { kind: 'tenant', unitId } }],
    ['board member', { person, initialRelationship: { kind: 'board_member', title: 'Vocal' } }],
    [
      'primary communication',
      {
        person,
        initialRelationship: { kind: 'owner', unitId },
        communication: { financialRole: 'primary', generalRecipient: true },
      },
    ],
  ])('creates %s through the single atomic RPC', async (_label, body) => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/auth/v1/user')) return authenticatedUser();
      expect(String(input)).toBe(
        'https://example.supabase.co/rest/v1/rpc/create_person_with_initial_context',
      );
      expect(init?.method).toBe('POST');
      expect(new Headers(init?.headers).get('apikey')).toBe('anon-key');
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer caller-token');
      expect(new Headers(init?.headers).get('Authorization')).not.toContain('service_role');
      return Response.json({ id: 'person-235', first_name: 'Ana', last_name: 'Pérez' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await request(body);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      id: 'person-235',
      first_name: 'Ana',
      last_name: 'Pérez',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      'additional without primary',
      { message: 'financial_primary_required' },
      {
        person,
        initialRelationship: { kind: 'tenant', unitId },
        communication: { financialRole: 'additional', generalRecipient: false },
      },
      409,
    ],
    [
      'meaningful communication without unit',
      { message: 'communication_unit_required' },
      { person, communication: { financialRole: 'primary', generalRecipient: false } },
      409,
    ],
    [
      'cross tenant unit',
      { message: 'initial_relationship_unit_not_found' },
      { person, initialRelationship: { kind: 'owner', unitId } },
      404,
    ],
    ['raw database error', { message: 'sensitive internal detail' }, { person }, 400],
  ])('returns a bounded public error for %s', async (_label, rpcError, body, expectedStatus) => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/auth/v1/user')) return authenticatedUser();
      return Response.json(rpcError, { status: 400 });
    });

    const response = await request(body);

    expect(response.status).toBe(expectedStatus);
    const payload = (await response.json()) as { error: string; publicMessage?: string };
    expect(payload.error).not.toContain('sensitive internal detail');
    if (rpcError.message === 'communication_unit_required')
      expect(payload.publicMessage).toContain('Selecciona una unidad');
  });

  it('rejects malformed bodies and invalid ownership percentages before calling Supabase', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/auth/v1/user')) return authenticatedUser();
      throw new Error('RPC must not be called for invalid input');
    });
    vi.stubGlobal('fetch', fetchMock);

    const malformed = await request({ person: { firstName: '', lastName: 'Pérez' } });
    const invalidPercentage = await request({
      person,
      initialRelationship: { kind: 'owner', unitId, ownershipPercentage: 101 },
    });

    expect(malformed.status).toBe(400);
    expect(invalidPercentage.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
