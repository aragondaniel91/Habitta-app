-- HAB-150: bound outbound notification email volume without delaying in-app notifications.
-- High-fanout event types enter a short delivery window; queue claims are globally bounded
-- and fair across condominiums. Transactional/targeted events remain immediately eligible.

create or replace function public.notification_email_uses_volume_window(
  target_type public.notification_event_type
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select target_type::text in (
    'receivable_created',
    'opening_balance_created',
    'receivable_due_soon',
    'receivable_overdue',
    'announcement_published',
    'governance_opened',
    'governance_due_soon',
    'governance_result_available',
    'governance_decision_final'
  )
$$;

create or replace function public.apply_notification_delivery_volume_window()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  event_type_value public.notification_event_type;
  window_start timestamptz;
begin
  select e.event_type
    into event_type_value
    from public.notification_events e
   where e.id = new.event_id
     and e.condominium_id = new.condominium_id;

  if event_type_value is null then
    raise exception 'notification event not found';
  end if;

  if public.notification_email_uses_volume_window(event_type_value) then
    -- Coalesce high-fanout email into the next 15-minute boundary. The in-app notification
    -- is created during event expansion and is therefore not delayed by this email window.
    window_start := date_trunc('hour', now())
      + (floor(extract(minute from now()) / 15) + 1) * interval '15 minutes';
    new.next_attempt_at := greatest(new.next_attempt_at, window_start);
  end if;

  return new;
end;
$$;

revoke all on function public.notification_email_uses_volume_window(public.notification_event_type)
  from public, anon, authenticated;
revoke all on function public.apply_notification_delivery_volume_window()
  from public, anon, authenticated, service_role;
grant execute on function public.notification_email_uses_volume_window(public.notification_event_type)
  to service_role;

drop trigger if exists notification_delivery_volume_window on public.notification_deliveries;
create trigger notification_delivery_volume_window
before insert on public.notification_deliveries
for each row execute function public.apply_notification_delivery_volume_window();

create or replace function public.claim_due_notification_deliveries(limit_count integer default 25)
returns table(id uuid)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  -- Defense in depth from HAB-130 remains intact: no delivery may queue while live email is off.
  update public.notification_deliveries d
     set status = 'skipped',
         last_error_code = 'live_email_not_activated',
         claimed_at = null,
         claimed_by = null,
         updated_at = now()
    from public.condominium_notification_settings s
   where s.condominium_id = d.condominium_id
     and not s.live_email_enabled
     and d.status in ('pending', 'retry', 'queued', 'processing');

  -- Pilot send budget:
  --   * at most 5 due deliveries from any one condominium per 5-minute scheduler cycle
  --   * at most 25 deliveries globally per cycle
  -- This prevents one large condominium from monopolizing the queue while preserving FIFO
  -- ordering inside each condominium and the existing delivery deduplication/retry contract.
  return query
  with active_condominiums as (
    select s.condominium_id
      from public.condominium_notification_settings s
     where s.live_email_enabled
  ), fair_candidates as (
    select candidate.id, candidate.created_at
      from active_condominiums ac
      cross join lateral (
        select d.id, d.created_at
          from public.notification_deliveries d
         where d.condominium_id = ac.condominium_id
           and d.status in ('pending', 'retry')
           and d.next_attempt_at <= now()
         order by d.created_at, d.id
         for update of d skip locked
         limit 5
      ) candidate
  ), candidates as (
    select fc.id
      from fair_candidates fc
     order by fc.created_at, fc.id
     limit least(greatest(limit_count, 1), 25)
  )
  update public.notification_deliveries d
     set status = 'queued', updated_at = now()
    from candidates c
   where d.id = c.id
  returning d.id;
end;
$$;

revoke all on function public.claim_due_notification_deliveries(integer)
  from public, anon, authenticated;
grant execute on function public.claim_due_notification_deliveries(integer) to service_role;
