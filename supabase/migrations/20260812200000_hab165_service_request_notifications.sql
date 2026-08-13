-- HAB-165: connect the existing immutable service-request timeline to the shared notification outbox.
-- The service_request_events row is the transactional source of truth and its id is the stable
-- deduplication identity. Internal comments/events are never exposed to resident recipients.

alter type public.notification_event_type add value if not exists 'service_request_submitted';
alter type public.notification_event_type add value if not exists 'service_request_assigned';
alter type public.notification_event_type add value if not exists 'service_request_resident_attention';
alter type public.notification_event_type add value if not exists 'service_request_resolved';
alter type public.notification_event_type add value if not exists 'service_request_cancelled';

alter table public.notification_events
  drop constraint if exists notification_events_aggregate_type_check;

alter table public.notification_events
  add constraint notification_events_aggregate_type_check
  check (aggregate_type in ('receivable', 'payment', 'receipt', 'announcement', 'maintenance', 'service_request'));

create or replace function public.validate_notification_event_scope()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  expected_unit uuid;
  aggregate_found boolean := false;
begin
  if new.aggregate_type = 'receivable' then
    select unit_id, true into expected_unit, aggregate_found
    from public.receivable_items where id = new.aggregate_id and condominium_id = new.condominium_id;
  elsif new.aggregate_type = 'payment' then
    select unit_id, true into expected_unit, aggregate_found
    from public.payments where id = new.aggregate_id and condominium_id = new.condominium_id;
  elsif new.aggregate_type = 'receipt' then
    select p.unit_id, true into expected_unit, aggregate_found
    from public.payment_receipts r join public.payments p on p.id = r.payment_id
    where r.id = new.aggregate_id and r.condominium_id = new.condominium_id
      and p.condominium_id = new.condominium_id;
  elsif new.aggregate_type = 'announcement' then
    select null::uuid, true into expected_unit, aggregate_found
    from public.announcements a where a.id = new.aggregate_id and a.condominium_id = new.condominium_id;
  elsif new.aggregate_type = 'maintenance' then
    select null::uuid, true into expected_unit, aggregate_found
    from public.maintenance_work_orders w
    where w.id = new.aggregate_id and w.condominium_id = new.condominium_id;
  elsif new.aggregate_type = 'service_request' then
    select r.unit_id, true into expected_unit, aggregate_found
    from public.service_requests r
    where r.id = new.aggregate_id and r.condominium_id = new.condominium_id;
  else
    raise exception 'invalid notification aggregate type';
  end if;

  if not coalesce(aggregate_found, false) then
    raise exception 'notification aggregate does not belong to condominium';
  end if;
  if new.unit_id is distinct from expected_unit then
    raise exception 'notification unit does not match aggregate';
  end if;
  return new;
end;
$$;

