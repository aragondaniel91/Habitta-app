import type { NotificationBindings } from './notifications/types';

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const STRIPE_SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

export type BillingSetupInput = {
  attemptId: string;
  subscriptionId: string;
  condominiumId: string;
  returnUrl: string;
};

export type BillingSetupSession = {
  provider: string;
  providerSetupRef: string;
  providerCustomerRef: string | null;
  expiresAt: string;
  action: {
    kind: 'redirect';
    url: string;
  };
};

export type BillingChargeInput = {
  billingAttemptId: string;
  subscriptionId: string;
  providerCustomerRef: string;
  paymentMethodRef: string;
  amount: number;
  currency: string;
  description: string;
};

export type BillingChargeResult = {
  provider: string;
  providerPaymentRef: string;
  status: 'processing' | 'succeeded' | 'failed';
};

export type NormalizedBillingProviderEvent = {
  provider: string;
  eventId: string;
  eventType:
    | 'payment_method_ready'
    | 'payment_method_removed'
    | 'setup_failed'
    | 'charge_succeeded'
    | 'charge_failed';
  subscriptionId: string | null;
  providerSetupRef: string | null;
  providerCustomerRef: string | null;
  paymentMethodRef: string | null;
  providerPaymentRef: string | null;
  amount: number | null;
  currency: string | null;
  occurredAt: string;
};

export interface BillingProviderAdapter {
  readonly name: string;
  createPaymentMethodSetup(input: BillingSetupInput): Promise<BillingSetupSession>;
  chargeSavedPaymentMethod(input: BillingChargeInput): Promise<BillingChargeResult>;
  verifyAndNormalizeWebhook(request: Request): Promise<NormalizedBillingProviderEvent>;
}

export class BillingProviderUnavailableError extends Error {
  constructor(message = 'Billing provider is not configured.') {
    super(message);
    this.name = 'BillingProviderUnavailableError';
  }
}

export class BillingProviderVerificationError extends Error {
  constructor(message = 'Billing provider webhook verification failed.') {
    super(message);
    this.name = 'BillingProviderVerificationError';
  }
}

export class BillingProviderIgnoredEventError extends Error {
  constructor(message = 'Billing provider event is not used by Habitta.') {
    super(message);
    this.name = 'BillingProviderIgnoredEventError';
  }
}

class BillingProviderRequestError extends Error {
  constructor(message = 'Billing provider request failed.') {
    super(message);
    this.name = 'BillingProviderRequestError';
  }
}

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
    await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(`${timestamp}.${rawBody}`),
    ),
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
    return payload.error?.code ?? payload.error?.type ?? payload.error?.message ?? `http_${response.status}`;
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
const numeric = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
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
  metadata?: Record<string, string>;
};

type StripeSetupIntent = {
  id: string;
  status: string;
  customer: string | null;
  payment_method: string | null;
  metadata?: Record<string, string>;
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

const stripeBillingProvider = (env: NotificationBindings): BillingProviderAdapter => {
  stripeSecret(env);
  return {
    name: 'stripe',
    async createPaymentMethodSetup(input) {
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
        action: { kind: 'redirect' as const, url: session.url },
      };
    },
    async chargeSavedPaymentMethod(input) {
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

      const paymentIntent = await stripeRequest<{ id: string; status: string }>(
        env,
        '/payment_intents',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: form,
        },
        input.billingAttemptId,
      );

      const status =
        paymentIntent.status === 'succeeded'
          ? ('succeeded' as const)
          : paymentIntent.status === 'processing'
            ? ('processing' as const)
            : ('failed' as const);
      return { provider: 'stripe', providerPaymentRef: paymentIntent.id, status };
    },
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

// A deterministic contract adapter for local/CI development only. It deliberately does not mark a
// payment method ready and cannot be enabled in production. Its only job is to exercise the
// provider boundary without making network calls.
const mockBillingProvider = (): BillingProviderAdapter => ({
  name: 'mock',
  async createPaymentMethodSetup(input) {
    const suffix = input.attemptId.replaceAll('-', '').slice(0, 20);
    return {
      provider: 'mock',
      providerSetupRef: `set_mock_${suffix}`,
      providerCustomerRef: `cus_mock_${input.subscriptionId.replaceAll('-', '').slice(0, 20)}`,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      action: {
        kind: 'redirect',
        url: addQuery(input.returnUrl, { billingSetup: 'mock', attempt: input.attemptId }),
      },
    };
  },
  async chargeSavedPaymentMethod() {
    throw new BillingProviderUnavailableError('Mock billing provider never creates charges.');
  },
  async verifyAndNormalizeWebhook() {
    throw new BillingProviderUnavailableError(
      'Mock billing provider never accepts webhook traffic. Use DB-level provider event fixtures in tests.',
    );
  },
});

export function resolveBillingProvider(env: NotificationBindings): BillingProviderAdapter {
  const configured = env.BILLING_PROVIDER?.trim().toLowerCase();
  if (!configured) throw new BillingProviderUnavailableError();

  if (configured === 'mock') {
    if (env.APP_ENV === 'production') {
      throw new BillingProviderUnavailableError(
        'Mock billing provider is forbidden in production.',
      );
    }
    return mockBillingProvider();
  }

  if (configured === 'stripe') return stripeBillingProvider(env);

  throw new BillingProviderUnavailableError(`Unsupported billing provider: ${configured}`);
}
