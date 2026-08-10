export type NotificationQueueMessage = { deliveryId: string };

export type NotificationBindings = {
  APP_ENV: string;
  NOTIFICATIONS_EMAIL_MODE?: string | undefined;
  NOTIFICATIONS_EMAIL_PROVIDER?: string | undefined;
  NOTIFICATIONS_SANDBOX_EMAIL?: string | undefined;
  BUILD_COMMIT?: string;
  BUILD_TIMESTAMP?: string;
  APP_VERSION?: string;
  CORS_ALLOWED_ORIGINS?: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  PAYMENT_PROOFS: R2Bucket;
  NOTIFICATION_QUEUE: Queue<NotificationQueueMessage>;
  /**
   * Cloudflare rate limiters. Distributed by the platform rather than counted in the isolate,
   * which could never hold a shared total. Optional so tests and local runs work without them.
   */
  PROOF_UPLOAD_LIMIT?: RateLimit;
  INVITATION_LIMIT?: RateLimit;
  REQUEST_LIMIT?: RateLimit;
  RESEND_API_KEY?: string;
  ZEPTOMAIL_SEND_TOKEN?: string;
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
