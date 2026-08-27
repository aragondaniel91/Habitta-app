-- HAB-SEC-001: nine internal functions were executable by `anon`.
--
-- Root cause, and it is systemic rather than a one-off. Five migrations wrote
--
--   revoke all on function ... from public, authenticated;
--
-- and never revoked from `anon`. In Supabase `anon` holds its own direct EXECUTE grant, which
-- `REVOKE ... FROM PUBLIC` does not remove, so the lockdown those migrations intended silently
-- left the anonymous role behind. The asymmetry is the tell: every function below was executable
-- by `anon` and *not* by `authenticated`. The rest of this repository uses `from public, anon`
-- correctly in 143 places.
--
-- Demonstrated impact, reproduced locally against these exact migrations: an anonymous caller with
-- no token called `claim_notification_events`, claimed a real pending event, incremented its
-- attempts and deferred it five minutes. Repeated on a timer that exhausts the retry budget and
-- the events are marked failed, so payment reminders, overdue notices and announcements stop
-- reaching residents -- across every condominium at once, silently, with nothing in the audit log.
-- The credential needed is the anon key, which ships in the browser bundle by design.
--
-- `insert_receivable_item_and_entry` is the same gap reaching the ledger: it creates a receivable
-- item and its entry under SECURITY DEFINER. It is not exploitable today only because
-- `receivable_items.created_by` is NOT NULL and `auth.uid()` is null for `anon`, so the insert
-- fails on a schema constraint. It was defended by accident, not by design.
--
-- These functions are called exclusively by the Worker's scheduled and queue handlers, which
-- authenticate as `service_role`. That grant is untouched below, so the pipeline keeps working.

revoke execute on function
  public.claim_notification_events(integer),
  public.emit_notification_event(uuid, public.notification_event_type, text, uuid, uuid, uuid, jsonb, text),
  public.expand_notification_event(uuid),
  public.publish_due_announcements(timestamptz),
  public.skip_notification_delivery(uuid, text),
  public.finalize_announcement_publication(uuid, uuid),
  public.can_receive_condominium_notifications(uuid),
  public.insert_receivable_item_and_entry(uuid, uuid, uuid, uuid, public.receivable_item_type, public.ledger_entry_type, public.ledger_direction, text, numeric, text, date, date),
  public.validate_payment_allocations(uuid, uuid, jsonb, boolean)
from anon, public;

-- Re-state the intended grant so the pipeline's own role is explicit and survives a later
-- `revoke ... from public` that would otherwise take it away.
grant execute on function
  public.claim_notification_events(integer),
  public.emit_notification_event(uuid, public.notification_event_type, text, uuid, uuid, uuid, jsonb, text),
  public.expand_notification_event(uuid),
  public.publish_due_announcements(timestamptz),
  public.skip_notification_delivery(uuid, text),
  public.finalize_announcement_publication(uuid, uuid),
  public.can_receive_condominium_notifications(uuid),
  public.insert_receivable_item_and_entry(uuid, uuid, uuid, uuid, public.receivable_item_type, public.ledger_entry_type, public.ledger_direction, text, numeric, text, date, date),
  public.validate_payment_allocations(uuid, uuid, jsonb, boolean)
to service_role;
