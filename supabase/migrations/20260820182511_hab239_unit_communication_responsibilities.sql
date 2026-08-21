create type public.unit_financial_role as enum ('primary', 'additional');

create table public.unit_communication_assignments (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  person_id uuid not null references public.people(id),
  financial_role public.unit_financial_role,
  general_recipient boolean not null default false,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  ended_by uuid references auth.users(id),
  ended_at timestamptz,
  check (effective_to is null or effective_to >= effective_from),
  check (financial_role is not null or general_recipient)
);

comment on table public.unit_communication_assignments is
  'Historical unit-scoped communication responsibility snapshots; responsibilities never alter unit financial ownership.';

create unique index unit_communication_assignments_active_person_unique
  on public.unit_communication_assignments(unit_id, person_id)
  where effective_to is null;

create unique index unit_communication_assignments_active_primary_unique
  on public.unit_communication_assignments(unit_id)
  where effective_to is null and financial_role = 'primary';

create index unit_communication_assignments_person_history_idx
  on public.unit_communication_assignments(condominium_id, person_id, effective_from desc);

create index unit_communication_assignments_unit_history_idx
  on public.unit_communication_assignments(condominium_id, unit_id, effective_from desc);

create function public.assert_unit_communication_assignment_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  unit_condominium uuid;
  person_condominium uuid;
  person_status public.person_status;
begin
  select condominium_id into unit_condominium from public.units where id = new.unit_id;
  select condominium_id, status into person_condominium, person_status from public.people where id = new.person_id;
  if unit_condominium is null
    or person_condominium is null
    or new.condominium_id <> unit_condominium
    or new.condominium_id <> person_condominium then
    raise exception using errcode = 'P0001', message = 'communication_assignment_tenant_mismatch';
  end if;
  if tg_op = 'INSERT' and person_status <> 'active' then
    raise exception using errcode = 'P0001', message = 'communication_assignment_person_inactive';
  end if;
  return new;
end;
$$;

create trigger unit_communication_assignments_tenant_guard
before insert or update on public.unit_communication_assignments
for each row execute function public.assert_unit_communication_assignment_tenant();

alter table public.unit_communication_assignments enable row level security;

create policy unit_communication_assignments_read
on public.unit_communication_assignments
for select
to authenticated
using (public.can_read_people(condominium_id));

revoke all on public.unit_communication_assignments from anon, authenticated;
grant select on public.unit_communication_assignments to authenticated;

create function public.set_unit_communication_assignment(
  target_condominium uuid,
  target_unit uuid,
  target_person uuid,
  target_financial_role text,
  target_general_recipient boolean
)
returns public.unit_communication_assignments
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  target_role public.unit_financial_role;
  unit_row public.units;
  person_row public.people;
  current_assignment public.unit_communication_assignments;
  displaced_primary public.unit_communication_assignments;
  displaced_primary_status public.person_status;
  result public.unit_communication_assignments;
  now_value timestamptz := now();
