alter table public.notification_deliveries alter column recipient_email drop not null;
alter table public.notification_deliveries drop constraint notification_deliveries_recipient_email_check;
alter table public.notification_deliveries add constraint notification_deliveries_recipient_email_check
  check (recipient_email is null or recipient_email = lower(recipient_email));

create or replace function public.expand_notification_event(target uuid)
returns table(delivery_id uuid)
language plpgsql security definer set search_path=public set row_security=off
as $$
declare
  e public.notification_events;
  event_on date;
  payment_id uuid;
  recipients uuid[] := '{}';
  recipient uuid;
  email_value text;
  email_allowed boolean;
  in_app_allowed boolean;
  condominium_email_allowed boolean;
  skip_code text;
  title_value text;
  body_value text;
  action_value text;
  template_value text;
  safe_payload jsonb;
  inserted_delivery uuid;
begin
  select * into e from public.notification_events where id=target for update;
  if e.id is null or e.status='expanded' or e.status='failed' then return; end if;

  select (e.created_at at time zone s.timezone)::date, s.email_enabled
    into event_on, condominium_email_allowed
    from public.condominium_notification_settings s where s.condominium_id=e.condominium_id;
  if event_on is null then event_on := (e.created_at at time zone 'UTC')::date; end if;

  if e.aggregate_type='receipt' then
    select r.payment_id into payment_id from public.payment_receipts r
      where r.id=e.aggregate_id and r.condominium_id=e.condominium_id;
  elsif e.aggregate_type='payment' then payment_id := e.aggregate_id;
  else payment_id := null;
  end if;

  with resident_users as (
    select distinct p.auth_user_id user_id
      from public.people p
      where p.condominium_id=e.condominium_id and p.auth_user_id is not null and p.status='active'
        and (
          exists(select 1 from public.unit_owners o where o.person_id=p.id and o.unit_id=e.unit_id
            and o.starts_at<=event_on and (o.ends_at is null or o.ends_at>=event_on))
          or exists(select 1 from public.unit_occupancies o where o.person_id=p.id and o.unit_id=e.unit_id
            and o.occupancy_type in ('owner_occupant','tenant','authorized_occupant')
            and o.starts_at<=event_on and (o.ends_at is null or o.ends_at>=event_on))
        )
  ), admin_users as (
    select cm.user_id from public.condominium_memberships cm
      where cm.condominium_id=e.condominium_id and cm.role in ('condominium_admin','accountant','payment_reviewer')
    union
    select om.user_id from public.organization_memberships om
      join public.condominiums c on c.organization_id=om.organization_id
      where c.id=e.condominium_id and om.role='organization_owner'
  ), payment_users as (
    select p.submitted_by_user_id user_id from public.payments p
      where p.id=payment_id and p.condominium_id=e.condominium_id
    union
    select person.auth_user_id from public.payments p
      join public.people person on person.id=p.submitted_for_person_id
        and person.condominium_id=p.condominium_id and person.auth_user_id is not null
      where p.id=payment_id and p.condominium_id=e.condominium_id
    union select user_id from resident_users
  ), selected as (
    select user_id from admin_users where e.event_type='payment_submitted'
    union select user_id from resident_users where e.event_type in ('receivable_created','opening_balance_created','receivable_due_soon','receivable_overdue')
    union select user_id from payment_users where e.event_type in ('payment_correction_requested','payment_rejected','payment_approved','payment_reversed','payment_receipt_issued')
  ) select coalesce(array_agg(distinct user_id) filter(where user_id is not null),'{}') into recipients from selected;

  title_value := case e.event_type
    when 'payment_approved' then 'Pago aprobado' when 'payment_rejected' then 'Pago rechazado'
    when 'payment_correction_requested' then 'Corrección solicitada' when 'payment_reversed' then 'Pago reversado'
    when 'payment_receipt_issued' then 'Recibo disponible' when 'payment_submitted' then 'Pago pendiente de revisión'
    when 'receivable_due_soon' then 'Cargo próximo a vencer' when 'receivable_overdue' then 'Cargo vencido'
    else 'Nuevo cargo' end;
  body_value := coalesce(e.payload->>'condominium_name','Habitta')
    ||case when e.payload ? 'unit_code' then ' · Unidad '||(e.payload->>'unit_code') else '' end
    ||case when e.payload ? 'amount' then ' · '||coalesce(e.payload->>'currency_code','')||' '||(e.payload->>'amount') else '' end;
  action_value := case when e.aggregate_type='receipt' then '/app/condominiums/'||e.condominium_id||'/payments/'||payment_id||'/receipt'
    when e.aggregate_type='payment' then '/app/condominiums/'||e.condominium_id||'/payments/'||e.aggregate_id
    else '/app/condominiums/'||e.condominium_id||'/units/'||e.unit_id||'/statement' end;
  template_value := case e.event_type when 'receivable_created' then 'new_receivable' when 'opening_balance_created' then 'new_receivable'
    when 'payment_submitted' then 'payment_submitted_admin' when 'payment_correction_requested' then 'payment_correction_requested'
    when 'payment_rejected' then 'payment_rejected' when 'payment_approved' then 'payment_approved'
    when 'payment_reversed' then 'payment_reversed' when 'payment_receipt_issued' then 'payment_receipt_available'
    when 'receivable_due_soon' then 'receivable_due_soon' else 'receivable_overdue' end;
  safe_payload := jsonb_strip_nulls(jsonb_build_object(
    'condominium_name',e.payload->>'condominium_name','unit_code',e.payload->>'unit_code',
    'payer_name',e.payload->>'payer_name','description',e.payload->>'description','reason',e.payload->>'reason',
    'amount',e.payload->>'amount','currency_code',e.payload->>'currency_code','due_date',e.payload->>'due_date',
    'receipt_number',e.payload->>'receipt_number','action_url',action_value));

  foreach recipient in array recipients loop
    select coalesce(p.in_app_enabled,true),coalesce(p.email_enabled,true)
      into in_app_allowed,email_allowed from (select 1) seed
      left join public.notification_preferences p on p.condominium_id=e.condominium_id
        and p.user_id=recipient and p.notification_type=e.event_type;
    if e.event_type in ('payment_correction_requested','payment_rejected','payment_approved','payment_reversed','payment_receipt_issued')
      or in_app_allowed then
      insert into public.notifications(condominium_id,recipient_user_id,event_id,notification_type,title,body,action_url,metadata)
        values(e.condominium_id,recipient,e.id,e.event_type,title_value,body_value,action_value,
          jsonb_strip_nulls(jsonb_build_object('unit_id',e.unit_id,'amount',e.payload->>'amount','currency_code',e.payload->>'currency_code')))
        on conflict(event_id,recipient_user_id) do nothing;
    end if;

    select lower(coalesce(nullif(trim(u.email),''),nullif(trim(person.email),''))) into email_value
      from auth.users u
      left join lateral (
        select p.email from public.people p where p.auth_user_id=u.id and p.condominium_id=e.condominium_id
          and p.email is not null order by p.created_at limit 1
      ) person on true where u.id=recipient;
    if not condominium_email_allowed then skip_code:='condominium_email_disabled';
    elsif not email_allowed then skip_code:='user_email_disabled';
    elsif email_value is null or email_value !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then skip_code:='recipient_email_unavailable';
    else skip_code:=null; end if;

    inserted_delivery:=null;
    insert into public.notification_deliveries(condominium_id,event_id,recipient_user_id,recipient_email,channel,template_key,payload,status,deduplication_key,last_error_code)
      values(e.condominium_id,e.id,recipient,email_value,'email',template_value,safe_payload,
        case when skip_code is null then 'pending'::public.notification_delivery_status else 'skipped'::public.notification_delivery_status end,
        'delivery:'||e.id::text||':'||recipient::text||':email',skip_code)
      on conflict(deduplication_key) do nothing returning id into inserted_delivery;
    if inserted_delivery is not null then delivery_id:=inserted_delivery; return next; end if;
  end loop;
  update public.notification_events set status='expanded',processed_at=now(),last_error_code=null where id=e.id;
