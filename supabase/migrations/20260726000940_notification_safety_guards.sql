alter table public.notification_events
  add constraint notification_events_payload_condominium_match
  check (payload->>'condominium_id' = condominium_id::text),
  add constraint notification_events_unit_condominium_fkey
  foreign key (unit_id, condominium_id)
  references public.units(id, condominium_id);

alter table public.notifications
  add constraint notifications_event_condominium_fkey
  foreign key (event_id, condominium_id)
  references public.notification_events(id, condominium_id);

alter table public.notification_deliveries
  add constraint notification_deliveries_event_condominium_fkey
  foreign key (event_id, condominium_id)
  references public.notification_events(id, condominium_id);

create function public.validate_notification_event_scope()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  expected_unit uuid;
begin
  if new.aggregate_type = 'receivable' then
    select unit_id
      into expected_unit
      from public.receivable_items
      where id = new.aggregate_id
        and condominium_id = new.condominium_id;
  elsif new.aggregate_type = 'payment' then
    select unit_id
      into expected_unit
      from public.payments
      where id = new.aggregate_id
        and condominium_id = new.condominium_id;
  elsif new.aggregate_type = 'receipt' then
    select p.unit_id
      into expected_unit
      from public.payment_receipts r
      join public.payments p on p.id = r.payment_id
      where r.id = new.aggregate_id
        and r.condominium_id = new.condominium_id
        and p.condominium_id = new.condominium_id;
  else
    raise exception 'invalid notification aggregate type';
  end if;

  if expected_unit is null then
    raise exception 'notification aggregate does not belong to condominium';
  end if;

  if new.unit_id is distinct from expected_unit then
    raise exception 'notification unit does not match aggregate';
  end if;

  return new;
end;
$$;

create trigger notification_events_scope_guard
before insert or update of condominium_id, aggregate_type, aggregate_id, unit_id, payload
on public.notification_events
for each row execute function public.validate_notification_event_scope();

create or replace function public.notification_event_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'notification events are immutable';
  end if;

  if (new.id,
      new.condominium_id,
      new.event_type,
      new.aggregate_type,
      new.aggregate_id,
      new.unit_id,
      new.actor_user_id,
      new.payload,
      new.deduplication_key,
      new.created_at)
     is distinct from
     (old.id,
      old.condominium_id,
      old.event_type,
      old.aggregate_type,
      old.aggregate_id,
      old.unit_id,
      old.actor_user_id,
      old.payload,
      old.deduplication_key,
      old.created_at) then
    raise exception 'notification events are immutable';
  end if;

  return new;
end;
$$;

create or replace function public.notification_delivery_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'notification deliveries are immutable';
  end if;

  if (new.id,
      new.condominium_id,
      new.event_id,
      new.recipient_user_id,
      new.recipient_email,
      new.channel,
      new.template_key,
      new.locale,
      new.payload,
      new.deduplication_key,
      new.created_at)
     is distinct from
     (old.id,
      old.condominium_id,
      old.event_id,
      old.recipient_user_id,
      old.recipient_email,
      old.channel,
      old.template_key,
      old.locale,
      old.payload,
      old.deduplication_key,
      old.created_at) then
    raise exception 'notification deliveries are immutable';
  end if;

  return new;
end;
$$;

create or replace function public.claim_notification_delivery(target uuid, worker text)
returns public.notification_deliveries
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  delivery public.notification_deliveries;
begin
  update public.notification_deliveries
     set status = 'dead',
         last_error_code = 'processing_timeout',
         updated_at = now()
   where id = target
     and status = 'processing'
     and claimed_at < now() - interval '10 minutes'
     and attempts >= 5;

  update public.notification_deliveries
     set status = 'processing',
         claimed_at = now(),
         claimed_by = worker,
         attempts = attempts + 1,
         updated_at = now()
   where id = target
     and attempts < 5
     and (
       (status in ('pending', 'retry', 'queued') and next_attempt_at <= now())
       or (status = 'processing' and claimed_at < now() - interval '10 minutes')
     )
  returning * into delivery;

  return delivery;
end;
$$;
