import { resolveNotificationsEnvironment } from '../config/notifications-env';
import { runSaasBilling } from '../saas-billing';
import { runWithBoundedConcurrency } from './concurrency';
import { sendNotificationEmail } from './email-provider';
import { renderNotificationEmail } from './renderer';
import type { NotificationBindings, NotificationDelivery, NotificationQueueMessage } from './types';

const EVENT_PROCESS_CONCURRENCY = 4;
const QUEUE_ENQUEUE_CONCURRENCY = 5;
const QUEUE_DELIVERY_CONCURRENCY = 5;

export const serviceRpc = async <T>(env: NotificationBindings, name: string, payload: unknown) => {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`rpc_${name}_failed`);
  return (await response.json()) as T;
};

export const enqueuePendingNotifications = async (env: NotificationBindings) => {
  const events = await serviceRpc<{ id: string }[]>(env, 'claim_notification_events', {
    limit_count: 50,
  });
  await runWithBoundedConcurrency(events, EVENT_PROCESS_CONCURRENCY, async (event) => {
    await serviceRpc<boolean>(env, 'process_notification_event', { target: event.id });
  });

  const deliveries = await serviceRpc<{ id: string }[]>(env, 'claim_due_notification_deliveries', {
    limit_count: 25,
  });
  await runWithBoundedConcurrency(deliveries, QUEUE_ENQUEUE_CONCURRENCY, async (delivery) => {
    await env.NOTIFICATION_QUEUE.send({ deliveryId: delivery.id });
  });
};

export const runScheduled = async (env: NotificationBindings, runAt = new Date()) => {
  resolveNotificationsEnvironment(env);
  await serviceRpc<number>(env, 'publish_due_announcements', {
    run_at: runAt.toISOString(),
  });
  await serviceRpc<number>(env, 'generate_due_notification_events', {
    run_at: runAt.toISOString(),
  });
  await serviceRpc<number>(env, 'generate_governance_due_notification_events', {
    run_at: runAt.toISOString(),
  });
  await enqueuePendingNotifications(env);

  // SaaS billing is isolated from resident notification work. A provider outage is logged and left
  // for the idempotent billing retry path; it must never prevent announcements/notifications from
  // completing their own scheduled cycle.
  try {
    await runSaasBilling(env, runAt);
  } catch (error) {
    console.error({
      event: 'saas_billing_scheduler_failed',
      environment: env.APP_ENV,
      runAt: runAt.toISOString(),
      error: error instanceof Error ? error.message : 'unknown_billing_error',
    });
  }
};

const finish = (
  env: NotificationBindings,
  delivery: NotificationDelivery,
  errorCode: string | null,
  retryable: boolean,
  providerId: string | null = null,
) =>
  serviceRpc(env, 'finish_notification_delivery', {
    target: delivery.id,
    provider_id: providerId,
    error_code: errorCode,
    retryable,
  });

export const processNotificationDelivery = async (
  message: NotificationQueueMessage,
  env: NotificationBindings,
) => {
  const delivery = await serviceRpc<NotificationDelivery | null>(
    env,
    'claim_notification_delivery',
    { target: message.deliveryId, worker: 'cloudflare-queue' },
  );
  if (!delivery) return 'ignored' as const;

  const stillAllowed = await serviceRpc<boolean>(env, 'should_send_notification_delivery', {
    target: delivery.id,
  });
  if (!stillAllowed) {
    await serviceRpc(env, 'skip_notification_delivery', {
      target: delivery.id,
      reason: 'email_disabled_at_delivery',
    });
    return 'skipped' as const;
  }

  let environment;
  try {
    environment = resolveNotificationsEnvironment(env);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'notifications_environment_invalid';
    await finish(env, delivery, code, false);
    return 'dead' as const;
  }
  if (environment.emailMode === 'disabled') {
    await serviceRpc(env, 'skip_notification_delivery', {
      target: delivery.id,
      reason: 'email_delivery_disabled',
    });
    return 'skipped' as const;
  }
  if (!delivery.recipient_email) {
    await finish(env, delivery, 'recipient_email_unavailable', false);
    return 'dead' as const;
  }
  let rendered;
  try {
    rendered = renderNotificationEmail(delivery.template_key, delivery.payload, env.APP_BASE_URL);
  } catch {
    await finish(env, delivery, 'template_invalid', false);
    return 'dead' as const;
  }

  const recipient =
    environment.emailMode === 'sandbox' ? environment.sandboxEmail : delivery.recipient_email;
  if (!recipient) {
    await finish(env, delivery, 'sandbox_recipient_unavailable', false);
    return 'dead' as const;
  }
  const subject =
    environment.emailMode === 'sandbox' ? `[HABITTA DEV] ${rendered.subject}` : rendered.subject;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const result = await sendNotificationEmail(
      env,
      environment.emailProvider,
      {
        fromEmail: env.NOTIFICATIONS_FROM_EMAIL,
        fromName: env.NOTIFICATIONS_FROM_NAME,
        to: recipient,
        subject,
        html: rendered.html,
        text: rendered.text,
        deduplicationKey: delivery.deduplication_key,
      },
      controller.signal,
    );
    if (result.ok) {
      await finish(env, delivery, null, false, result.providerId);
      return 'sent' as const;
    }
    await finish(env, delivery, result.errorCode, result.retryable);
    return result.retryable ? ('retry' as const) : ('dead' as const);
  } catch {
    await finish(env, delivery, 'email_provider_unexpected_error', true);
    return 'retry' as const;
  } finally {
    clearTimeout(timeout);
  }
};

export const consumeNotificationQueue = async (
  batch: MessageBatch<NotificationQueueMessage>,
  env: NotificationBindings,
) => {
  await runWithBoundedConcurrency(batch.messages, QUEUE_DELIVERY_CONCURRENCY, async (message) => {
    try {
      const outcome = await processNotificationDelivery(message.body, env);
      if (outcome === 'retry') message.retry();
      else message.ack();
    } catch {
      message.retry();
    }
  });
};
