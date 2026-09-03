import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const securityEntry = read('./security-entry.ts');
const billingRoutes = read('./billing-routes.ts');
const webhookRoutes = read('./billing-webhook-routes.ts');
const stripeProvider = read('./stripe-billing-provider.ts');
const scheduler = read('./saas-billing.ts');
const wrangler = read('../wrangler.jsonc');

describe('HAB-436 billing surface contract', () => {
  it('mounts provider webhooks outside authenticated /v1 routes and verifies before reducer RPC', () => {
    expect(securityEntry).toContain("app.route('/billing/webhooks', billingWebhookRoutes)");
    expect(securityEntry).not.toContain("app.route('/v1/billing/webhooks'");
    expect(webhookRoutes).toContain('provider.verifyAndNormalizeWebhook(c.req.raw)');
    expect(webhookRoutes).toContain("'apply_billing_provider_event_v1'");
  });

  it('allows the browser idempotency header without exposing provider secrets', () => {
    expect(securityEntry).toContain("'Idempotency-Key'");
    expect(billingRoutes).toContain("c.req.header('Idempotency-Key')");
    expect(billingRoutes).toContain('c.env.SUPABASE_SERVICE_ROLE_KEY');
    expect(billingRoutes).not.toMatch(/STRIPE_(SECRET_KEY|WEBHOOK_SECRET)/);
  });

  it('pins production to Stripe and makes both Stripe secrets release requirements', () => {
    expect(wrangler).toContain('"BILLING_PROVIDER": "stripe"');
    expect(wrangler).toContain('"STRIPE_SECRET_KEY"');
    expect(wrangler).toContain('"STRIPE_WEBHOOK_SECRET"');
    expect(wrangler).toContain('"BILLING_PROVIDER": "mock"');
  });

  it('uses Stripe only as setup/payment execution, never Stripe subscription or price authority', () => {
    expect(stripeProvider).toContain("form.set('mode', 'setup')");
    expect(stripeProvider).toContain("form.set('off_session', 'true')");
    expect(stripeProvider).toContain("'/checkout/sessions'");
    expect(stripeProvider).toContain('`${STRIPE_API_BASE}/payment_intents`');
    expect(stripeProvider).not.toContain("'/subscriptions'");
    expect(stripeProvider).not.toContain("'/prices'");
  });

  it('schedules charges from Habitta-owned expected amounts and same-attempt retries', () => {
    expect(scheduler).toContain("'claim_due_saas_billing_attempts_v1'");
    expect(scheduler).toContain('amount: attempt.expected_amount');
    expect(scheduler).toContain('billingAttemptId: attempt.attempt_id');
    expect(scheduler).toContain("'release_saas_billing_attempt_for_retry_v1'");
  });
});
