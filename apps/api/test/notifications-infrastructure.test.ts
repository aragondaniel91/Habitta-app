import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveNotificationsEnvironment } from '../src/config/notifications-env';

const root = fileURLToPath(new URL('../../../', import.meta.url));

describe('notification environment modes', () => {
  it('defaults to disabled and requires a sandbox recipient', () => {
    expect(resolveNotificationsEnvironment({ APP_ENV: 'development' }).emailMode).toBe('disabled');
    expect(() =>
      resolveNotificationsEnvironment({
        APP_ENV: 'development',
        NOTIFICATIONS_EMAIL_MODE: 'sandbox',
      }),
    ).toThrow('notifications_sandbox_email_invalid');
  });
  it('rejects live delivery outside production', () => {
    expect(() =>
      resolveNotificationsEnvironment({ APP_ENV: 'development', NOTIFICATIONS_EMAIL_MODE: 'live' }),
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
  it('runs the disabled-mode synthetic smoke check without a provider call', () => {
    const output = execFileSync(process.execPath, ['scripts/cloudflare/notifications-smoke.mjs'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(output).toContain('"result":"skipped"');
    expect(output).toContain('"resendCalls":0');
  });
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
