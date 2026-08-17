import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/index';
import type { NotificationBindings } from '../src/notifications/types';

const condominiumId = '0a5e90f2-1ff3-433c-abe1-55fab3e206c3';
const personId = '11111111-1111-4111-8111-111111111111';
const unitId = '22222222-2222-4222-8222-222222222222';
const invitationId = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';

const baseEnvironment = {
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
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const invitationPayload = {
  invitation: {
    id: invitationId,
    condominium_id: condominiumId,
    person_id: personId,
    unit_id: unitId,
    email: 'resident@example.com',
    intended_role: 'owner',
    status: 'pending',
    expires_at: '2026-08-24T20:00:00.000Z',
  },
  raw_token: 'raw-token-216',
};

const requestInvitation = (environment: NotificationBindings = baseEnvironment) =>
  app.request(
    `/v1/condominiums/${condominiumId}/resident-invitations`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ personId, unitId, role: 'owner' }),
    },
    environment,
  );

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('resident invitation transactional email route', () => {
  it('uses the authenticated HAB-125 RPC, sandbox recipient, provider and terminal audit', async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push([input, init]);
        const url = String(input);
        if (url.endsWith('/auth/v1/user')) return jsonResponse({ id: userId });
        if (url.endsWith('/rest/v1/rpc/create_resident_invitation')) {
          return jsonResponse(invitationPayload);
        }
        if (url.includes('/rest/v1/condominiums?'))
          return jsonResponse([{ name: 'Residencias 216' }]);
        if (url.includes('/rest/v1/units?')) {
          return jsonResponse([{ code: 'A-12', buildings: { name: 'Torre Norte' } }]);
        }
        if (url === 'https://api.zeptomail.com/v1.1/email') {
          return jsonResponse({ request_id: 'zepto-request-216' }, 201);
        }
        if (url.endsWith('/rest/v1/rpc/record_resident_invitation_delivery')) {
          return jsonResponse({ id: 'delivery-event-216' });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    const response = await requestInvitation();
    expect(response.status).toBe(201);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      invitationUrl: 'https://app.example.test/invite/raw-token-216',
      emailDelivery: {
        status: 'sent',
        recipient: 'sandbox@aratech.test',
        provider: 'zeptomail',
        mode: 'sandbox',
        providerId: 'zepto-request-216',
      },
      auditPersisted: true,
    });

    const rpcCall = calls.find(([input]) =>
      String(input).endsWith('/rpc/create_resident_invitation'),
    );
    expect(rpcCall).toBeDefined();
    expect(new Headers(rpcCall?.[1]?.headers).get('Authorization')).toBe('Bearer test-token');
    expect(JSON.parse(String(rpcCall?.[1]?.body))).toEqual({
      target_condominium_id: condominiumId,
      target_person_id: personId,
      target_unit_id: unitId,
      target_role: 'owner',
      target_expires_at: null,
    });

    const providerCall = calls.find(([input]) => String(input).includes('api.zeptomail.com'));
    const providerBody = JSON.parse(String(providerCall?.[1]?.body));
    expect(providerBody.to[0].email_address.address).toBe('sandbox@aratech.test');
    expect(providerBody.to[0].email_address.address).not.toBe('resident@example.com');
    expect(providerBody.client_reference).toBe(`habitta-resident-invitation-${invitationId}`);
    expect(providerBody.textbody).toContain('Torre Norte · A-12');

    const auditCall = calls.find(([input]) =>
      String(input).endsWith('/rpc/record_resident_invitation_delivery'),
    );
    expect(JSON.parse(String(auditCall?.[1]?.body))).toEqual({
      target_invitation_id: invitationId,
      target_status: 'sent',
      target_provider: 'zeptomail',
      target_mode: 'sandbox',
      target_error_code: null,
      target_provider_id: 'zepto-request-216',
    });
    expect(new Headers(auditCall?.[1]?.headers).get('Authorization')).toBe('Bearer test-token');
  });

  it('sends live production delivery only to the canonical resident email', async () => {
    const providerBodies: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/auth/v1/user')) return jsonResponse({ id: userId });
        if (url.endsWith('/rest/v1/rpc/create_resident_invitation')) {
          return jsonResponse(invitationPayload);
        }
        if (url.includes('/rest/v1/condominiums?'))
          return jsonResponse([{ name: 'Residencias 216' }]);
        if (url.includes('/rest/v1/units?'))
          return jsonResponse([{ code: 'A-12', buildings: null }]);
        if (url === 'https://api.zeptomail.com/v1.1/email') {
          providerBodies.push(JSON.parse(String(init?.body)));
          return jsonResponse({ request_id: 'live-request-216' }, 201);
        }
        if (url.endsWith('/rest/v1/rpc/record_resident_invitation_delivery')) {
          return jsonResponse({ id: 'delivery-live-216' });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    const environment = {
      ...baseEnvironment,
      APP_ENV: 'production',
      NOTIFICATIONS_EMAIL_MODE: 'live',
    } as unknown as NotificationBindings;
    const response = await requestInvitation(environment);

    expect(response.status).toBe(201);
    const body = (await response.json()) as { emailDelivery: { recipient: string } };
    expect(body.emailDelivery.recipient).toBe('resident@example.com');
    const providerBody = providerBodies[0] as { to: Array<{ email_address: { address: string } }> };
    expect(providerBody.to[0]?.email_address.address).toBe('resident@example.com');
  });

  it('stops at the distributed invitation limiter before generating a resident token', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.endsWith('/auth/v1/user')) return jsonResponse({ id: userId });
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    const environment = {
      ...baseEnvironment,
      INVITATION_LIMIT: {
        limit: vi.fn(async () => ({ success: false })),
      },
    } as unknown as NotificationBindings;
    const response = await requestInvitation(environment);

    expect(response.status).toBe(429);
    expect(calls.filter((url) => url.includes('create_resident_invitation'))).toHaveLength(0);
  });

  it('maps the HAB-125 database fail-safe rate guard to HTTP 429', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/auth/v1/user')) return jsonResponse({ id: userId });
        if (url.endsWith('/rest/v1/rpc/create_resident_invitation')) {
          return jsonResponse({ message: 'resident invitation rate limit exceeded' }, 400);
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    const response = await requestInvitation();
    expect(response.status).toBe(429);
  });

  it('returns the secure link and audits a configuration failure without exposing service-role credentials', async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push([input, init]);
        const url = String(input);
        if (url.endsWith('/auth/v1/user')) return jsonResponse({ id: userId });
        if (url.endsWith('/rest/v1/rpc/create_resident_invitation')) {
          return jsonResponse(invitationPayload);
        }
        if (url.includes('/rest/v1/condominiums?'))
          return jsonResponse([{ name: 'Residencias 216' }]);
        if (url.includes('/rest/v1/units?'))
          return jsonResponse([{ code: 'A-12', buildings: null }]);
        if (url.endsWith('/rest/v1/rpc/record_resident_invitation_delivery')) {
          return jsonResponse({ id: 'delivery-config-216' });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    const environment = {
      ...baseEnvironment,
      ZEPTOMAIL_SEND_TOKEN: undefined,
    } as unknown as NotificationBindings;
    const response = await requestInvitation(environment);
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      invitationUrl: string;
      emailDelivery: { status: string; errorCode: string };
      auditPersisted: boolean;
    };
    expect(body.invitationUrl).toContain('/invite/raw-token-216');
    expect(body.emailDelivery).toMatchObject({
      status: 'failed',
      errorCode: 'notifications_zeptomail_token_missing',
    });
    expect(body.auditPersisted).toBe(true);

    for (const [, init] of calls.filter(([input]) =>
      String(input).includes('example.supabase.co'),
    )) {
      const authorization = new Headers(init?.headers).get('Authorization');
      expect(authorization).not.toContain('service');
      expect(String(init?.body ?? '')).not.toContain('raw-token-216');
    }
  });
});
