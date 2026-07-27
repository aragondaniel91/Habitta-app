export type Notification = {
  id: string;
  condominium_id: string;
  notification_type: string;
  title: string;
  body: string;
  action_url: string | null;
  read_at: string | null;
  created_at: string;
};

export type NotificationPreference = {
  condominium_id: string;
  notification_type: string;
  in_app_enabled: boolean;
  email_enabled: boolean;
};
