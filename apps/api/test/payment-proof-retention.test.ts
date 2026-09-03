import { afterEach, describe, expect, it, vi } from 'vitest';
import { runPaymentProofRetentionCleanup } from '../src/payment-proof-retention';
import type { NotificationBindings } from '../src/notifications/types';

const env = (deleteObject: ReturnType<typeof vi.fn>) =>
  ({
    APP_ENV: 'production',
    SUPABASE_URL: 'https://supabase.test',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    PAYMENT_PROOFS: { delete: deleteObject },
    NOTIFICATION_QUEUE: { send: vi.fn() },
    NOTIFICATIONS_FROM_EMAIL: 'no-reply@habitta.test',
    NOTIFICATIONS_FROM_NAME: 'Habitta',
    APP_BASE_URL: 'https://habitta.test',
  }) as unknown as NotificationBindings;

afterEach(() => vi.restoreAllMocks());

describe('payment proof retention cleanup', () => {
  it('deletes eligible objects and records storage lifecycle without exposing object keys in logs', async () => {
    const deleteObject = vi.fn(async (key: string) => {
      if (key === 'payments/proof-fail') throw new Error('r2 unavailable');
    });
    const auditPayloads: Record<string, unknown>[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('list_expired_payment_proof_objects')) {
        return Response.json([
          { proof_id: 'proof-ok', object_key: 'payments/proof-ok' },
          { proof_id: 'proof-fail', object_key: 'payments/proof-fail' },
        ]);
      }
      if (url.includes('record_payment_proof_storage_cleanup')) {
        auditPayloads.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return Response.json(null);
      }
      throw new Error(url);
    });
    vi.stubGlobal('fetch', fetchMock);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(runPaymentProofRetentionCleanup(env(deleteObject))).resolves.toEqual({
      selected: 2,
      deleted: 1,
      failed: 1,
    });

    expect(deleteObject).toHaveBeenCalledWith('payments/proof-ok');
    expect(deleteObject).toHaveBeenCalledWith('payments/proof-fail');
    expect(auditPayloads).toContainEqual({
      target_proof: 'proof-ok',
      succeeded: true,
      error_code: null,
    });
    expect(auditPayloads).toContainEqual({
      target_proof: 'proof-fail',
      succeeded: false,
      error_code: 'r2_delete_or_audit_failed',
    });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('payments/proof-fail');
  });

  it('treats an empty eligible set as a no-op', async () => {
    const deleteObject = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json([])),
    );

    await expect(runPaymentProofRetentionCleanup(env(deleteObject))).resolves.toEqual({
      selected: 0,
      deleted: 0,
      failed: 0,
    });
    expect(deleteObject).not.toHaveBeenCalled();
  });
});
