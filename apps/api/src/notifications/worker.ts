import { renderNotificationEmail } from './renderer';
import { resolveNotificationsEnvironment } from '../config/notifications-env';
import type { NotificationBindings, NotificationDelivery, NotificationQueueMessage } from './types';

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
  for (const event of events)
    await serviceRpc<boolean>(env, 'process_notification_event', { target: event.id });
  const deliveries = await serviceRpc<{ id: string }[]>(env, 'claim_due_notification_deliveries', {
    limit_count: 100,
  });
  for (const delivery of deliveries) await env.NOTIFICATION_QUEUE.send({ deliveryId: delivery.id });
};

export const runScheduled = async (env: NotificationBindings, runAt = new Date()) => {
  await serviceRpc<number>(env, 'generate_due_notification_events', {
    run_at: runAt.toISOString(),
  });
  await enqueuePendingNotifications(env);
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': delivery.deduplication_key,
      },
      body: JSON.stringify({
        from: `${env.NOTIFICATIONS_FROM_NAME} <${env.NOTIFICATIONS_FROM_EMAIL}>`,
        to: [
          environment.emailMode === 'sandbox' ? environment.sandboxEmail : delivery.recipient_email,
        ],
        subject:
          environment.emailMode === 'sandbox'
            ? `[HABITTA DEV] ${rendered.subject}`
            : rendered.subject,
        html: rendered.html,
        text: rendered.text,
      }),
    });
    const result = (await response.json().catch(() => ({}))) as { id?: string };
    if (response.ok) {
      await finish(env, delivery, null, false, result.id ?? null);
      return 'sent' as const;
    }
    const retryable = response.status === 429 || response.status >= 500;
    await finish(env, delivery, `resend_${response.status}`, retryable);
    return retryable ? ('retry' as const) : ('dead' as const);
  } catch {
    await finish(env, delivery, 'resend_network_error', true);
    return 'retry' as const;
  } finally {
    clearTimeout(timeout);
  }
};

export const consumeNotificationQueue = async (
  batch: MessageBatch<NotificationQueueMessage>,
  env: NotificationBindings,
) => {
  for (const message of batch.messages) {
    try {
      const outcome = await processNotificationDelivery(message.body, env);
      if (outcome === 'retry') message.retry();
      else message.ack();
    } catch {
      message.retry();
    }
  }
};
