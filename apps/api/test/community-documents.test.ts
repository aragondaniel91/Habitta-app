import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/index';

const condominiumId = '19320000-0000-4000-8000-000000000001';
const documentId = '19360000-0000-4000-8000-000000000001';
const versionId = '19380000-0000-4000-8000-000000000001';
const token = { Authorization: 'Bearer test' };
const auth = () => Response.json({ id: '19300000-0000-4000-8000-000000000001' });

const bucket = (file = false) =>
  ({
    put: vi.fn(async () => undefined),
    get: vi.fn(async () =>
      file
        ? {
            body: new Blob([new Uint8Array([1, 2, 3, 4])]).stream(),
            size: 4,
          }
        : null,
    ),
    delete: vi.fn(async () => undefined),
  }) as unknown as R2Bucket;

const env = (paymentProofs = bucket()) => ({
  SUPABASE_URL: 'https://supabase.test',
  SUPABASE_ANON_KEY: 'anon',
  PAYMENT_PROOFS: paymentProofs,
});

const url = (suffix = '') => `/v1/condominiums/${condominiumId}/community-documents${suffix}`;

afterEach(() => vi.restoreAllMocks());

describe('HAB-193 community document metadata', () => {
  it('creates logical document metadata through the protected lifecycle RPC', async () => {
    let rpcBody: Record<string, unknown> | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const target = String(input);
        if (target.includes('/auth/v1/user')) return auth();
        if (target.includes('/rpc/create_community_document')) {
          rpcBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
          return Response.json({ id: documentId, title: 'Reglamento interno' });
        }
        throw new Error(`Unexpected fetch: ${target}`);
      }),
    );

    const response = await app.request(
      url(),
      {
        method: 'POST',
        headers: { ...token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Reglamento interno',
          description: 'Documento vigente',
          audience: 'owners',
          retentionDays: 3650,
        }),
      },
      env(),
    );

    expect(response.status).toBe(201);
    expect(rpcBody).toEqual({
      target_condominium_id: condominiumId,
      target_title: 'Reglamento interno',
      target_description: 'Documento vigente',
      target_folder_id: null,
      target_category_id: null,
      target_audience: 'owners',
      target_retention_days: 3650,
    });
  });

  it('rejects malformed audience metadata before calling Supabase', async () => {
    let databaseCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        if (String(input).includes('/auth/v1/user')) return auth();
        databaseCalls += 1;
        return Response.json({});
      }),
    );

    const response = await app.request(
      url(),
      {
        method: 'POST',
        headers: { ...token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Invalido', audience: 'internet' }),
      },
      env(),
    );

    expect(response.status).toBe(400);
    expect(databaseCalls).toBe(0);
  });
});

