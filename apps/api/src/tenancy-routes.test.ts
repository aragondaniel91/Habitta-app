import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { app as securityApp } from './security-entry';
import { tenancyFailureFromPostgrest } from './tenancy-routes';

const source = readFileSync(fileURLToPath(new URL('./tenancy-routes.ts', import.meta.url)), 'utf8');
const appSource = readFileSync(fileURLToPath(new URL('./index.ts', import.meta.url)), 'utf8');

const CONDOMINIUM = '00000000-0000-4000-8000-000000000360';
const ORGANIZATION = '00000000-0000-4000-8000-000000000361';
const environment = {
  SUPABASE_URL: 'https://supabase.test',
  SUPABASE_ANON_KEY: 'anon',
  APP_ENV: 'production',
} as never;

const validProfile = {
  name: 'Residencias Habitta',
  countryCode: 'VE',
  addressLine1: 'Av. Principal',
  city: 'Caracas',
  timezone: 'America/Caracas',
  primaryCurrencyCode: 'USD',
};

const upstream = (handler: (url: string) => Response) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes('/auth/v1/user'))
      return new Response(JSON.stringify({ id: CONDOMINIUM }), { status: 200 });
    return handler(url);
  });

const patch = (path: string, body: unknown) =>
  securityApp.fetch(
    new Request(`http://api.test${path}`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    environment,
  );

const domainFailure = (message: string) =>
  new Response(JSON.stringify({ code: 'P0001', message, details: null, hint: null }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });

describe('HAB-360 tenancy identity API contract', () => {
  afterEach(() => vi.restoreAllMocks());

  it('mounts the tenancy routes ahead of the legacy condominium handlers', () => {
    expect(appSource).toContain("import { tenancyRoutes } from './tenancy-routes'");
    expect(appSource.indexOf("app.route('/', tenancyRoutes)")).toBeGreaterThan(-1);
    expect(appSource.indexOf("app.route('/', tenancyRoutes)")).toBeLessThan(
      appSource.indexOf("app.route('/v1/condominiums', adminInvitationRoutes)"),
    );
  });

  it('only reaches the protected RPCs and never writes the tables', () => {
    expect(source).toContain("patch('/v1/condominiums/:id'");
    expect(source).toContain("patch('/v1/organizations/:organizationId'");
    expect(source).toContain("rpc(c, 'update_condominium_profile'");
    expect(source).toContain("rpc(c, 'rename_organization'");
    expect(source).not.toMatch(
      /rest\(c,\s*`?(condominiums|organizations)[^)]*\{\s*method:\s*'(POST|PUT|PATCH|DELETE)'/s,
    );
    expect(source).not.toMatch(/method:\s*'DELETE'/);
  });

  it('leaves the property topology to its own remediation flow', () => {
    expect(source).not.toContain('propertyTopology');
    expect(source).not.toContain('property_topology');
  });

  it('applies the corrected profile through the RPC payload', async () => {
    const bodies: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/auth/v1/user'))
        return new Response(JSON.stringify({ id: CONDOMINIUM }), { status: 200 });
      bodies.push(String(init?.body ?? ''));
      return new Response(JSON.stringify({ id: CONDOMINIUM }), { status: 200 });
    });

    const response = await patch(`/v1/condominiums/${CONDOMINIUM}`, {
      ...validProfile,
      secondaryCurrencyCode: 'VES',
      legalIdType: 'RIF',
      legalIdNumber: 'J-12345678-9',
    });

    expect(response.status).toBe(200);
    const payload = JSON.parse(bodies[0]!) as Record<string, unknown>;
    expect(payload.target).toBe(CONDOMINIUM);
    expect(payload.condominium_name).toBe('Residencias Habitta');
    expect(payload.legal_id_number).toBe('J-12345678-9');
    expect(payload.secondary_currency_code).toBe('VES');
    // Optional fields must travel as explicit nulls so the RPC clears them instead of skipping.
    expect(payload.parish).toBeNull();
  });

  it('rejects an incomplete profile before touching the database', async () => {
    const calls: string[] = [];
    upstream((url) => {
      calls.push(url);
      return new Response('{}', { status: 200 });
    });

    for (const body of [
      { ...validProfile, name: '' },
      { ...validProfile, countryCode: 'VEN' },
      { ...validProfile, primaryCurrencyCode: 'US' },
      { ...validProfile, city: '' },
    ]) {
      const response = await patch(`/v1/condominiums/${CONDOMINIUM}`, body);
      expect(response.status).toBe(400);
    }
    expect(calls.some((url) => url.includes('rpc/update_condominium_profile'))).toBe(false);
  });

  it('translates every tenancy conflict into an actionable message', async () => {
    const cases = [
      ['permission denied', 403, 'tenancy_forbidden'],
      ['condominium name already exists', 409, 'condominium_name_taken'],
      ['invalid condominium profile', 422, 'condominium_profile_invalid'],
      ['invalid condominium timezone', 422, 'condominium_timezone_invalid'],
      ['condominium unavailable', 409, 'condominium_unavailable'],
    ] as const;

    for (const [message, status, error] of cases) {
      vi.restoreAllMocks();
      upstream(() => domainFailure(message));

      const response = await patch(`/v1/condominiums/${CONDOMINIUM}`, validProfile);
      const payload = (await response.json()) as { error: string; publicMessage?: string };

      expect(response.status).toBe(status);
      expect(payload.error).toBe(error);
      expect(payload.publicMessage).toBeTypeOf('string');
      expect(payload.publicMessage).not.toMatch(/duplicate key|constraint|P0001|pg_/i);
    }
  });

  it('keeps the organization rename owner-gated and validated', async () => {
    upstream(() => domainFailure('organization owner required'));
    const denied = await patch(`/v1/organizations/${ORGANIZATION}`, { name: 'Nueva' });
    const deniedPayload = (await denied.json()) as { error: string; publicMessage?: string };
    expect(denied.status).toBe(403);
    expect(deniedPayload.error).toBe('organization_owner_required');

    vi.restoreAllMocks();
    upstream(() => new Response('{}', { status: 200 }));
    const blank = await patch(`/v1/organizations/${ORGANIZATION}`, { name: '   ' });
    expect(blank.status).toBe(400);
  });

  it('stays fail-closed on an unmapped upstream failure', async () => {
    upstream(
      () =>
        new Response(
          JSON.stringify({
            code: '23505',
            message: 'duplicate key value violates unique constraint "condominiums_pkey"',
            details: 'Key (id)=(1) already exists.',
            hint: null,
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
    );

    const response = await patch(`/v1/condominiums/${CONDOMINIUM}`, validProfile);
    const body = await response.text();

    expect(response.status).toBe(400);
    expect(body).not.toMatch(/duplicate key|constraint|Key \(id\)/);
  });

  it('maps only the vocabulary it declares', () => {
    expect(tenancyFailureFromPostgrest({ message: 'invalid organization name' })).toMatchObject({
      status: 422,
      error: 'organization_name_invalid',
    });
    expect(tenancyFailureFromPostgrest({ message: 'something else entirely' })).toBeNull();
    expect(tenancyFailureFromPostgrest(null)).toBeNull();
  });
});
