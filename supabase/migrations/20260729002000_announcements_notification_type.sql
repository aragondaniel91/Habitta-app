alter type public.notification_event_type add value if not exists 'announcement_published';

alter table public.notification_events
  drop constraint if exists notification_events_aggregate_type_check;

alter table public.notification_events
  add constraint notification_events_aggregate_type_check
  check (aggregate_type in ('receivable', 'payment', 'receipt', 'announcement'));
