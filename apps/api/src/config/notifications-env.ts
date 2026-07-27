export type NotificationsEmailMode = 'disabled' | 'sandbox' | 'live';

type NotificationEnvironment = {
  APP_ENV?: string | undefined;
  NOTIFICATIONS_EMAIL_MODE?: string | undefined;
  NOTIFICATIONS_SANDBOX_EMAIL?: string | undefined;
  RESEND_API_KEY?: string | undefined;
  NOTIFICATIONS_FROM_EMAIL?: string | undefined;
  NOTIFICATIONS_FROM_NAME?: string | undefined;
  APP_BASE_URL?: string | undefined;
};

export type NotificationsEnvironment = {
  appEnv: string;
  emailMode: NotificationsEmailMode;
  sandboxEmail: string | null;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isHttpUrl = (value: string) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

export const resolveNotificationsEnvironment = (
  env: NotificationEnvironment,
): NotificationsEnvironment => {
  const appEnv = env.APP_ENV?.trim() || 'development';
  const configuredMode = env.NOTIFICATIONS_EMAIL_MODE?.trim() || 'disabled';
  if (!['disabled', 'sandbox', 'live'].includes(configuredMode))
    throw new Error('notifications_email_mode_invalid');

  const emailMode = configuredMode as NotificationsEmailMode;
  const sandboxEmail = env.NOTIFICATIONS_SANDBOX_EMAIL?.trim().toLowerCase() || null;
  if (emailMode === 'live' && appEnv !== 'production')
    throw new Error('notifications_live_mode_not_allowed');

  if (emailMode !== 'disabled') {
    if (emailMode === 'sandbox' && (!sandboxEmail || !emailPattern.test(sandboxEmail)))
      throw new Error('notifications_sandbox_email_invalid');
    if (!env.RESEND_API_KEY?.trim()) throw new Error('notifications_resend_key_missing');
    if (!env.NOTIFICATIONS_FROM_EMAIL?.trim() || !emailPattern.test(env.NOTIFICATIONS_FROM_EMAIL))
      throw new Error('notifications_from_email_invalid');
    if (!env.NOTIFICATIONS_FROM_NAME?.trim()) throw new Error('notifications_from_name_missing');
    if (!env.APP_BASE_URL?.trim() || !isHttpUrl(env.APP_BASE_URL))
      throw new Error('notifications_app_base_url_invalid');
  }

  return { appEnv, emailMode, sandboxEmail };
};
