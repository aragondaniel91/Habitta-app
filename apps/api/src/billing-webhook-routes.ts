import { Hono } from 'hono';
import {
  BillingProviderIgnoredEventError,
  BillingProviderUnavailableError,
  BillingProviderVerificationError,
  resolveBillingProvider,
} from './billing-provider';
import type { NormalizedBillingProviderEvent } from './billing-provider';
import type { NotificationBindings } from './notifications/types';

type Variables = { requestId: string };
type AppEnvironment = { Bindings: NotificationBindings; Variables: Variables };

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
  if (!response.ok) throw new Error(`billing_rpc_${name}_failed`);
  return (await response.json()) as T;
};

const resolveSubscription = async (
  env: NotificationBindings,
  event: NormalizedBillingProviderEvent,
) => {
  if (event.subscriptionId) return event.subscriptionId;
  return serviceRpc<string | null>(env, 'resolve_saas_billing_subscription_v1', {
    p_provider: event.provider,
    p_provider_customer_ref: event.providerCustomerRef,
    p_payment_method_ref: event.paymentMethodRef,
  });
};

export const billingWebhookRoutes = new Hono<AppEnvironment>();

billingWebhookRoutes.post('/stripe', async (c) => {
  const declaredLength = Number(c.req.header('Content-Length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > 1024 * 1024) {
    return c.json({ error: 'Payload too large' }, 413);
  }

  let provider;
  try {
    provider = resolveBillingProvider(c.env);
  } catch (error) {
    if (error instanceof BillingProviderUnavailableError) {
      return c.json({ error: 'Billing provider unavailable' }, 503);
    }
    throw error;
  }
  if (provider.name !== 'stripe') return c.json({ error: 'Billing provider unavailable' }, 503);

  let event: NormalizedBillingProviderEvent;
  try {
    // The adapter consumes the exact raw request body and verifies Stripe-Signature before parsing.
    event = await provider.verifyAndNormalizeWebhook(c.req.raw);
  } catch (error) {
    if (error instanceof BillingProviderIgnoredEventError) {
      return c.json({ received: true, ignored: true }, 200);
    }
    if (error instanceof BillingProviderVerificationError) {
      return c.json({ error: 'Invalid billing webhook' }, 400);
    }
    // Transient Stripe retrieval failures should be retried by Stripe rather than acknowledged.
    return c.json({ error: 'Billing webhook processing unavailable' }, 502);
  }

  const subscriptionId = await resolveSubscription(c.env, event);
  const result = await serviceRpc<{
    event_id: string;
    processing_status: 'applied' | 'rejected';
    rejection_reason: string | null;
    idempotent_replay: boolean;
  }>(c.env, 'apply_billing_provider_event_v1', {
    p_provider: event.provider,
    p_provider_event_id: event.eventId,
    p_event_type: event.eventType,
    p_subscription_id: subscriptionId,
    p_provider_setup_ref: event.providerSetupRef,
    p_provider_customer_ref: event.providerCustomerRef,
    p_payment_method_ref: event.paymentMethodRef,
    p_provider_payment_ref: event.providerPaymentRef,
    p_amount: event.amount,
    p_currency: event.currency,
    p_occurred_at: event.occurredAt,
  });

  // A semantic rejection is still a successfully consumed, audited provider event. Returning 2xx
  // prevents Stripe retries from turning a business-rule rejection into noisy duplicate traffic.
  return c.json(
    {
      received: true,
      processingStatus: result.processing_status,
      idempotentReplay: result.idempotent_replay,
    },
    200,
  );
});
