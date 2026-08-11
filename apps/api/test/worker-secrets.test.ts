import { describe, expect, it } from 'vitest';
import { workerSecretsContent } from '../../../scripts/release/create-worker-secrets-file.mjs';

const supabaseSecrets = {
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
};

describe('worker secret file email gating', () => {
  it('does not require or include ZeptoMail while email is disabled', () => {
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
});
