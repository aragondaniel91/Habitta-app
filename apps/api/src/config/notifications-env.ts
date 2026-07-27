export type NotificationsEmailMode = 'disabled' | 'sandbox' | 'live';

type NotificationEnvironment = {
  APP_ENV: string;
  NOTIFICATIONS_EMAIL_MODE?: string | undefined;
  NOTIFICATIONS_SANDBOX_EMAIL?: string | undefined;
};

export type NotificationsEnvironment = {
  appEnv: string;
  emailMode: NotificationsEmailMode;
  sandboxEmail: string | null;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const resolveNotificationsEnvironment = (
  env: NotificationEnvironment,
): NotificationsEnvironment => {
  const configuredMode = env.NOTIFICATIONS_EMAIL_MODE?.trim() || 'disabled';
  if (!['disabled', 'sandbox', 'live'].includes(configuredMode))
    throw new Error('notifications_email_mode_invalid');

  const emailMode = configuredMode as NotificationsEmailMode;
  const sandboxEmail = env.NOTIFICATIONS_SANDBOX_EMAIL?.trim() || null;
  if (emailMode === 'sandbox' && (!sandboxEmail || !emailPattern.test(sandboxEmail)))
    throw new Error('notifications_sandbox_email_invalid');
  if (emailMode === 'live' && env.APP_ENV !== 'production')
    throw new Error('notifications_live_mode_not_allowed');

  return { appEnv: env.APP_ENV, emailMode, sandboxEmail };
};
