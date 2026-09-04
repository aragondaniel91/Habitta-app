import {
  BillingProviderIgnoredEventError,
  BillingProviderRequestError,
  BillingProviderUnavailableError,
  BillingProviderVerificationError,
} from './billing-provider-contract';
import type {
  BillingChargeInput,
  BillingChargeResult,
  BillingProviderAdapter,
  BillingSetupInput,
  BillingSetupSession,
  NormalizedBillingProviderEvent,
} from './billing-provider-contract';
import type { NotificationBindings } from './notifications/types';

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const STRIPE_SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

const addQuery = (url: string, values: Record<string, string>) => {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(values)) parsed.searchParams.set(key, value);
  return parsed.toString();
};

const encodeHex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');

const constantTimeHexEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};

const computeStripeSignature = async (secret: string, timestamp: number, rawBody: string) => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return encodeHex(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`)),
  );
};

const verifyStripeSignature = async (
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  now = Date.now(),
) => {
  if (!signatureHeader) throw new BillingProviderVerificationError('Stripe-Signature is required.');

  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of signatureHeader.split(',')) {
    const [key, value] = part.trim().split('=', 2);
    if (key === 't') timestamp = Number(value);
    if (key === 'v1' && value) signatures.push(value.toLowerCase());
  }

  if (!timestamp || !Number.isInteger(timestamp) || signatures.length === 0) {
    throw new BillingProviderVerificationError('Stripe-Signature is malformed.');
  }
  if (Math.abs(now - timestamp * 1000) > STRIPE_SIGNATURE_TOLERANCE_MS) {
    throw new BillingProviderVerificationError('Stripe-Signature timestamp is outside tolerance.');
  }

  const expected = await computeStripeSignature(secret, timestamp, rawBody);
  if (!signatures.some((signature) => constantTimeHexEqual(signature, expected))) {
    throw new BillingProviderVerificationError('Stripe-Signature does not match.');
  }
};

const stripeSecret = (env: NotificationBindings) => {
  const key = env.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!key || !webhookSecret) {
    throw new BillingProviderUnavailableError('Stripe billing secrets are not configured.');
  }
  return { key, webhookSecret };
};

const readStripeError = async (response: Response) => {
  try {
    const payload = (await response.clone().json()) as {
      error?: { code?: string; message?: string; type?: string };
    };
    return (
      payload.error?.code ??
      payload.error?.type ??
      payload.error?.message ??
      `http_${response.status}`
    );
  } catch {
    return `http_${response.status}`;
  }
};

const stripeRequest = async <T>(
  env: NotificationBindings,
  path: string,
  init: RequestInit,
  idempotencyKey?: string,
) => {
  const { key } = stripeSecret(env);
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${key}`);
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);
  const response = await fetch(`${STRIPE_API_BASE}${path}`, { ...init, headers });
  if (!response.ok) {
    throw new BillingProviderRequestError(`stripe_${await readStripeError(response)}`);
  }
  return (await response.json()) as T;
};

const optionalString = (value: unknown) => (typeof value === 'string' && value ? value : null);
const requiredString = (value: unknown, field: string) => {
  const normalized = optionalString(value);
  if (!normalized) throw new BillingProviderVerificationError(`Stripe event is missing ${field}.`);
  return normalized;
};
const numeric = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const metadataFrom = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : ({} as Record<string, unknown>);

const ZERO_DECIMAL_CURRENCIES = new Set([
  'bif',
  'clp',
  'djf',
  'gnf',
  'jpy',
  'kmf',
  'krw',
  'mga',
  'pyg',
  'rwf',
  'ugx',
  'vnd',
  'vuv',
  'xaf',
  'xof',
  'xpf',
]);
const THREE_DECIMAL_CURRENCIES = new Set(['bhd', 'jod', 'kwd', 'omr', 'tnd']);

const amountFromMinorUnits = (amount: number, currency: string) => {
  const normalized = currency.toLowerCase();
  const divisor = ZERO_DECIMAL_CURRENCIES.has(normalized)
    ? 1
    : THREE_DECIMAL_CURRENCIES.has(normalized)
      ? 1000
      : 100;
  return amount / divisor;
};

const amountToMinorUnits = (amount: number, currency: string) => {
  const normalized = currency.toLowerCase();
  const multiplier = ZERO_DECIMAL_CURRENCIES.has(normalized)
    ? 1
    : THREE_DECIMAL_CURRENCIES.has(normalized)
      ? 1000
      : 100;
  const minor = amount * multiplier;
  if (!Number.isSafeInteger(Math.round(minor)) || Math.abs(minor - Math.round(minor)) > 0.000001) {
    throw new BillingProviderRequestError('stripe_amount_precision_invalid');
  }
  return Math.round(minor);
};

