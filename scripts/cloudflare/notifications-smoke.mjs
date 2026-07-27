import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const runDisabledNotificationsSmoke = (
  emailMode = process.env.NOTIFICATIONS_EMAIL_MODE ?? 'disabled',
) => {
  if (emailMode !== 'disabled') throw new Error('notifications_smoke_requires_disabled_mode');
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
