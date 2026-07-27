export type NotificationQueueMessage = { deliveryId: string };

export type NotificationBindings = {
  APP_ENV: string;
  NOTIFICATIONS_EMAIL_MODE?: string | undefined;
  NOTIFICATIONS_SANDBOX_EMAIL?: string | undefined;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  PAYMENT_PROOFS: R2Bucket;
  NOTIFICATION_QUEUE: Queue<NotificationQueueMessage>;
  RESEND_API_KEY: string;
  NOTIFICATIONS_FROM_EMAIL: string;
  NOTIFICATIONS_FROM_NAME: string;
  APP_BASE_URL: string;
};

export type NotificationDelivery = {
  id: string;
  recipient_email: string | null;
  template_key: string;
  payload: Record<string, unknown>;
  deduplication_key: string;
  attempts: number;
};

export type RenderedEmail = { subject: string; html: string; text: string };
