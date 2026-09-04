import { createHmac } from 'node:crypto';

const STRIPE_API_BASE = 'https://api.stripe.com/v1';

const required = (value, name) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`missing_${name}`);
  return normalized;
};

export const stripeWebhookSignature = ({ secret, timestamp, rawBody }) =>
  createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');

export const verifyProductionStripe = async ({
  secretKey,
  webhookSecret,
  workerUrl,
  now = Date.now(),
  fetchImpl = fetch,
}) => {
  const key = required(secretKey, 'stripe_secret_key');
  const signingSecret = required(webhookSecret, 'stripe_webhook_secret');
  const apiUrl = required(workerUrl, 'cloudflare_worker_prod_url').replace(/\/$/, '');

  // Read-only provider probe. This proves the production key can authenticate with Stripe without
  // creating a Checkout Session, SetupIntent, PaymentIntent, charge, Customer or any other object.
  const accountResponse = await fetchImpl(`${STRIPE_API_BASE}/account`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!accountResponse.ok) {
    throw new Error(`stripe_account_probe_failed:${accountResponse.status}`);
  }

  let account;
  try {
    account = await accountResponse.json();
  } catch {
    throw new Error('stripe_account_probe_invalid_json');
  }
  if (typeof account?.id !== 'string' || !account.id.startsWith('acct_')) {
    throw new Error('stripe_account_probe_invalid_account');
  }

  // Exercise the exact production Worker webhook verifier with a correctly signed event type that
  // Habitta deliberately ignores. The route returns before any service-role RPC, so this proves the
  // deployed signing secret and cryptographic path without mutating Habitta commercial state.
  const timestamp = Math.floor(now / 1000);
  const rawBody = JSON.stringify({
    id: `evt_habitta_release_probe_${timestamp}`,
    object: 'event',
    created: timestamp,
    type: 'habitta.production_release_probe',
    data: { object: { object: 'habitta_release_probe' } },
  });
  const signature = stripeWebhookSignature({
    secret: signingSecret,
    timestamp,
    rawBody,
  });
  const webhookResponse = await fetchImpl(`${apiUrl}/billing/webhooks/stripe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Stripe-Signature': `t=${timestamp},v1=${signature}`,
    },
    body: rawBody,
  });
  if (!webhookResponse.ok) {
    throw new Error(`stripe_webhook_probe_failed:${webhookResponse.status}`);
  }

  let webhookPayload;
  try {
    webhookPayload = await webhookResponse.json();
  } catch {
    throw new Error('stripe_webhook_probe_invalid_json');
  }
  if (webhookPayload?.received !== true || webhookPayload?.ignored !== true) {
    throw new Error('stripe_webhook_probe_not_safely_ignored');
  }

  return {
    accountId: account.id,
    webhookVerified: true,
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await verifyProductionStripe({
      secretKey: process.env.STRIPE_SECRET_KEY,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      workerUrl: process.env.CLOUDFLARE_WORKER_PROD_URL,
    });
    console.log(
      'production Stripe verification passed: account API reachable and signed Worker webhook probe accepted without charges or state mutation.',
    );
  } catch (error) {
    console.error(
      `production Stripe verification failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}