create function public.emit_service_request_notification(
  target_event uuid,
  target_type public.notification_event_type,
  recipient_mode text
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  timeline public.service_request_events;
  request_row public.service_requests;
  condo_name text;
  category_name text;
  recipient record;
  created_event_id uuid;
  recipient_email text;
  in_app_allowed boolean;
  email_allowed boolean;
  title_value text;
  body_value text;
  action_value text;
  payload_value jsonb;
begin
  select * into timeline from public.service_request_events where id = target_event;
  if timeline.id is null then raise exception 'service request event not found'; end if;

  select * into request_row
  from public.service_requests
  where id = timeline.request_id and condominium_id = timeline.condominium_id;
  if request_row.id is null then raise exception 'service request not found'; end if;

  if target_type not in (
    'service_request_submitted',
    'service_request_assigned',
    'service_request_resident_attention',
    'service_request_resolved',
    'service_request_cancelled'
  ) then
    raise exception 'invalid service request notification type';
  end if;
  if recipient_mode not in ('operations', 'assignee', 'resident', 'resident_and_operations') then
    raise exception 'invalid service request recipient mode';
  end if;

  select c.name, category.name into condo_name, category_name
  from public.condominiums c
  join public.service_request_categories category on category.id = request_row.category_id
  where c.id = request_row.condominium_id
    and category.condominium_id = request_row.condominium_id;

  action_value := '/app/condominiums/' || request_row.condominium_id || '/requests/' || request_row.id;
  title_value := case target_type
    when 'service_request_submitted' then 'Nueva solicitud de servicio'
    when 'service_request_assigned' then 'Solicitud asignada'
    when 'service_request_resident_attention' then 'Tu solicitud requiere atención'
    when 'service_request_resolved' then 'Solicitud resuelta'
    else 'Solicitud cancelada'
  end;
  body_value := condo_name || ' · ' || request_row.request_number || ' · ' || request_row.title;
  payload_value := jsonb_strip_nulls(jsonb_build_object(
    'condominium_id', request_row.condominium_id,
    'condominium_name', condo_name,
    'request_id', request_row.id,
    'request_number', request_row.request_number,
    'title', request_row.title,
    'category_name', category_name,
    'status', request_row.status,
    'action_url', action_value
  ));

  insert into public.notification_events(
    condominium_id, event_type, aggregate_type, aggregate_id, unit_id, actor_user_id,
    payload, deduplication_key, status, processed_at
  ) values (
    request_row.condominium_id, target_type, 'service_request', request_row.id,
    request_row.unit_id, timeline.actor_user_id, payload_value,
    'service-request-event:' || timeline.id, 'expanded', now()
  )
  on conflict(deduplication_key) do nothing
  returning id into created_event_id;

  if created_event_id is null then return; end if;

  for recipient in
    with candidate_users as (
      -- Operations recipients for newly submitted/cancelled requests.
      select cm.user_id
      from public.condominium_memberships cm
      where recipient_mode in ('operations', 'resident_and_operations')
        and cm.condominium_id = request_row.condominium_id
        and cm.role in ('condominium_admin', 'assistant')
      union
      select om.user_id
      from public.organization_memberships om
      join public.condominiums c on c.organization_id = om.organization_id
      where recipient_mode in ('operations', 'resident_and_operations')
        and c.id = request_row.condominium_id
        and om.role = 'organization_owner'
      union
      -- Assignment notices are intentionally only for the current assignee.
      select request_row.assigned_to_user_id
      where recipient_mode = 'assignee'
        and request_row.assigned_to_user_id is not null
      union
      -- Resident-facing notices go only to the submitter and explicitly-linked requester account.
      select request_row.submitted_by_user_id
      where recipient_mode in ('resident', 'resident_and_operations')
      union
      select p.auth_user_id
      from public.people p
      where recipient_mode in ('resident', 'resident_and_operations')
        and p.id = request_row.requester_person_id
        and p.condominium_id = request_row.condominium_id
        and p.auth_user_id is not null
    )
    select distinct user_id from candidate_users
    where user_id is not null and user_id is distinct from timeline.actor_user_id
  loop
    select coalesce(p.in_app_enabled, true), coalesce(p.email_enabled, true)
      into in_app_allowed, email_allowed
    from (select 1) seed
    left join public.notification_preferences p
      on p.condominium_id = request_row.condominium_id
     and p.user_id = recipient.user_id
     and p.notification_type = target_type;

    if in_app_allowed then
      insert into public.notifications(
        condominium_id, recipient_user_id, event_id, notification_type,
        title, body, action_url, metadata
      ) values (
        request_row.condominium_id, recipient.user_id, created_event_id, target_type,
        title_value, body_value, action_value,
        jsonb_build_object('request_id', request_row.id, 'request_number', request_row.request_number)
      ) on conflict(event_id, recipient_user_id) do nothing;
    end if;

    select lower(coalesce(nullif(trim(u.email),''), nullif(trim(person.email),'')))
      into recipient_email
    from auth.users u
    left join lateral (
      select p.email
      from public.people p
      where p.auth_user_id = u.id
        and p.condominium_id = request_row.condominium_id
        and p.email is not null
      order by p.created_at
      limit 1
    ) person on true
    where u.id = recipient.user_id;

    if email_allowed
      and recipient_email is not null
      and recipient_email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
      insert into public.notification_deliveries(
        condominium_id, event_id, recipient_user_id, recipient_email, channel,
        template_key, payload, status, deduplication_key
      ) values (
        request_row.condominium_id, created_event_id, recipient.user_id, recipient_email, 'email',
        target_type::text, payload_value, 'pending',
        'delivery:' || created_event_id || ':' || recipient.user_id || ':email'
      ) on conflict(deduplication_key) do nothing;
      -- HAB-130 converts pending email to skipped unless the condominium is explicitly enabled.
    end if;
  end loop;
end;
$$;

create function public.capture_service_request_notification()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  request_row public.service_requests;
  next_status text;
begin
  select * into request_row
  from public.service_requests
  where id = new.request_id and condominium_id = new.condominium_id;

  if new.event_type = 'created' then
    perform public.emit_service_request_notification(new.id, 'service_request_submitted', 'operations');
  elsif new.event_type = 'assigned' and request_row.assigned_to_user_id is not null then
    perform public.emit_service_request_notification(new.id, 'service_request_assigned', 'assignee');
  elsif new.event_type = 'comment_added' and new.visibility = 'public' then
    perform public.emit_service_request_notification(new.id, 'service_request_resident_attention', 'resident');
  elsif new.event_type = 'status_changed' then
    next_status := coalesce(new.to_value->>'status', request_row.status::text);
    if next_status = 'waiting_resident' then
      perform public.emit_service_request_notification(new.id, 'service_request_resident_attention', 'resident');
    end if;
  elsif new.event_type in ('resolved', 'reopened') and request_row.status = 'resolved' then
    perform public.emit_service_request_notification(new.id, 'service_request_resolved', 'resident');
  elsif new.event_type = 'cancelled' then
    perform public.emit_service_request_notification(new.id, 'service_request_cancelled', 'resident_and_operations');
  end if;
  return new;
end;
$$;

create trigger service_request_notification_outbox
after insert on public.service_request_events
for each row execute function public.capture_service_request_notification();

revoke all on function public.emit_service_request_notification(uuid,public.notification_event_type,text)
  from public, anon, authenticated;
revoke all on function public.capture_service_request_notification()
  from public, anon, authenticated;