begin
  if auth.uid() is null or not public.can_manage_people(target_condominium) then
    raise exception 'communication assignment denied';
  end if;
  if target_financial_role not in ('none', 'primary', 'additional') then
    raise exception using errcode = 'P0001', message = 'invalid_financial_role';
  end if;
  target_role := nullif(target_financial_role, 'none')::public.unit_financial_role;

  select * into unit_row from public.units
  where id = target_unit and condominium_id = target_condominium
  for update;
  select * into person_row from public.people
  where id = target_person and condominium_id = target_condominium;
  if unit_row.id is null or person_row.id is null then
    raise exception using errcode = 'P0001', message = 'communication_assignment_not_found';
  end if;
  select * into current_assignment from public.unit_communication_assignments
  where unit_id = target_unit and person_id = target_person and effective_to is null
  for update;

  if target_role = 'additional' and not exists (
    select 1 from public.unit_communication_assignments
    where unit_id = target_unit and effective_to is null and financial_role = 'primary'
      and person_id <> target_person
  ) and coalesce(current_assignment.financial_role::text, 'none') <> 'primary' then
    raise exception using errcode = 'P0001', message = 'financial_primary_required';
  end if;

  if current_assignment.id is not null
    and current_assignment.financial_role = 'primary'
    and target_role <> 'primary'
    and exists (
      select 1 from public.unit_communication_assignments
      where unit_id = target_unit and effective_to is null and financial_role = 'additional'
        and person_id <> target_person
    ) then
    raise exception using errcode = 'P0001', message = 'financial_primary_required';
  end if;

  if target_role is null and not target_general_recipient then
    if current_assignment.id is not null then
      update public.unit_communication_assignments
      set effective_to = now_value, ended_at = now_value, ended_by = auth.uid()
      where id = current_assignment.id;
    end if;
    return null;
  end if;

  if person_row.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'communication_assignment_person_inactive';
  end if;

  if current_assignment.id is not null
    and current_assignment.financial_role is not distinct from target_role
    and current_assignment.general_recipient = target_general_recipient then
    return current_assignment;
  end if;

  if current_assignment.id is not null then
    update public.unit_communication_assignments
    set effective_to = now_value, ended_at = now_value, ended_by = auth.uid()
    where id = current_assignment.id;
  end if;

  if target_role = 'primary' then
    select * into displaced_primary from public.unit_communication_assignments
    where unit_id = target_unit and effective_to is null and financial_role = 'primary'
    for update;
    if displaced_primary.id is not null then
      update public.unit_communication_assignments
      set effective_to = now_value, ended_at = now_value, ended_by = auth.uid()
      where id = displaced_primary.id;
      select status into displaced_primary_status
      from public.people where id = displaced_primary.person_id;
      if displaced_primary_status = 'active' then
        insert into public.unit_communication_assignments(
          condominium_id, unit_id, person_id, financial_role, general_recipient, effective_from, created_by
        ) values (
          target_condominium, target_unit, displaced_primary.person_id, 'additional',
          displaced_primary.general_recipient, now_value, auth.uid()
        );
      end if;
    end if;
  elsif target_role = 'additional' and not exists (
    select 1 from public.unit_communication_assignments
    where unit_id = target_unit and effective_to is null and financial_role = 'primary'
  ) then
    raise exception using errcode = 'P0001', message = 'financial_primary_required';
  end if;

  insert into public.unit_communication_assignments(
    condominium_id, unit_id, person_id, financial_role, general_recipient, effective_from, created_by
  ) values (
    target_condominium, target_unit, target_person, target_role, target_general_recipient,
    now_value, auth.uid()
  ) returning * into result;
  return result;
end;
$$;

create function public.resolve_unit_financial_recipients(
  target_condominium uuid,
  target_unit uuid,
  event_at timestamptz
)
returns table(person_id uuid, auth_user_id uuid, email text, source text)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  with event_context as (
    select (event_at at time zone coalesce((
      select s.timezone
      from public.condominium_notification_settings s
      where s.condominium_id = target_condominium
    ), 'UTC'))::date event_on
  ), explicit_mode as (
    select exists(
      select 1 from public.unit_communication_assignments a
      where a.condominium_id = target_condominium and a.unit_id = target_unit
        and a.financial_role in ('primary', 'additional')
        and a.effective_from <= event_at
        and (a.effective_to is null or a.effective_to > event_at)
    ) enabled
  ), explicit_recipients as (
    select a.person_id, p.auth_user_id, lower(nullif(trim(p.email), '')) email, 'explicit'::text source
    from public.unit_communication_assignments a
    join public.people p on p.id = a.person_id and p.condominium_id = a.condominium_id
    where a.condominium_id = target_condominium and a.unit_id = target_unit
      and a.financial_role in ('primary', 'additional') and p.status = 'active'
      and a.effective_from <= event_at and (a.effective_to is null or a.effective_to > event_at)
  ), legacy_recipients as (
    select distinct p.id person_id, p.auth_user_id, lower(nullif(trim(p.email), '')) email, 'legacy'::text source
    from public.people p
    where p.condominium_id = target_condominium and p.status = 'active'
      and (
        exists(select 1 from public.unit_owners o where o.person_id = p.id and o.unit_id = target_unit
          and o.starts_at <= (select event_on from event_context) and (o.ends_at is null or o.ends_at >= (select event_on from event_context)))
        or exists(select 1 from public.unit_occupancies o where o.person_id = p.id and o.unit_id = target_unit
          and o.occupancy_type in ('owner_occupant', 'tenant', 'authorized_occupant')
          and o.starts_at <= (select event_on from event_context) and (o.ends_at is null or o.ends_at >= (select event_on from event_context)))
      )
  )
  select * from explicit_recipients where (select enabled from explicit_mode)
  union all
  select * from legacy_recipients where not (select enabled from explicit_mode)
