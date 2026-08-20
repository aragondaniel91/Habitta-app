import { describe, expect, it, vi } from 'vitest';
import { app } from '../src/index';

const condominiumId = '11111111-1111-4111-8111-111111111111';
const personId = '22222222-2222-4222-8222-222222222222';
const unitId = '33333333-3333-4333-8333-333333333333';
const environment = {
  SUPABASE_URL: 'https://supabase.example.test',
  SUPABASE_ANON_KEY: 'anon-key',
} as never;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('communication responsibilities routes', () => {
  it('reads person and unit responsibilities through the caller-scoped REST API', async () => {
    const assignments = [{ id: 'assignment-id', person_id: personId, unit_id: unitId }];
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/auth/v1/user')) return json({ id: personId });
      if (url.includes('/rest/v1/people?')) return json([{ id: personId }]);
      if (url.includes('/rest/v1/units?')) return json([{ id: unitId }]);
      if (url.includes('/rest/v1/unit_communication_assignments?')) return json(assignments);
      throw new Error(`Unexpected request: ${url}`);
    });
    try {
      const [personResponse, unitResponse] = await Promise.all([
        app.request(
          `/v1/condominiums/${condominiumId}/people/${personId}/communication-responsibilities`,
          { headers: { Authorization: 'Bearer caller-token' } },
          environment,
        ),
        app.request(
          `/v1/condominiums/${condominiumId}/units/${unitId}/communication-responsibilities`,
          { headers: { Authorization: 'Bearer caller-token' } },
          environment,
        ),
      ]);
      expect(personResponse.status).toBe(200);
      expect(unitResponse.status).toBe(200);
      await expect(personResponse.json()).resolves.toEqual({ assignments });
      await expect(unitResponse.json()).resolves.toEqual({ assignments });
      const assignmentCall = fetchMock.mock.calls.find(([input]) =>
        String(input).includes('unit_communication_assignments?'),
      );
      expect(assignmentCall?.[1]).toMatchObject({
        headers: expect.objectContaining({
          apikey: 'anon-key',
          Authorization: 'Bearer caller-token',
        }),
      });
      expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('SERVICE_ROLE');
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('sends the primary responsibility payload only after person and unit are scoped', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/auth/v1/user')) return json({ id: personId });
      if (url.includes('/rest/v1/people?')) return json([{ id: personId }]);
      if (url.includes('/rest/v1/units?')) return json([{ id: unitId }]);
      if (url.includes('/rest/v1/rpc/set_unit_communication_assignment'))
        return json({ id: 'assignment-id', financial_role: 'primary' });
      throw new Error(`Unexpected request: ${url}`);
    });
    try {
      const response = await app.request(
        `/v1/condominiums/${condominiumId}/people/${personId}/communication-responsibilities/${unitId}`,
        {
          method: 'PATCH',
          headers: { Authorization: 'Bearer caller-token', 'Content-Type': 'application/json' },
          body: JSON.stringify({ financialRole: 'primary', generalRecipient: true }),
        },
        environment,
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        id: 'assignment-id',
        financial_role: 'primary',
      });
      const rpcCall = fetchMock.mock.calls.find(([input]) =>
        String(input).includes('set_unit_communication_assignment'),
      );
      expect(rpcCall?.[1]?.body).toBe(
        JSON.stringify({
          target_condominium: condominiumId,
          target_unit: unitId,
          target_person: personId,
          target_financial_role: 'primary',
          target_general_recipient: true,
        }),
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('uses caller auth and maps a primary-required RPC error safely', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/auth/v1/user')) return json({ id: personId });
      if (url.includes('/rest/v1/people?')) return json([{ id: personId }]);
      if (url.includes('/rest/v1/units?')) return json([{ id: unitId }]);
      if (url.includes('/rest/v1/rpc/set_unit_communication_assignment'))
        return json({ message: 'financial_primary_required', hint: 'private' }, 400);
      throw new Error(`Unexpected request: ${url}`);
    });
    try {
      const response = await app.request(
        `/v1/condominiums/${condominiumId}/people/${personId}/communication-responsibilities/${unitId}`,
        {
          method: 'PATCH',
          headers: { Authorization: 'Bearer caller-token', 'Content-Type': 'application/json' },
          body: JSON.stringify({ financialRole: 'additional', generalRecipient: false }),
        },
        environment,
      );
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({
        error: 'financial_primary_required',
        publicMessage:
          'Esta unidad necesita un responsable financiero principal antes de agregar otros destinatarios financieros.',
      });
      const rpcCall = fetchMock.mock.calls.find(([input]) =>
        String(input).includes('set_unit_communication_assignment'),
      );
      expect(rpcCall?.[1]).toMatchObject({
        headers: expect.objectContaining({
          apikey: 'anon-key',
          Authorization: 'Bearer caller-token',
        }),
      });
      expect(JSON.stringify(rpcCall)).not.toContain('SERVICE_ROLE');
    } finally {
      fetchMock.mockRestore();
    }
  });
});
