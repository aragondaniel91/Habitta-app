import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/index';
import type { NotificationBindings } from '../src/notifications/types';

const condominiumId = '0a5e90f2-1ff3-433c-abe1-55fab3e206c3';
const unitId = '11111111-1111-4111-8111-111111111111';
const userId = '00000000-0000-4000-8000-000000000001';

const environment = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
} as unknown as NotificationBindings;

const jsonResponse = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

afterEach(() => vi.unstubAllGlobals());

describe('physical structure routes', () => {
  it('creates an independent unit without requiring a tower, floor or ownership percentage', async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push([input, init]);
        const url = String(input);
        if (url.endsWith('/auth/v1/user')) return jsonResponse({ id: userId });
        if (url.endsWith('/rest/v1/units')) {
          return jsonResponse(
            [
              {
                id: unitId,
                condominium_id: condominiumId,
                building_id: null,
                code: 'Casa 1',
                type: 'house',
                floor: null,
                ownership_percentage: null,
                status: 'active',
              },
            ],
            201,
          );
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    const response = await app.request(
      `/v1/condominiums/${condominiumId}/units`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: 'Casa 1',
          buildingId: null,
          type: 'house',
          floor: null,
          ownershipPercentage: null,
          status: 'active',
        }),
      },
      environment,
    );

    expect(response.status).toBe(201);
    const [, unitRequest] = calls[1] ?? [];
    expect(JSON.parse(String(unitRequest?.body))).toEqual({
      condominium_id: condominiumId,
      building_id: null,
      code: 'Casa 1',
      type: 'house',
      floor: null,
      ownership_percentage: null,
      status: 'active',
      created_by: userId,
    });
  });

  it('edits and archives a unit only inside the selected condominium', async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push([input, init]);
        const url = String(input);
        if (url.endsWith('/auth/v1/user')) return jsonResponse({ id: userId });
        if (url.includes('/rest/v1/units?id=eq.')) {
          return jsonResponse([{ id: unitId, code: 'A-101', status: 'inactive' }]);
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    const response = await app.request(
      `/v1/condominiums/${condominiumId}/units/${unitId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          buildingId: null,
          code: 'A-101',
          floor: null,
          ownershipPercentage: null,
          status: 'inactive',
        }),
      },
      environment,
    );

    expect(response.status).toBe(200);
    const [unitInput, unitRequest] = calls[1] ?? [];
    expect(String(unitInput)).toContain(`id=eq.${unitId}`);
    expect(String(unitInput)).toContain(`condominium_id=eq.${condominiumId}`);
    expect(JSON.parse(String(unitRequest?.body))).toMatchObject({
      building_id: null,
      code: 'A-101',
      floor: null,
      ownership_percentage: null,
      status: 'inactive',
    });
  });
});