$$;

revoke all on function public.set_unit_communication_assignment(uuid,uuid,uuid,text,boolean), public.resolve_unit_financial_recipients(uuid,uuid,timestamptz) from public, anon;
grant execute on function public.set_unit_communication_assignment(uuid,uuid,uuid,text,boolean) to authenticated;
grant execute on function public.resolve_unit_financial_recipients(uuid,uuid,timestamptz) to service_role;

create or replace function public.expand_notification_event(target uuid)
returns table(delivery_id uuid)
language plpgsql security definer set search_path=public set row_security=off
as $$
declare
  e public.notification_events;
  payment_id uuid;
  recipient record;
  title_value text;
  body_value text;
  action_value text;
  template_value text;
  safe_payload jsonb;
  email_value text;
  email_allowed boolean;
  in_app_allowed boolean;
  condominium_email_allowed boolean;
  skip_code text;
  inserted_delivery uuid;
begin
  select * into e from public.notification_events where id=target for update;
  if e.id is null or e.status in ('expanded','failed') then return; end if;
  select s.email_enabled into condominium_email_allowed from public.condominium_notification_settings s where s.condominium_id=e.condominium_id;
  if e.aggregate_type='receipt' then select r.payment_id into payment_id from public.payment_receipts r where r.id=e.aggregate_id and r.condominium_id=e.condominium_id;
  elsif e.aggregate_type='payment' then payment_id:=e.aggregate_id; end if;
  title_value:=case e.event_type when 'payment_approved' then 'Pago aprobado' when 'payment_rejected' then 'Pago rechazado' when 'payment_correction_requested' then 'Corrección solicitada' when 'payment_reversed' then 'Pago reversado' when 'payment_receipt_issued' then 'Recibo disponible' when 'payment_submitted' then 'Pago pendiente de revisión' when 'receivable_due_soon' then 'Cargo próximo a vencer' when 'receivable_overdue' then 'Cargo vencido' else 'Nuevo cargo' end;
  body_value:=coalesce(e.payload->>'condominium_name','Habitta')||case when e.payload ? 'unit_code' then ' · Unidad '||(e.payload->>'unit_code') else '' end||case when e.payload ? 'amount' then ' · '||coalesce(e.payload->>'currency_code','')||' '||(e.payload->>'amount') else '' end;
  action_value:=case when e.aggregate_type='receipt' then '/app/condominiums/'||e.condominium_id||'/payments/'||payment_id||'/receipt' when e.aggregate_type='payment' then '/app/condominiums/'||e.condominium_id||'/payments/'||e.aggregate_id else '/app/condominiums/'||e.condominium_id||'/units/'||e.unit_id||'/statement' end;
  template_value:=case e.event_type when 'receivable_created' then 'new_receivable' when 'opening_balance_created' then 'new_receivable' when 'payment_submitted' then 'payment_submitted_admin' when 'payment_correction_requested' then 'payment_correction_requested' when 'payment_rejected' then 'payment_rejected' when 'payment_approved' then 'payment_approved' when 'payment_reversed' then 'payment_reversed' when 'payment_receipt_issued' then 'payment_receipt_available' when 'receivable_due_soon' then 'receivable_due_soon' else 'receivable_overdue' end;
  safe_payload:=jsonb_strip_nulls(jsonb_build_object('condominium_name',e.payload->>'condominium_name','unit_code',e.payload->>'unit_code','payer_name',e.payload->>'payer_name','description',e.payload->>'description','reason',e.payload->>'reason','amount',e.payload->>'amount','currency_code',e.payload->>'currency_code','due_date',e.payload->>'due_date','receipt_number',e.payload->>'receipt_number','action_url',action_value));
  for recipient in
    with financial as (select * from public.resolve_unit_financial_recipients(e.condominium_id,e.unit_id,e.created_at)),
    admins as (select cm.user_id auth_user_id from public.condominium_memberships cm where cm.condominium_id=e.condominium_id and cm.role in ('condominium_admin','accountant','payment_reviewer') union select om.user_id from public.organization_memberships om join public.condominiums c on c.organization_id=om.organization_id where c.id=e.condominium_id and om.role='organization_owner'),
    payment_parties as (select null::uuid person_id,p.submitted_by_user_id auth_user_id,null::text email,'payment'::text source from public.payments p where p.id=payment_id and p.condominium_id=e.condominium_id union select person.id,person.auth_user_id,lower(nullif(trim(person.email),'')),'payment' from public.payments p join public.people person on person.id=p.submitted_for_person_id and person.condominium_id=p.condominium_id where p.id=payment_id and p.condominium_id=e.condominium_id),
    selected as (select null::uuid person_id,auth_user_id,null::text email,'admin'::text source from admins where e.event_type='payment_submitted' union select * from financial where e.event_type in ('receivable_created','opening_balance_created','receivable_due_soon','receivable_overdue') union select * from financial where e.event_type in ('payment_correction_requested','payment_rejected','payment_approved','payment_reversed','payment_receipt_issued') union select * from payment_parties where e.event_type in ('payment_correction_requested','payment_rejected','payment_approved','payment_reversed','payment_receipt_issued'))
    select distinct on (coalesce(auth_user_id::text,'person:'||person_id::text)) person_id,auth_user_id,email,source from selected where auth_user_id is not null or source='explicit'
  loop
    if recipient.auth_user_id is not null then
      select coalesce(p.in_app_enabled,true),coalesce(p.email_enabled,true),lower(coalesce(nullif(trim(u.email),''),nullif(trim(person.email),''))) into in_app_allowed,email_allowed,email_value from auth.users u left join lateral(select p.email from public.people p where p.auth_user_id=u.id and p.condominium_id=e.condominium_id order by p.created_at limit 1) person on true left join public.notification_preferences p on p.condominium_id=e.condominium_id and p.user_id=recipient.auth_user_id and p.notification_type=e.event_type where u.id=recipient.auth_user_id;
      if e.event_type in ('payment_correction_requested','payment_rejected','payment_approved','payment_reversed','payment_receipt_issued') or in_app_allowed then insert into public.notifications(condominium_id,recipient_user_id,event_id,notification_type,title,body,action_url,metadata) values(e.condominium_id,recipient.auth_user_id,e.id,e.event_type,title_value,body_value,action_value,jsonb_strip_nulls(jsonb_build_object('unit_id',e.unit_id,'amount',e.payload->>'amount','currency_code',e.payload->>'currency_code'))) on conflict(event_id,recipient_user_id) do nothing; end if;
    else email_allowed:=true; email_value:=recipient.email; end if;
    if not condominium_email_allowed then skip_code:='condominium_email_disabled'; elsif not email_allowed then skip_code:='user_email_disabled'; elsif email_value is null or email_value !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then skip_code:='recipient_email_unavailable'; else skip_code:=null; end if;
    insert into public.notification_deliveries(condominium_id,event_id,recipient_user_id,recipient_email,channel,template_key,payload,status,deduplication_key,last_error_code) values(e.condominium_id,e.id,recipient.auth_user_id,email_value,'email',template_value,safe_payload,case when skip_code is null then 'pending'::public.notification_delivery_status else 'skipped'::public.notification_delivery_status end,case when recipient.auth_user_id is null then 'delivery:'||e.id::text||':person:'||recipient.person_id::text||':email' else 'delivery:'||e.id::text||':'||recipient.auth_user_id::text||':email' end,skip_code) on conflict(deduplication_key) do nothing returning id into inserted_delivery;
    if inserted_delivery is not null then delivery_id:=inserted_delivery; return next; end if;
  end loop;
  update public.notification_events set status='expanded',processed_at=now(),last_error_code=null where id=e.id;
end $$;