describe('HAB-193 immutable version upload', () => {
  it('rejects a non-manager before buffering or writing the private binary', async () => {
    const paymentProofs = bucket() as unknown as {
      put: ReturnType<typeof vi.fn>;
      get: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const target = String(input);
        if (target.includes('/auth/v1/user')) return auth();
        if (target.includes('/rpc/can_manage_community_documents')) return Response.json(false);
        throw new Error(`Unexpected fetch: ${target}`);
      }),
    );

    const response = await app.request(
      url(`/${documentId}/versions`),
      {
        method: 'PUT',
        headers: { ...token, 'Content-Type': 'application/pdf', 'X-Filename': 'secret.pdf' },
        body: new Uint8Array([1, 2, 3]),
      },
      env(paymentProofs as unknown as R2Bucket),
    );

    expect(response.status).toBe(403);
    expect(paymentProofs.put).not.toHaveBeenCalled();
    expect(paymentProofs.delete).not.toHaveBeenCalled();
  });

  it('rolls back the R2 object when immutable version metadata cannot be recorded', async () => {
    const paymentProofs = bucket() as unknown as {
      put: ReturnType<typeof vi.fn>;
      get: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const target = String(input);
        if (target.includes('/auth/v1/user')) return auth();
        if (target.includes('/rpc/can_manage_community_documents')) return Response.json(true);
        if (target.includes('/community_documents?'))
          return Response.json([{ id: documentId, status: 'active' }]);
        if (target.includes('/rpc/record_community_document_version'))
          return Response.json({ message: 'version upload denied' }, { status: 403 });
        throw new Error(`Unexpected fetch: ${target}`);
      }),
    );

    const response = await app.request(
      url(`/${documentId}/versions`),
      {
        method: 'PUT',
        headers: { ...token, 'Content-Type': 'application/pdf', 'X-Filename': 'acta.pdf' },
        body: new Uint8Array([1, 2, 3, 4]),
      },
      env(paymentProofs as unknown as R2Bucket),
    );

    expect(response.status).toBe(403);
    expect(paymentProofs.put).toHaveBeenCalledTimes(1);
    expect(paymentProofs.delete).toHaveBeenCalledTimes(1);
  });

  it('records a canonical condominium/document/version key and SHA-256', async () => {
    let rpcBody: Record<string, unknown> | undefined;
    const paymentProofs = bucket() as unknown as {
      put: ReturnType<typeof vi.fn>;
      get: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const target = String(input);
        if (target.includes('/auth/v1/user')) return auth();
        if (target.includes('/rpc/can_manage_community_documents')) return Response.json(true);
        if (target.includes('/community_documents?'))
          return Response.json([{ id: documentId, status: 'active' }]);
        if (target.includes('/rpc/record_community_document_version')) {
          rpcBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
          return Response.json({ id: rpcBody.target_version_id, version_number: 1 });
        }
        throw new Error(`Unexpected fetch: ${target}`);
      }),
    );

    const response = await app.request(
      url(`/${documentId}/versions`),
      {
        method: 'PUT',
        headers: { ...token, 'Content-Type': 'application/pdf', 'X-Filename': 'acta.pdf' },
        body: new Uint8Array([4, 3, 2, 1]),
      },
      env(paymentProofs as unknown as R2Bucket),
    );

    expect(response.status).toBe(201);
    expect(String(rpcBody?.target_storage_key)).toMatch(
      new RegExp(`^community-documents/${condominiumId}/${documentId}/[0-9a-f-]{36}$`),
    );
    expect(rpcBody?.target_original_filename).toBe('acta.pdf');
    expect(rpcBody?.target_content_type).toBe('application/pdf');
    expect(rpcBody?.target_size_bytes).toBe(4);
    expect(String(rpcBody?.target_sha256)).toMatch(/^[0-9a-f]{64}$/);
    expect(paymentProofs.put).toHaveBeenCalledTimes(1);
    expect(paymentProofs.delete).not.toHaveBeenCalled();
  });
});

describe('HAB-193 audited download', () => {
  it('fails closed when the download audit cannot be persisted', async () => {
    const order: string[] = [];
    const paymentProofs = bucket(true) as unknown as {
      put: ReturnType<typeof vi.fn>;
      get: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    paymentProofs.get.mockImplementation(async () => {
      order.push('r2');
      return {
        body: new Blob([new Uint8Array([1, 2, 3, 4])]).stream(),
        size: 4,
      };
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const target = String(input);
        if (target.includes('/auth/v1/user')) return auth();
        if (target.includes('/community_document_versions?'))
          return Response.json([
            {
              storage_key: `community-documents/${condominiumId}/${documentId}/${versionId}`,
              original_filename: 'acta.pdf',
              content_type: 'application/pdf',
              size_bytes: 4,
            },
          ]);
        if (target.includes('/rpc/record_community_document_download')) {
          order.push('audit');
          return Response.json({ message: 'audit unavailable' }, { status: 500 });
        }
        throw new Error(`Unexpected fetch: ${target}`);
      }),
    );

    const response = await app.request(
      url(`/${documentId}/versions/${versionId}/file`),
      { headers: token },
      env(paymentProofs as unknown as R2Bucket),
    );

    expect(response.status).toBe(500);
    expect(order).toEqual(['r2', 'audit']);
    expect(await response.json()).toEqual({ error: 'audit unavailable' });
  });

  it('delivers a private no-store binary only after the audit succeeds', async () => {
    const paymentProofs = bucket(true);
    let audited = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const target = String(input);
        if (target.includes('/auth/v1/user')) return auth();
        if (target.includes('/community_document_versions?'))
          return Response.json([
            {
              storage_key: `community-documents/${condominiumId}/${documentId}/${versionId}`,
              original_filename: 'acta.pdf',
              content_type: 'application/pdf',
              size_bytes: 4,
            },
          ]);
        if (target.includes('/rpc/record_community_document_download')) {
          audited = true;
          return Response.json({ id: '19381000-0000-4000-8000-000000000001' });
        }
        throw new Error(`Unexpected fetch: ${target}`);
      }),
    );

    const response = await app.request(
      url(`/${documentId}/versions/${versionId}/file`),
      { headers: token },
      env(paymentProofs),
    );

    expect(response.status).toBe(200);
    expect(audited).toBe(true);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0');
    expect(response.headers.get('Content-Disposition')).toContain('acta.pdf');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
  });
});
