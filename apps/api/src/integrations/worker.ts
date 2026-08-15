import { serviceRpc } from '../notifications/worker';
import type {
  IntegrationBindings,
  IntegrationOutboxEvent,
  IntegrationQueueMessage,
} from './types';

export const enqueuePendingIntegrationEvents = async (env: IntegrationBindings) => {
  const events = await serviceRpc<{ id: string }[]>(env, 'claim_due_integration_outbox', {
    limit_count: 50,
  });

  for (const event of events) {
    await env.INTEGRATION_QUEUE.send({ outboxId: event.id });
    await serviceRpc<boolean>(env, 'mark_integration_outbox_queued', { target: event.id });
  }
};

export const processIntegrationOutboxMessage = async (
  message: IntegrationQueueMessage,
  env: IntegrationBindings,
) => {
  const event = await serviceRpc<IntegrationOutboxEvent | null>(
    env,
    'claim_integration_outbox_event',
    { target: message.outboxId, worker: 'cloudflare-queue' },
  );
  if (!event) return 'ignored' as const;

  // Foundation only: the durable database outbox has now crossed the asynchronous transport
  // boundary. Future provider/webhook adapters will fan out from this point into their own
  // idempotent delivery records. We intentionally do not contact third parties in this increment.
  await serviceRpc<boolean>(env, 'complete_integration_outbox_event', { target: event.id });
  return 'consumed' as const;
};

export const consumeIntegrationQueue = async (
  batch: MessageBatch<IntegrationQueueMessage>,
  env: IntegrationBindings,
) => {
  for (const message of batch.messages) {
    try {
      await processIntegrationOutboxMessage(message.body, env);
      message.ack();
    } catch {
      message.retry();
    }
  }
};
