import { describe, expect, it, vi, afterEach } from 'vitest';
import { app } from '../src/index';
import type { NotificationBindings } from '../src/notifications/types';

// HAB-412: the resident invitation route has to carry the two new residential roles end to end --
// accepted by the schema, forwarded to the RPC unchanged, and named correctly in the email.
//
// Zod is not the authorization here and these tests do not pretend it is. PostgreSQL decides
// whether the relationship behind the request exists; what is asserted below is that the route
// stops rejecting these roles at the door and does not relabel them on the way through.

const condominiumId = '0a5e90f2-1ff3-433c-abe1-55fab3e206c3';
const personId = '11111111-1111-4111-8111-111111111111';
const unitId = '22222222-2222-4222-8222-222222222222';

const environment = {
  APP_ENV: 'development',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  NOTIFICATIONS_EMAIL_MODE: 'sandbox',
  NOTIFICATIONS_EMAIL_PROVIDER: 'zeptomail',
  NOTIFICATIONS_SANDBOX_EMAIL: 'sandbox@aratech.test',
  ZEPTOMAIL_SEND_TOKEN: 'test-zeptomail-token',
  NOTIFICATIONS_FROM_EMAIL: 'habitta@aratech.test',
  NOTIFICATIONS_FROM_NAME: 'Habitta',
  APP_BASE_URL: 'https://app.example.test',
} as unknown as NotificationBindings;

const jsonResponse = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

const invite = (role: string) =>
  app.request(
    `/v1/condominiums/${condominiumId}/resident-invitations`,
    {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ personId, unitId, role }),
    },
    environment,
  );

/** Captures what the route sent to the RPC and what the email said. */
const stubBackend = (role: string) => {
  const seen = { rpcBody: null as unknown, emailHtml: '' };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/rest/v1/rpc/create_resident_invitation')) {
        seen.rpcBody = JSON.parse(String(init?.body ?? '{}'));
        return jsonResponse({
          invitation: {
            id: '33333333-3333-4333-8333-333333333333',
            condominium_id: condominiumId,
            person_id: personId,
            unit_id: unitId,
            email: 'resident@example.com',
            intended_role: role,
            status: 'pending',
            expires_at: '2026-09-24T20:00:00.000Z',
          },
          raw_token: 'raw-token-412',
        });
      }
      if (url.includes('/rest/v1/condominiums?'))
        return jsonResponse([{ name: 'Residencias 412' }]);
      if (url.includes('zeptomail')) {
        seen.emailHtml = String(init?.body ?? '');
        return jsonResponse({ data: [{ code: 'EM_104' }] });
      }
      return jsonResponse([]);
    }),
  );
  return seen;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('HAB-412 resident invitations for family members and authorized occupants', () => {
  it('accepts a family_member invitation and forwards the role unchanged', async () => {
    const seen = stubBackend('family_member');
    const response = await invite('family_member');

    expect(response.status).toBe(201);
    expect(seen.rpcBody).toMatchObject({ target_role: 'family_member' });
  });

  it('accepts an authorized_occupant invitation and forwards the role unchanged', async () => {
    const seen = stubBackend('authorized_occupant');
    const response = await invite('authorized_occupant');

    expect(response.status).toBe(201);
    expect(seen.rpcBody).toMatchObject({ target_role: 'authorized_occupant' });
  });

  it('names each role in the invitation email instead of calling everyone a tenant', async () => {
    // The frontend label helper had exactly this bug: everything that was not an owner read as
    // "Inquilino". An invitation that misnames the relationship is asking somebody to accept
    // something other than what was granted.
    const family = stubBackend('family_member');
    await invite('family_member');
    expect(family.emailHtml).toContain('Familiar');
    expect(family.emailHtml).not.toContain('Inquilino');

    vi.unstubAllGlobals();

    const authorized = stubBackend('authorized_occupant');
    await invite('authorized_occupant');
    expect(authorized.emailHtml).toContain('Ocupante autorizado');
    expect(authorized.emailHtml).not.toContain('Inquilino');
  });

  it('still refuses a role that is not residential', async () => {
    // The resident door carries the four residential roles and no others. Staff arrive through
    // admin_invitations, which is a different path with different authorization.
    stubBackend('condominium_admin');
    const response = await invite('condominium_admin');
    expect(response.status).toBe(400);
  });
});