type StripeCheckoutSession = {
  id: string;
  mode: string;
  url: string | null;
  customer: string | null;
  setup_intent: string | null;
  expires_at: number;
};

type StripeSetupIntent = {
  id: string;
  status: string;
  customer: string | null;
  payment_method: string | null;
};

type StripePaymentIntent = {
  id: string;
  status: string;
};

type StripePaymentError = {
  error?: {
    code?: string;
    type?: string;
    message?: string;
    payment_intent?: StripePaymentIntent;
  };
};

type StripeEvent = {
  id: string;
  type: string;
  created: number;
  data: { object: Record<string, unknown> };
};

const normalizeStripeWebhook = async (
  env: NotificationBindings,
  event: StripeEvent,
): Promise<NormalizedBillingProviderEvent> => {
  const object = event.data?.object;
  if (!object || typeof object !== 'object') {
    throw new BillingProviderVerificationError('Stripe event data is malformed.');
  }
  const occurredAt = new Date(event.created * 1000).toISOString();

  if (event.type === 'checkout.session.completed') {
    if (object.mode !== 'setup') throw new BillingProviderIgnoredEventError();
    const metadata = metadataFrom(object.metadata);
    const subscriptionId = requiredString(
      metadata.habitta_subscription_id,
      'metadata.habitta_subscription_id',
    );
    const setupIntentId = requiredString(object.setup_intent, 'setup_intent');
    const providerCustomerRef = requiredString(object.customer, 'customer');
    const setupIntent = await stripeRequest<StripeSetupIntent>(
      env,
      `/setup_intents/${encodeURIComponent(setupIntentId)}`,
      { method: 'GET' },
    );
    if (setupIntent.status !== 'succeeded') {
      throw new BillingProviderRequestError('stripe_setup_intent_not_succeeded');
    }

    return {
      provider: 'stripe',
      eventId: event.id,
      eventType: 'payment_method_ready',
      subscriptionId,
      providerSetupRef: requiredString(object.id, 'checkout_session.id'),
      providerCustomerRef,
      paymentMethodRef: requiredString(setupIntent.payment_method, 'setup_intent.payment_method'),
      providerPaymentRef: null,
      amount: null,
      currency: null,
      occurredAt,
    };
  }

  if (event.type === 'checkout.session.expired') {
    if (object.mode !== 'setup') throw new BillingProviderIgnoredEventError();
    const metadata = metadataFrom(object.metadata);
    return {
      provider: 'stripe',
      eventId: event.id,
      eventType: 'setup_failed',
      subscriptionId: requiredString(
        metadata.habitta_subscription_id,
        'metadata.habitta_subscription_id',
      ),
      providerSetupRef: requiredString(object.id, 'checkout_session.id'),
      providerCustomerRef: optionalString(object.customer),
      paymentMethodRef: null,
      providerPaymentRef: null,
      amount: null,
      currency: null,
      occurredAt,
    };
  }

  if (event.type === 'payment_intent.succeeded' || event.type === 'payment_intent.payment_failed') {
    const metadata = metadataFrom(object.metadata);
    const currency = requiredString(object.currency, 'payment_intent.currency').toUpperCase();
    const minorAmount =
      event.type === 'payment_intent.succeeded'
        ? (numeric(object.amount_received) ?? numeric(object.amount))
        : numeric(object.amount);
    if (minorAmount === null) {
      throw new BillingProviderVerificationError('Stripe event is missing payment_intent.amount.');
    }

    return {
      provider: 'stripe',
      eventId: event.id,
      eventType: event.type === 'payment_intent.succeeded' ? 'charge_succeeded' : 'charge_failed',
      subscriptionId: requiredString(
        metadata.habitta_subscription_id,
        'metadata.habitta_subscription_id',
      ),
      providerSetupRef: null,
      providerCustomerRef: optionalString(object.customer),
      paymentMethodRef: optionalString(object.payment_method),
      providerPaymentRef: requiredString(object.id, 'payment_intent.id'),
      amount: amountFromMinorUnits(minorAmount, currency),
      currency,
      occurredAt,
    };
  }

  if (event.type === 'payment_method.detached') {
    return {
      provider: 'stripe',
      eventId: event.id,
      eventType: 'payment_method_removed',
      subscriptionId: null,
      providerSetupRef: null,
      providerCustomerRef: optionalString(object.customer),
      paymentMethodRef: requiredString(object.id, 'payment_method.id'),
      providerPaymentRef: null,
      amount: null,
      currency: null,
      occurredAt,
    };
  }

  throw new BillingProviderIgnoredEventError();
};

