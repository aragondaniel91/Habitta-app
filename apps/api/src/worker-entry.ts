import { app } from './security-entry';
import { consumeIntegrationQueue, enqueuePendingIntegrationEvents } from './integrations/worker';
import type {
  IntegrationBindings,
  IntegrationQueueMessage,
  WorkerQueueMessage,
} from './integrations/types';
import { consumeNotificationQueue, runScheduled } from './notifications/worker';
import type { NotificationQueueMessage } from './notifications/types';
import { runPaymentProofRetentionCleanup } from './payment-proof-retention';

const isIntegrationQueue = (queue: string) => queue.includes('integrations');

export default {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      Promise.all([
        runScheduled(env),
        enqueuePendingIntegrationEvents(env),
        runPaymentProofRetentionCleanup(env),
      ]),
    );
  },
  async queue(batch, env) {
    if (isIntegrationQueue(batch.queue)) {
      await consumeIntegrationQueue(batch as MessageBatch<IntegrationQueueMessage>, env);
      return;
    }
    await consumeNotificationQueue(batch as MessageBatch<NotificationQueueMessage>, env);
  },
} satisfies ExportedHandler<IntegrationBindings, WorkerQueueMessage>;
