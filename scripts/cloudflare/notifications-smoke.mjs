import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const runConsumerSmokeTest = () =>
  spawnSync(
    'pnpm',
    [
      '--filter',
      '@habitta/api',
      'exec',
      'vitest',
      'run',
      'test/notification-worker.test.ts',
      '-t',
      'marks disabled email delivery as skipped before contacting Resend',
    ],
    {
      encoding: 'utf8',
      shell: process.platform === 'win32',
      env: { ...process.env, NOTIFICATIONS_EMAIL_MODE: 'disabled' },
    },
  );

export const runDisabledNotificationsSmoke = ({
  emailMode = process.env.NOTIFICATIONS_EMAIL_MODE ?? 'disabled',
  run = runConsumerSmokeTest,
} = {}) => {
  if (emailMode !== 'disabled') throw new Error('notifications_smoke_requires_disabled_mode');
  const execution = run();
  if (execution.status !== 0) throw new Error('notifications_consumer_smoke_failed');
  return {
    deliveryId: randomUUID(),
    queueMessage: { deliveryId: 'synthetic' },
    resendCalls: 0,
    result: 'skipped',
    skipReason: 'email_delivery_disabled',
  };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runDisabledNotificationsSmoke();
  console.log(
    JSON.stringify({
      deliveryId: result.deliveryId,
      result: result.result,
      resendCalls: result.resendCalls,
    }),
  );
}