end $$;

create or replace function public.claim_notification_events(limit_count integer default 50)
returns table(id uuid) language plpgsql security definer set search_path=public set row_security=off as $$
begin
  update public.notification_events set status='failed',last_error_code='max_attempts_exceeded',processed_at=now()
    where status='pending' and attempts>=5 and available_at<=now();
  return query with candidates as (
    select e.id from public.notification_events e where e.status='pending' and e.attempts<5 and e.available_at<=now()
      order by e.created_at for update skip locked limit least(greatest(limit_count,1),100)
  ) update public.notification_events e set attempts=e.attempts+1,available_at=now()+interval '10 minutes',last_error_code=null
      from candidates c where e.id=c.id returning e.id;
end $$;

create function public.process_notification_event(target uuid)
returns boolean language plpgsql security definer set search_path=public set row_security=off as $$
declare attempts_value integer;
begin
  begin perform public.expand_notification_event(target); return true;
  exception when others then
    select attempts into attempts_value from public.notification_events where id=target for update;
    update public.notification_events set status=case when attempts_value>=5 then 'failed'::public.notification_event_status else 'pending'::public.notification_event_status end,
      available_at=case when attempts_value>=5 then available_at else now()+make_interval(mins=>attempts_value*attempts_value) end,
      processed_at=case when attempts_value>=5 then now() else null end,last_error_code='expansion_failed'
      where id=target;
    return false;
  end;
