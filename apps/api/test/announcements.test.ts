import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  announcementCreateSchema,
  announcementScheduleSchema,
  announcementUpdateSchema,
} from '@habitta/validation';
import { app } from '../src/index';

const condo = '00000000-0000-0000-0000-000000000101';
const announcementId = '00000000-0000-0000-0000-000000000102';
const building = '00000000-0000-0000-0000-000000000103';
const token = { Authorization: 'Bearer test' };
const auth = () => Response.json({ id: '00000000-0000-0000-0000-000000000104' });
const env = () => ({
  SUPABASE_URL: 'https://supabase.test',
  SUPABASE_ANON_KEY: 'anon',
  PAYMENT_PROOFS: {} as R2Bucket,
});

afterEach(() => vi.restoreAllMocks());

describe('announcement validation', () => {
  it('normalizes defaults and protects audience and expiration contracts', () => {
    expect(
      announcementCreateSchema.parse({
        title: '  Corte programado de agua  ',
        summary: '  El servicio estará suspendido durante la mañana.  ',
        body: '  Se realizarán trabajos en la tubería principal.  ',
      }),
    ).toMatchObject({
      title: 'Corte programado de agua',
      priority: 'normal',
      audience: 'everyone',
      requiresAcknowledgement: false,
    });
    expect(
      announcementCreateSchema.safeParse({
        title: 'Aviso por torre',
        summary: 'Información dirigida a una torre.',
        body: 'Contenido del comunicado.',
        audience: 'building',
      }).success,
    ).toBe(false);
    expect(announcementUpdateSchema.safeParse({}).success).toBe(false);
    expect(
      announcementScheduleSchema.safeParse({ publishAt: '2026-08-10T15:00:00Z' }).success,
    ).toBe(true);
  });
});

describe('announcement HTTP routes', () => {
  it('sends the exact create RPC payload', async () => {
    let rpcBody = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        if (String(input).includes('/auth/v1/user')) return auth();
        rpcBody = String(init?.body);
        return Response.json({ id: announcementId });
      }),
    );

    const response = await app.request(
      `/v1/condominiums/${condo}/announcements`,
      {
        method: 'POST',
        headers: { ...token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Mantenimiento de ascensores',
          summary: 'El ascensor norte estará fuera de servicio.',
          body: 'El mantenimiento se realizará de 8:00 AM a 12:00 PM.',
          priority: 'important',
          audience: 'building',
          buildingId: building,
          requiresAcknowledgement: true,
        }),
      },
      env(),
    );

    expect(response.status).toBe(201);
    expect(JSON.parse(rpcBody)).toEqual({
      target_condominium: condo,
      announcement_title: 'Mantenimiento de ascensores',
      announcement_summary: 'El ascensor norte estará fuera de servicio.',
      announcement_body: 'El mantenimiento se realizará de 8:00 AM a 12:00 PM.',
      announcement_priority: 'important',
      announcement_audience: 'building',
      target_building: building,
      target_unit: null,
      acknowledgement_required: true,
      expires_on: null,
    });
  });

  it('applies validated list filters', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        calls.push(url);
        return url.includes('/auth/v1/user') ? auth() : Response.json([]);
      }),
    );

    const response = await app.request(
      `/v1/condominiums/${condo}/announcements?status=published&priority=urgent&audience=owners`,
      { headers: token },
      env(),
    );

    expect(response.status).toBe(200);
    expect(
      calls.some(
        (url) =>
          url.includes('announcements?') &&
          url.includes('status=eq.published') &&
          url.includes('priority=eq.urgent') &&
          url.includes('audience=eq.owners'),
      ),
    ).toBe(true);
  });

  it('rejects invalid list filters before querying Supabase', async () => {
    let databaseCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        if (String(input).includes('/auth/v1/user')) return auth();
        databaseCalls += 1;
        return Response.json([]);
      }),
    );

    const response = await app.request(
      `/v1/condominiums/${condo}/announcements?status=sent`,
      { headers: token },
      env(),
    );

    expect(response.status).toBe(400);
    expect(databaseCalls).toBe(0);
  });

  it('sends publication through the version-protected RPC', async () => {
    let rpcBody = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        if (String(input).includes('/auth/v1/user')) return auth();
        rpcBody = String(init?.body);
        return Response.json({ id: announcementId, status: 'published' });
      }),
    );

    const response = await app.request(
      `/v1/condominiums/${condo}/announcements/${announcementId}/publish`,
      {
        method: 'POST',
        headers: { ...token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedVersion: 3 }),
      },
      env(),
    );

    expect(response.status).toBe(200);
    expect(JSON.parse(rpcBody)).toEqual({
      target_condominium: condo,
      target_announcement: announcementId,
      expected_version: 3,
    });
  });
});
