import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/index';
import type { NotificationBindings } from '../src/notifications/types';

const condominiumId = '0a5e90f2-1ff3-433c-abe1-55fab3e206c3';
const personId = '8dcc9bf7-30d1-4131-a94c-374e61e9312d';
const userId = '00000000-0000-0000-0000-000000000001';

const environment = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
} as unknown as NotificationBindings;

afterEach(() => vi.unstubAllGlobals());

function authenticatedUser() {
  return Response.json({ id: userId });
}

function noteRevision(action: 'saved' | 'cleared' = 'saved') {
  return {
    id: 7,
    action,
    content: action === 'saved' ? 'Nota privada de administración' : null,
    created_by: userId,
    created_at: '2026-08-18T00:05:00.000Z',
  };
}

describe('HAB-217 private person notes API', () => {
  it('returns no note data to a caller that can read People but cannot manage People', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/v1/user')) return authenticatedUser();
      if (url.endsWith('/rest/v1/rpc/can_manage_people')) return Response.json(false);
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await app.request(
      `/v1/condominiums/${condominiumId}/people/${personId}/admin-notes`,
      { headers: { Authorization: 'Bearer test-token' } },
      environment,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ authorized: false, revisions: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('lists only condominium-and-person scoped revisions for an authorized manager', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/v1/user')) return authenticatedUser();
      if (url.endsWith('/rest/v1/rpc/can_manage_people')) return Response.json(true);
      if (url.includes('/rest/v1/people?')) return Response.json([{ id: personId }]);
      if (url.includes('/rest/v1/person_admin_note_revisions?'))
        return Response.json([noteRevision()]);
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await app.request(
      `/v1/condominiums/${condominiumId}/people/${personId}/admin-notes`,
      { headers: { Authorization: 'Bearer test-token' } },
      environment,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      authorized: true,
      revisions: [noteRevision()],
    });
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(
      urls.some(
        (url) =>
          url.includes(`condominium_id=eq.${condominiumId}`) &&
          url.includes(`person_id=eq.${personId}`) &&
          url.includes('order=id.desc'),
      ),
    ).toBe(true);
  });

  it('persists the URL tenant/person and authenticated author instead of trusting client identity', async () => {
    let insertedBody: Record<string, unknown> | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/v1/user')) return authenticatedUser();
      if (url.endsWith('/rest/v1/rpc/can_manage_people')) return Response.json(true);
      if (url.includes('/rest/v1/people?')) return Response.json([{ id: personId }]);
      if (url.endsWith('/rest/v1/person_admin_note_revisions') && init?.method === 'POST') {
        insertedBody = JSON.parse(String(init.body)) as Record<string, unknown>;
        return Response.json([noteRevision()], { status: 201 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await app.request(
      `/v1/condominiums/${condominiumId}/people/${personId}/admin-notes`,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: '  Nota privada de administración  ',
          condominium_id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
          created_by: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
        }),
      },
      environment,
    );

    expect(response.status).toBe(201);
    expect(insertedBody).toEqual({
      condominium_id: condominiumId,
      person_id: personId,
      action: 'saved',
      content: 'Nota privada de administración',
      created_by: userId,
    });
  });

  it('clears by appending a tombstone only when a saved note is currently active', async () => {
    const postedBodies: Record<string, unknown>[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/v1/user')) return authenticatedUser();
      if (url.endsWith('/rest/v1/rpc/can_manage_people')) return Response.json(true);
      if (url.includes('/rest/v1/people?')) return Response.json([{ id: personId }]);
      if (url.includes('/rest/v1/person_admin_note_revisions?'))
        return Response.json([noteRevision()]);
      if (url.endsWith('/rest/v1/person_admin_note_revisions') && init?.method === 'POST') {
        postedBodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return Response.json([noteRevision('cleared')], { status: 201 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await app.request(
      `/v1/condominiums/${condominiumId}/people/${personId}/admin-notes/clear`,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
      },
      environment,
    );

    expect(response.status).toBe(201);
    expect(postedBodies).toEqual([
      {
        condominium_id: condominiumId,
        person_id: personId,
        action: 'cleared',
        content: null,
        created_by: userId,
      },
    ]);
  });
});
