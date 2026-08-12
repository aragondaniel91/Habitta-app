-- HAB-133: operational maintenance notifications. Events are expanded synchronously here so
-- in-app notifications appear immediately. Email deliveries still pass through HAB-130's
-- fail-closed per-condominium live-email trigger and the existing worker/provider pipeline.

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

create function public.emit_maintenance_operational_notification(
  target_condominium uuid,
  target_work_order uuid,
  target_actor uuid,
  target_type public.notification_event_type,
  target_description text,
  target_amount text default null,
  target_currency text default null,
  target_reason text default null,
  target_key text default null
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  event_id uuid;
  condo_name text;
  order_number text;
  order_title text;
  recipient record;
  in_app_allowed boolean;
  email_allowed boolean;
  recipient_email text;
  title_value text;
  action_value text;
  template_value text;
  payload_value jsonb;
begin
  if target_type not in (
    'maintenance_quote_submitted', 'maintenance_quote_approved', 'maintenance_quote_rejected',
    'maintenance_evidence_added', 'maintenance_expense_linked'
  ) then
    raise exception 'invalid maintenance notification type';
  end if;

  select c.name, w.work_order_number, w.title
    into condo_name, order_number, order_title
  from public.maintenance_work_orders w
  join public.condominiums c on c.id = w.condominium_id
  where w.id = target_work_order and w.condominium_id = target_condominium;
  if order_number is null then raise exception 'maintenance work order not found'; end if;

  action_value := '/app/condominiums/' || target_condominium || '/maintenance';
  payload_value := jsonb_strip_nulls(jsonb_build_object(
    'condominium_id', target_condominium,
    'condominium_name', condo_name,
    'work_order_id', target_work_order,
    'work_order_number', order_number,
    'description', target_description,
    'reason', target_reason,
    'amount', target_amount,
    'currency_code', target_currency,
    'action_url', action_value
  ));

  insert into public.notification_events(
    condominium_id, event_type, aggregate_type, aggregate_id, actor_user_id,
    payload, deduplication_key, status, processed_at
  ) values (
    target_condominium, target_type, 'maintenance', target_work_order, target_actor,
    payload_value, coalesce(target_key, 'maintenance:' || target_work_order || ':' || target_type || ':' || gen_random_uuid()),
    'expanded', now()
  ) on conflict(deduplication_key) do nothing returning id into event_id;
  if event_id is null then return; end if;

  title_value := case target_type
    when 'maintenance_quote_submitted' then 'Nueva cotización de mantenimiento'
    when 'maintenance_quote_approved' then 'Cotización aprobada'
    when 'maintenance_quote_rejected' then 'Cotización rechazada'
    when 'maintenance_evidence_added' then 'Nueva evidencia de mantenimiento'
    else 'Gasto vinculado a mantenimiento'
  end;
  template_value := case target_type
    when 'maintenance_quote_submitted' then 'maintenance_quote_submitted'
    when 'maintenance_quote_approved' then 'maintenance_quote_approved'
    when 'maintenance_quote_rejected' then 'maintenance_quote_rejected'
    when 'maintenance_evidence_added' then 'maintenance_evidence_added'
    else 'maintenance_expense_linked'
  end;

  for recipient in
    select distinct user_id from (
      select cm.user_id
      from public.condominium_memberships cm
      where cm.condominium_id = target_condominium
        and cm.role in ('condominium_admin','assistant','board_member','accountant')
      union
      select om.user_id
      from public.organization_memberships om
      join public.condominiums c on c.organization_id = om.organization_id
      where c.id = target_condominium and om.role = 'organization_owner'
    ) r where user_id is not null
  loop
    select coalesce(p.in_app_enabled, true), coalesce(p.email_enabled, true)
      into in_app_allowed, email_allowed
    from (select 1) seed
    left join public.notification_preferences p
      on p.condominium_id = target_condominium
     and p.user_id = recipient.user_id
     and p.notification_type = target_type;

    if in_app_allowed then
      insert into public.notifications(
        condominium_id, recipient_user_id, event_id, notification_type,
        title, body, action_url, metadata
      ) values (
        target_condominium, recipient.user_id, event_id, target_type,
        title_value,
        condo_name || ' · ' || order_number || ' · ' || target_description,
        action_value,
        jsonb_build_object('work_order_id', target_work_order, 'work_order_number', order_number)
      ) on conflict(event_id, recipient_user_id) do nothing;
    end if;

    select lower(coalesce(nullif(trim(u.email),''), nullif(trim(p.email),'')))
      into recipient_email
    from auth.users u
    left join lateral (
      select person.email from public.people person
      where person.auth_user_id = u.id and person.condominium_id = target_condominium
        and person.email is not null order by person.created_at limit 1
    ) p on true
    where u.id = recipient.user_id;

    if email_allowed and recipient_email is not null
      and recipient_email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
      insert into public.notification_deliveries(
        condominium_id, event_id, recipient_user_id, recipient_email, channel,
        template_key, payload, status, deduplication_key
      ) values (
        target_condominium, event_id, recipient.user_id, recipient_email, 'email',
        template_value, payload_value, 'pending',
        'delivery:' || event_id || ':' || recipient.user_id || ':email'
      ) on conflict(deduplication_key) do nothing;
      -- HAB-130's before-insert guard converts this to skipped unless live email is activated.
    end if;
  end loop;
end;
$$;

create function public.capture_maintenance_quote_notification()
returns trigger language plpgsql security definer set search_path=public set row_security=off as $$
begin
  if tg_op = 'INSERT' then
    perform public.emit_maintenance_operational_notification(
      new.condominium_id, new.work_order_id, new.created_by,
      'maintenance_quote_submitted',
      'Cotización ' || coalesce(new.reference, new.id::text),
      to_char(new.amount, 'FM999999999999990.00'), new.currency_code, null,
      'maintenance:quote:' || new.id || ':submitted'
    );
  elsif old.status is distinct from new.status and new.status in ('approved','rejected') then
    perform public.emit_maintenance_operational_notification(
      new.condominium_id, new.work_order_id, new.decided_by,
      case when new.status='approved' then 'maintenance_quote_approved'::public.notification_event_type
           else 'maintenance_quote_rejected'::public.notification_event_type end,
      'Cotización ' || coalesce(new.reference, new.id::text),
      to_char(new.amount, 'FM999999999999990.00'), new.currency_code, new.decision_note,
      'maintenance:quote:' || new.id || ':' || new.status
    );
  end if;
  return new;
end;
$$;

create trigger maintenance_quote_notification_outbox
after insert or update of status on public.maintenance_quotes
for each row execute function public.capture_maintenance_quote_notification();

create function public.capture_maintenance_attachment_notification()
returns trigger language plpgsql security definer set search_path=public set row_security=off as $$
begin
  perform public.emit_maintenance_operational_notification(
    new.condominium_id, new.work_order_id, new.uploaded_by,
    'maintenance_evidence_added',
    new.original_filename || ' · ' || new.document_type,
    null, null, null,
    'maintenance:attachment:' || new.id
  );
  return new;
end;
$$;
create trigger maintenance_attachment_notification_outbox
after insert on public.maintenance_attachments
for each row execute function public.capture_maintenance_attachment_notification();

create function public.capture_maintenance_expense_notification()
returns trigger language plpgsql security definer set search_path=public set row_security=off as $$
declare expense_row public.expenses;
begin
  select * into expense_row from public.expenses
  where id = new.expense_id and condominium_id = new.condominium_id;
  perform public.emit_maintenance_operational_notification(
    new.condominium_id, new.work_order_id, new.linked_by,
    'maintenance_expense_linked',
    coalesce(expense_row.description, 'Gasto vinculado'),
    case when expense_row.id is null then null else to_char(expense_row.amount, 'FM999999999999990.00') end,
    expense_row.currency_code, null,
    'maintenance:expense-link:' || new.id
  );
  return new;
end;
$$;
create trigger maintenance_expense_notification_outbox
after insert on public.maintenance_work_order_expenses
for each row execute function public.capture_maintenance_expense_notification();

revoke all on function public.emit_maintenance_operational_notification(uuid,uuid,uuid,public.notification_event_type,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.capture_maintenance_quote_notification() from public,anon,authenticated;
revoke all on function public.capture_maintenance_attachment_notification() from public,anon,authenticated;
revoke all on function public.capture_maintenance_expense_notification() from public,anon,authenticated;