end $$;

drop function public.generate_due_notification_events(date);
create function public.generate_due_notification_events(run_at timestamptz)
returns integer language plpgsql security definer set search_path=public set row_security=off as $$
declare count_value integer:=0; inserted integer; r record; kind public.notification_event_type; local_date date;
begin
  for r in select i.*,s.due_soon_days,s.due_soon_enabled,s.overdue_enabled,s.timezone,c.name condo_name,u.code unit_code
    from public.receivable_items i join public.condominium_notification_settings s on s.condominium_id=i.condominium_id
    join public.condominiums c on c.id=i.condominium_id join public.units u on u.id=i.unit_id
    where i.lifecycle_status='active'
      and coalesce((select sum(case direction when 'debit' then amount else -amount end) from public.receivable_ledger_entries l where l.receivable_item_id=i.id),0)>0
  loop
    local_date := (run_at at time zone r.timezone)::date;
    kind := case when r.due_soon_enabled and r.due_date=local_date+r.due_soon_days then 'receivable_due_soon'::public.notification_event_type
      when r.overdue_enabled and r.due_date<local_date then 'receivable_overdue'::public.notification_event_type else null end;
    if kind is not null then
      insert into public.notification_events(condominium_id,event_type,aggregate_type,aggregate_id,unit_id,payload,deduplication_key)
      values(r.condominium_id,kind,'receivable',r.id,r.unit_id,jsonb_build_object('condominium_id',r.condominium_id,'condominium_name',r.condo_name,'unit_id',r.unit_id,'unit_code',r.unit_code,'receivable_item_id',r.id,'description',r.description,'due_date',r.due_date,'amount',to_char(r.original_amount,'FM999999999999990.00'),'currency_code',r.currency_code),format('due:%s:%s',r.id,kind))
      on conflict(deduplication_key) do nothing;
      get diagnostics inserted=row_count; count_value:=count_value+inserted;
    end if;
  end loop;
  return count_value;
end $$;

create or replace function public.update_condominium_notification_settings(target_condominium uuid,target_email_enabled boolean,target_due_soon_enabled boolean,target_due_soon_days integer,target_overdue_enabled boolean,target_timezone text)
returns public.condominium_notification_settings language plpgsql security definer set search_path=public set row_security=off as $$
declare result public.condominium_notification_settings;
begin
  if not public.can_manage_receivables(target_condominium) then raise exception 'permission denied'; end if;
  if not exists(select 1 from pg_timezone_names where name=target_timezone) then raise exception 'invalid timezone'; end if;
  update public.condominium_notification_settings set email_enabled=target_email_enabled,due_soon_enabled=target_due_soon_enabled,due_soon_days=target_due_soon_days,overdue_enabled=target_overdue_enabled,timezone=target_timezone,updated_at=now()
    where condominium_id=target_condominium returning * into result;
  return result;
end $$;

drop function public.get_my_unread_notification_count();
create function public.get_my_unread_notification_count() returns jsonb language sql security definer set search_path=public set row_security=off as $$
  with grouped as (select condominium_id,count(*) unread_count from public.notifications where recipient_user_id=auth.uid() and read_at is null and archived_at is null group by condominium_id)
  select jsonb_build_object('total',coalesce(sum(unread_count),0),'groupedByCondominium',coalesce(jsonb_agg(jsonb_build_object('condominiumId',condominium_id,'unreadCount',unread_count)),'[]'::jsonb)) from grouped
$$;

revoke all on function public.process_notification_event(uuid),public.generate_due_notification_events(timestamptz) from public,anon,authenticated;
grant execute on function public.process_notification_event(uuid),public.generate_due_notification_events(timestamptz) to service_role;
grant execute on function public.get_my_unread_notification_count() to authenticated,service_role;
revoke all on public.notification_events,public.notification_deliveries from anon,authenticated;
