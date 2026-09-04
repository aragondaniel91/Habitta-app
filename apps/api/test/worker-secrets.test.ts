import { describe, expect, it } from 'vitest';
import { workerSecretsContent } from '../../../scripts/release/create-worker-secrets-file.mjs';

const supabaseSecrets = {
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
};

describe('worker secret file provider and email gating', () => {
  it('does not require or include ZeptoMail or Stripe while optional providers are disabled', () => {
    expect(JSON.parse(workerSecretsContent(supabaseSecrets))).toEqual(supabaseSecrets);
  });

  it('keeps sandbox compatible when the token is already persisted remotely', () => {
    expect(
      JSON.parse(workerSecretsContent({ ...supabaseSecrets, NOTIFICATIONS_EMAIL_MODE: 'sandbox' })),
    ).toEqual(supabaseSecrets);
  });

  it('fails closed without ZeptoMail in live mode', () => {
    expect(() =>
      workerSecretsContent({ ...supabaseSecrets, NOTIFICATIONS_EMAIL_MODE: 'live' }),
    ).toThrow('worker_email_secret_missing');
  });

  it.each(['sandbox', 'live'])('includes ZeptoMail when supplied for %s mode', (mode) => {
    expect(
      JSON.parse(
        workerSecretsContent({
          ...supabaseSecrets,
          NOTIFICATIONS_EMAIL_MODE: mode,
          ZEPTOMAIL_SEND_TOKEN: 'zepto-token',
        }),
      ),
    ).toEqual({ ...supabaseSecrets, ZEPTOMAIL_SEND_TOKEN: 'zepto-token' });
  });

  it.each([
    {},
    { STRIPE_SECRET_KEY: 'sk_live_test' },
    { STRIPE_WEBHOOK_SECRET: 'whsec_test' },
  ])('fails closed when Stripe is selected without both Worker secrets', (stripeSecrets) => {
    expect(() =>
      workerSecretsContent({
        ...supabaseSecrets,
        BILLING_PROVIDER: 'stripe',
        ...stripeSecrets,
      }),
    ).toThrow('worker_stripe_secrets_missing');
  });

  it('includes Stripe secrets only when Stripe is the selected billing provider', () => {
    const stripeSecrets = {
      STRIPE_SECRET_KEY: 'sk_live_test',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
    };

    expect(
      JSON.parse(
        workerSecretsContent({
          ...supabaseSecrets,
          BILLING_PROVIDER: 'stripe',
          ...stripeSecrets,
        }),
      ),
    ).toEqual({ ...supabaseSecrets, ...stripeSecrets });

    expect(
      JSON.parse(
        workerSecretsContent({
          ...supabaseSecrets,
          BILLING_PROVIDER: 'mock',
          ...stripeSecrets,
        }),
      ),
    ).toEqual(supabaseSecrets);
  });
});
