-- HAB-133 operational notification vocabulary. Keep this migration separate because
-- PostgreSQL enum values cannot be consumed safely until the ALTER TYPE transaction commits.
alter type public.notification_event_type add value if not exists 'maintenance_quote_submitted';
alter type public.notification_event_type add value if not exists 'maintenance_quote_approved';
alter type public.notification_event_type add value if not exists 'maintenance_quote_rejected';
alter type public.notification_event_type add value if not exists 'maintenance_evidence_added';
alter type public.notification_event_type add value if not exists 'maintenance_expense_linked';

alter table public.notification_events
  drop constraint if exists notification_events_aggregate_type_check;
alter table public.notification_events
  add constraint notification_events_aggregate_type_check
  check (aggregate_type in ('receivable','payment','receipt','announcement','maintenance'));