const createPaymentMethodSetup = async (
  env: NotificationBindings,
  input: BillingSetupInput,
): Promise<BillingSetupSession> => {
  const form = new URLSearchParams();
  form.set('mode', 'setup');
  form.set('customer_creation', 'always');
  form.append('payment_method_types[]', 'card');
  form.set(
    'success_url',
    addQuery(input.returnUrl, { billingSetup: 'success', attempt: input.attemptId }),
  );
  form.set(
    'cancel_url',
    addQuery(input.returnUrl, { billingSetup: 'cancelled', attempt: input.attemptId }),
  );
  form.set('client_reference_id', input.attemptId);
  form.set('metadata[habitta_attempt_id]', input.attemptId);
  form.set('metadata[habitta_subscription_id]', input.subscriptionId);
  form.set('metadata[habitta_condominium_id]', input.condominiumId);
  form.set('setup_intent_data[metadata][habitta_attempt_id]', input.attemptId);
  form.set('setup_intent_data[metadata][habitta_subscription_id]', input.subscriptionId);
  form.set('setup_intent_data[metadata][habitta_condominium_id]', input.condominiumId);

  const session = await stripeRequest<StripeCheckoutSession>(
    env,
    '/checkout/sessions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    },
    input.attemptId,
  );
  if (session.mode !== 'setup' || !session.url) {
    throw new BillingProviderRequestError('stripe_checkout_setup_session_invalid');
  }

  return {
    provider: 'stripe',
    providerSetupRef: session.id,
    providerCustomerRef: session.customer,
    expiresAt: new Date(session.expires_at * 1000).toISOString(),
    action: { kind: 'redirect', url: session.url },
  };
};

const chargeSavedPaymentMethod = async (
  env: NotificationBindings,
  input: BillingChargeInput,
): Promise<BillingChargeResult> => {
  const form = new URLSearchParams();
  form.set('amount', String(amountToMinorUnits(input.amount, input.currency)));
  form.set('currency', input.currency.toLowerCase());
  form.set('customer', input.providerCustomerRef);
  form.set('payment_method', input.paymentMethodRef);
  form.set('confirm', 'true');
  form.set('off_session', 'true');
  form.set('description', input.description);
  form.set('metadata[habitta_billing_attempt_id]', input.billingAttemptId);
  form.set('metadata[habitta_subscription_id]', input.subscriptionId);

  const { key } = stripeSecret(env);
  const response = await fetch(`${STRIPE_API_BASE}/payment_intents`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Idempotency-Key': input.billingAttemptId,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  });

  if (response.ok) {
    const paymentIntent = (await response.json()) as StripePaymentIntent;
    const status =
      paymentIntent.status === 'succeeded'
        ? ('succeeded' as const)
        : paymentIntent.status === 'processing'
          ? ('processing' as const)
          : ('failed' as const);
    return { provider: 'stripe', providerPaymentRef: paymentIntent.id, status };
  }

  let failure: StripePaymentError = {};
  try {
    failure = (await response.json()) as StripePaymentError;
  } catch {
    // Fall through to the generic provider failure below.
  }
  const failedIntent = failure.error?.payment_intent;
  if (failedIntent?.id) {
    return {
      provider: 'stripe',
      providerPaymentRef: failedIntent.id,
      status: 'failed',
      errorCode: failure.error?.code ?? failure.error?.type ?? 'stripe_payment_failed',
    };
  }

  throw new BillingProviderRequestError(
    `stripe_${failure.error?.code ?? failure.error?.type ?? `http_${response.status}`}`,
  );
};

export const createStripeBillingProvider = (env: NotificationBindings): BillingProviderAdapter => {
  stripeSecret(env);
  return {
    name: 'stripe',
    createPaymentMethodSetup: (input) => createPaymentMethodSetup(env, input),
    chargeSavedPaymentMethod: (input) => chargeSavedPaymentMethod(env, input),
    async verifyAndNormalizeWebhook(request) {
      const rawBody = await request.text();
      const { webhookSecret } = stripeSecret(env);
      await verifyStripeSignature(rawBody, request.headers.get('Stripe-Signature'), webhookSecret);

      let event: StripeEvent;
      try {
        event = JSON.parse(rawBody) as StripeEvent;
      } catch {
        throw new BillingProviderVerificationError('Stripe webhook body is not valid JSON.');
      }
      if (!event.id || !event.type || !Number.isFinite(event.created)) {
        throw new BillingProviderVerificationError('Stripe webhook event envelope is malformed.');
      }
      return normalizeStripeWebhook(env, event);
    },
  };
};
