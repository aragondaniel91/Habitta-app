import type { NotificationBindings, NotificationQueueMessage } from '../notifications/types';

export type IntegrationQueueMessage = { outboxId: string };

export type IntegrationBindings = NotificationBindings & {
  INTEGRATION_QUEUE: Queue<IntegrationQueueMessage>;
};

export type IntegrationOutboxEvent = {
  id: string;
  condominium_id: string | null;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string | null;
  payload: Record<string, unknown>;
  correlation_id: string | null;
  attempts: number;
};

export type WorkerQueueMessage = NotificationQueueMessage | IntegrationQueueMessage;
