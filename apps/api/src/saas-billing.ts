import { resolveBillingProvider } from './billing-provider';
import type { NotificationBindings } from './notifications/types';
import { runWithBoundedConcurrency } from './notifications/concurrency';

const BILLING_CONCURRENCY = 3;

type DueBillingAttempt = {
  attempt_id: string;
  subscription_id: string;
  condominium_id: string;
  billing_cycle_on: string;
  attempt_no: number;
  expected_amount: number;
  currency: string;
  provider: string;
  provider_customer_ref: string;
  payment_method_ref: string;
};

const serviceRpc = async <T>(env: NotificationBindings, name: string, payload: unknown) => {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`rpc_${name}_failed`);
  return (await response.json()) as T;
};

export const runSaasBilling = async (env: NotificationBindings, runAt = new Date()) => {
  const provider = resolveBillingProvider(env);
  if (provider.name === 'mock') {
    return { provider: 'mock', zeroDueAdvanced: 0, claimed: 0, submitted: 0 };
  }

  const zeroDueAdvanced = await serviceRpc<number>(env, 'advance_zero_due_saas_periods_v1', {
    p_run_at: runAt.toISOString(),
    p_limit_count: 25,
  });
  const attempts = await serviceRpc<DueBillingAttempt[]>(
    env,
    'claim_due_saas_billing_attempts_v1',
    {
      p_run_at: runAt.toISOString(),
      p_limit_count: 20,
    },
  );

  let submitted = 0;
  await runWithBoundedConcurrency(attempts, BILLING_CONCURRENCY, async (attempt) => {
    if (attempt.provider !== provider.name) {
      await serviceRpc<boolean>(env, 'release_saas_billing_attempt_for_retry_v1', {
        p_attempt_id: attempt.attempt_id,
        p_error_code: 'billing_provider_mismatch',
        p_retry_at: new Date(runAt.getTime() + 15 * 60 * 1000).toISOString(),
      });
      return;
    }

    try {
      const result = await provider.chargeSavedPaymentMethod({
        billingAttemptId: attempt.attempt_id,
        subscriptionId: attempt.subscription_id,
        providerCustomerRef: attempt.provider_customer_ref,
        paymentMethodRef: attempt.payment_method_ref,
        amount: attempt.expected_amount,
        currency: attempt.currency,
        description: `Habitta · ${attempt.billing_cycle_on}`,
      });
      await serviceRpc(env, 'attach_saas_billing_provider_payment_v1', {
        p_attempt_id: attempt.attempt_id,
        p_provider: result.provider,
        p_provider_payment_ref: result.providerPaymentRef,
      });
      submitted += 1;
    } catch (error) {
      const errorCode =
        error instanceof Error && error.message
          ? error.message.slice(0, 120)
          : 'billing_provider_error';
      await serviceRpc<boolean>(env, 'release_saas_billing_attempt_for_retry_v1', {
        p_attempt_id: attempt.attempt_id,
        p_error_code: errorCode,
        // Ambiguous network/provider failures retry the SAME Habitta attempt and therefore the same
        // provider idempotency key. A new attempt number is created only after a definitive signed
        // charge_failed event, preventing an uncertain timeout from becoming a double charge.
        p_retry_at: new Date(runAt.getTime() + 15 * 60 * 1000).toISOString(),
      });
    }
  });

  return { provider: provider.name, zeroDueAdvanced, claimed: attempts.length, submitted };
};
