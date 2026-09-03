import { runWithBoundedConcurrency } from './notifications/concurrency';
import { serviceRpc } from './notifications/worker';
import type { NotificationBindings } from './notifications/types';

const CLEANUP_BATCH_SIZE = 100;
const CLEANUP_CONCURRENCY = 5;

type ExpiredProofObject = {
  proof_id: string;
  object_key: string;
};

export type PaymentProofCleanupResult = {
  selected: number;
  deleted: number;
  failed: number;
};

export async function runPaymentProofRetentionCleanup(
  env: NotificationBindings,
): Promise<PaymentProofCleanupResult> {
  const rows = await serviceRpc<ExpiredProofObject[]>(env, 'list_expired_payment_proof_objects', {
    limit_count: CLEANUP_BATCH_SIZE,
  });

  let deleted = 0;
  let failed = 0;

  await runWithBoundedConcurrency(rows, CLEANUP_CONCURRENCY, async (row) => {
    try {
      await env.PAYMENT_PROOFS.delete(row.object_key);
      await serviceRpc<void>(env, 'record_payment_proof_storage_cleanup', {
        target_proof: row.proof_id,
        succeeded: true,
        error_code: null,
      });
      deleted += 1;
    } catch (error) {
      failed += 1;
      console.error('payment_proof_retention_cleanup_failed', {
        proofId: row.proof_id,
        error: error instanceof Error ? error.name : 'unknown_error',
      });
      try {
        await serviceRpc<void>(env, 'record_payment_proof_storage_cleanup', {
          target_proof: row.proof_id,
          succeeded: false,
          error_code: 'r2_delete_or_audit_failed',
        });
      } catch (auditError) {
        console.error('payment_proof_retention_cleanup_audit_failed', {
          proofId: row.proof_id,
          error: auditError instanceof Error ? auditError.name : 'unknown_error',
        });
      }
    }
  });

  return { selected: rows.length, deleted, failed };
}
