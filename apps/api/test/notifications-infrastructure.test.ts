import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveNotificationsEnvironment } from '../src/config/notifications-env';

const root = fileURLToPath(new URL('../../../', import.meta.url));

const providerConfiguration = {
  RESEND_API_KEY: 'test-key',
  NOTIFICATIONS_FROM_EMAIL: 'no-reply@habitta.test',
  NOTIFICATIONS_FROM_NAME: 'Habitta',
  APP_BASE_URL: 'https://habitta.test',
};

const zeptoMailConfiguration = {
  NOTIFICATIONS_EMAIL_PROVIDER: 'zeptomail',
  ZEPTOMAIL_SEND_TOKEN: 'test-token',
  NOTIFICATIONS_FROM_EMAIL: 'notifications@habitta.test',
  NOTIFICATIONS_FROM_NAME: 'Habitta',
  APP_BASE_URL: 'https://habitta.test',
};

describe('notification environment modes', () => {
  it('defaults to disabled without requiring provider secrets', () => {
    expect(resolveNotificationsEnvironment({ APP_ENV: 'development' })).toEqual({
      appEnv: 'development',
      emailMode: 'disabled',
      emailProvider: 'resend',
      sandboxEmail: null,
    });
  });
  it('requires a valid sandbox recipient and provider configuration', () => {
    expect(() =>
      resolveNotificationsEnvironment({
        APP_ENV: 'development',
        NOTIFICATIONS_EMAIL_MODE: 'sandbox',
      }),
    ).toThrow('notifications_sandbox_email_invalid');
    expect(() =>
      resolveNotificationsEnvironment({
        APP_ENV: 'development',
        NOTIFICATIONS_EMAIL_MODE: 'sandbox',
        NOTIFICATIONS_SANDBOX_EMAIL: 'sandbox@habitta.test',
      }),
    ).toThrow('notifications_resend_key_missing');
    expect(
      resolveNotificationsEnvironment({
        APP_ENV: 'development',
        NOTIFICATIONS_EMAIL_MODE: 'sandbox',
        NOTIFICATIONS_SANDBOX_EMAIL: 'Sandbox@Habitta.test',
        ...providerConfiguration,
      }).sandboxEmail,
    ).toBe('sandbox@habitta.test');
  });
  it('requires the ZeptoMail token when ZeptoMail is selected', () => {
    expect(() =>
      resolveNotificationsEnvironment({
        APP_ENV: 'development',
        NOTIFICATIONS_EMAIL_MODE: 'sandbox',
        NOTIFICATIONS_EMAIL_PROVIDER: 'zeptomail',
        NOTIFICATIONS_SANDBOX_EMAIL: 'sandbox@habitta.test',
        NOTIFICATIONS_FROM_EMAIL: 'notifications@habitta.test',
        NOTIFICATIONS_FROM_NAME: 'Habitta',
        APP_BASE_URL: 'https://habitta.test',
      }),
    ).toThrow('notifications_zeptomail_token_missing');
    expect(
      resolveNotificationsEnvironment({
        APP_ENV: 'development',
        NOTIFICATIONS_EMAIL_MODE: 'sandbox',
        NOTIFICATIONS_SANDBOX_EMAIL: 'sandbox@habitta.test',
        ...zeptoMailConfiguration,
      }).emailProvider,
    ).toBe('zeptomail');
  });
  it('rejects live delivery outside production', () => {
    expect(() =>
      resolveNotificationsEnvironment({
        APP_ENV: 'development',
        NOTIFICATIONS_EMAIL_MODE: 'live',
        ...providerConfiguration,
      }),
    ).toThrow('notifications_live_mode_not_allowed');
  });
});

describe('notification development scripts', () => {
  it('validates the checked-in configuration without remote calls', () => {
    const output = execFileSync(
      process.execPath,
      ['scripts/cloudflare/validate-notifications-config.mjs'],
      {
        cwd: root,
        encoding: 'utf8',
      },
    );
    expect(output).toContain('notifications configuration is valid');
  });
  it('runs the disabled-mode consumer smoke check without a provider call', () => {
    const output = execFileSync(process.execPath, ['scripts/cloudflare/notifications-smoke.mjs'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(output).toContain('"result":"skipped"');
    expect(output).toContain('"resendCalls":0');
  }, 15000);
  it('prints an idempotent provisioning plan without calling Cloudflare', () => {
    const output = execFileSync(
      process.execPath,
      ['scripts/cloudflare/provision-notifications-dev.mjs'],
      {
        cwd: root,
        encoding: 'utf8',
      },
    );
    expect(output).toContain('"mode": "dry-run"');
    expect(output).toContain('habitta-notifications-dlq-dev');
  });
});
