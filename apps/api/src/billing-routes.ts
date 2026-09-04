import { Hono } from 'hono';
import { z } from 'zod';
import { BillingProviderUnavailableError, resolveBillingProvider } from './billing-provider';
import type { NotificationBindings } from './notifications/types';

type Variables = { token: string; userId: string };
type AppEnvironment = { Bindings: NotificationBindings; Variables: Variables };

const uuid = z.string().uuid();

type BillingSetupAttempt = {
  attempt_id: string | null;
  subscription_id: string;
  condominium_id: string;
  status: 'pending' | 'provider_created' | 'ready' | 'failed' | 'expired';
  idempotent_replay: boolean;
  billing_method_ready: boolean;
  auto_bill_enabled: boolean;
};

const rpc = async (
  env: NotificationBindings,
  authorization: string,
  name: string,
  payload: unknown,
) => {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: authorization,
      Authorization: `Bearer ${authorization}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const value = (await response.json()) as unknown;
  return { response, value };
};

const customerRpc = (env: NotificationBindings, token: string, name: string, payload: unknown) => {
  const url = `${env.SUPABASE_URL}/rest/v1/rpc/${name}`;
  return fetch(url, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
};

export const billingRoutes = new Hono<AppEnvironment>();

billingRoutes.post('/:id/billing/setup', async (c) => {
  const condominiumId = uuid.safeParse(c.req.param('id'));
  const idempotencyKey = uuid.safeParse(c.req.header('Idempotency-Key'));
  if (!condominiumId.success || !idempotencyKey.success) {
    return c.json({ error: 'Valid condominium id and Idempotency-Key UUID are required' }, 400);
  }

  let provider;
  try {
    // Fail before creating a DB attempt when there is no usable server-side provider adapter.
    provider = resolveBillingProvider(c.env);
  } catch (error) {
    if (error instanceof BillingProviderUnavailableError) {
      return c.json({ error: 'Billing provider unavailable' }, 503);
    }
    throw error;
  }

  const beginResponse = await customerRpc(
    c.env,
    c.get('token'),
    'begin_customer_billing_setup_v1',
    {
      p_condominium_id: condominiumId.data,
      p_idempotency_key: idempotencyKey.data,
    },
  );
  const beginValue = (await beginResponse.json()) as
    BillingSetupAttempt | { message?: string; code?: string };
  if (!beginResponse.ok) {
    const error = beginValue as { message?: string; code?: string };
    if (beginResponse.status === 401 || beginResponse.status === 403 || error.code === '42501') {
      return c.json({ error: 'Forbidden' }, 403);
    }
    return c.json({ error: error.message ?? 'Billing setup could not be started' }, 400);
  }

  const attempt = beginValue as BillingSetupAttempt;
  if (attempt.billing_method_ready || attempt.status === 'ready' || !attempt.attempt_id) {
    return c.json(
      {
        status: 'ready',
        billingMethodReady: true,
        autoBillEnabled: attempt.auto_bill_enabled,
      },
      200,
    );
  }

  let setup;
  try {
    // Concrete providers MUST use attemptId as their own idempotency key. That way a timeout after
    // provider creation but before the DB attachment cannot create a second provider setup object.
    setup = await provider.createPaymentMethodSetup({
      attemptId: attempt.attempt_id,
      subscriptionId: attempt.subscription_id,
      condominiumId: attempt.condominium_id,
      returnUrl: `${c.env.APP_BASE_URL.replace(/\/$/, '')}/settings`,
    });
  } catch {
    return c.json({ error: 'Billing provider setup failed' }, 502);
  }

  const attached = await rpc(
    c.env,
    c.env.SUPABASE_SERVICE_ROLE_KEY,
    'attach_billing_provider_setup_v1',
    {
      p_attempt_id: attempt.attempt_id,
      p_provider: setup.provider,
      p_provider_setup_ref: setup.providerSetupRef,
      p_provider_customer_ref: setup.providerCustomerRef,
      p_expires_at: setup.expiresAt,
    },
  );
  if (!attached.response.ok) {
    return c.json({ error: 'Billing setup could not be persisted' }, 502);
  }

  return c.json(
    {
      attemptId: attempt.attempt_id,
      status: 'provider_created',
      provider: setup.provider,
      action: setup.action,
      expiresAt: setup.expiresAt,
      // Explicitly repeat the financial boundary in the response contract.
      billingMethodReady: false,
      autoBillEnabled: false,
    },
    201,
  );
});
