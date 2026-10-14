-- HAB-PAYMENT-AGREEMENTS-CUMULATIVE-RECOVERY-003
-- An agreement is an auditable repayment schedule only.  It deliberately has no FK or trigger
-- into payments, payment_allocations, or receivable_ledger_entries.

create type public.payment_agreement_status as enum ('pending', 'accepted', 'rejected', 'cancelled');
create type public.payment_agreement_initiator as enum ('resident', 'administrator');
create type public.payment_agreement_event_type as enum ('proposed', 'counterproposed', 'accepted', 'rejected', 'cancelled');
alter type public.notification_event_type add value if not exists 'payment_agreement_proposed';
alter type public.notification_event_type add value if not exists 'payment_agreement_updated';
-- Preserve every aggregate type already accepted by the shared outbox. This migration is
-- cumulative: replacing the constraint with a hand-written subset would reject existing rows.
do $$
declare constraint_expression text;
begin
  select substring(pg_get_constraintdef(c.oid, true) from '^CHECK \((.*)\)$')
    into constraint_expression
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'notification_events'
    and c.conname = 'notification_events_aggregate_type_check';

  if constraint_expression is null then
    raise exception 'notification_events_aggregate_type_check is required before payment agreements';
  end if;

  execute 'alter table public.notification_events drop constraint notification_events_aggregate_type_check';
  execute format(
    'alter table public.notification_events add constraint notification_events_aggregate_type_check check ((%s) or aggregate_type = %L)',
    constraint_expression,
    'payment_agreement'
  );
end;
$$;

create table public.payment_agreements (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id),
  unit_id uuid not null references public.units(id),
  legal_obligor_person_id uuid not null references public.people(id),
  initiated_by public.payment_agreement_initiator not null,
  proposing_actor_kind public.payment_agreement_initiator not null,
  proposed_by_user_id uuid not null references auth.users(id),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  status public.payment_agreement_status not null default 'pending',
  revision_count integer not null default 1 check (revision_count between 1 and 5),
  schedule jsonb not null check (jsonb_typeof(schedule) = 'array' and jsonb_array_length(schedule) between 1 and 60),
  reason text null check (reason is null or char_length(reason) <= 500),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 180),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz null,
  cancelled_at timestamptz null,
  unique (condominium_id, proposed_by_user_id, idempotency_key)
);

create table public.payment_agreement_receivables (
  agreement_id uuid not null references public.payment_agreements(id) on delete restrict,
  receivable_item_id uuid not null references public.receivable_items(id) on delete restrict,
  primary key (agreement_id, receivable_item_id)
);

create table public.payment_agreement_events (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.payment_agreements(id) on delete restrict,
  sequence_number integer not null,
  event_type public.payment_agreement_event_type not null,
  actor_user_id uuid not null references auth.users(id),
  previous_status public.payment_agreement_status null,
  new_status public.payment_agreement_status not null,
  reason text null check (reason is null or char_length(reason) <= 500),
  schedule jsonb not null,
  created_at timestamptz not null default now(),
  unique (agreement_id, sequence_number)
);

create index payment_agreements_unit_status_idx on public.payment_agreements(unit_id, status);
create index payment_agreement_receivables_item_idx on public.payment_agreement_receivables(receivable_item_id);

-- Extend the shared notification scope validator without changing any existing aggregate path.
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
  elsif new.aggregate_type = 'governance' then
    select null::uuid, true into expected_unit, aggregate_found
    from public.governance_proposals p
    where p.id = new.aggregate_id and p.condominium_id = new.condominium_id;
  elsif new.aggregate_type = 'payment_agreement' then
    select a.unit_id, true into expected_unit, aggregate_found
    from public.payment_agreements a
    where a.id = new.aggregate_id and a.condominium_id = new.condominium_id;
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

-- A resident can propose only for an active, verified owner/tenant relation.  The proposal never
-- becomes a transfer of the owner's legal obligation; that person is stored independently.
create or replace function public.can_propose_payment_agreement(target_unit uuid)
returns boolean language sql stable security definer set search_path=public set row_security=off as $$
  select exists (
    select 1 from public.units u where u.id = target_unit and u.status = 'active' and (
      exists (select 1 from public.unit_owners o join public.people p on p.id=o.person_id
              where o.unit_id=u.id and p.auth_user_id=auth.uid() and p.status='active'
                and o.starts_at <= current_date and (o.ends_at is null or o.ends_at >= current_date))
      or exists (select 1 from public.unit_occupancies o join public.people p on p.id=o.person_id
                 where o.unit_id=u.id and o.occupancy_type='tenant' and p.auth_user_id=auth.uid()
                   and p.status='active' and o.starts_at <= current_date and (o.ends_at is null or o.ends_at >= current_date))
    )
  );
$$;

create or replace function public.payment_agreement_actor_kind(target_condominium uuid)
returns public.payment_agreement_initiator language sql stable security definer set search_path=public set row_security=off as $$
  select case when public.can_manage_receivables(target_condominium) then 'administrator'::public.payment_agreement_initiator else 'resident'::public.payment_agreement_initiator end;
$$;

create or replace function public.payment_agreement_schedule_is_valid(target jsonb, target_currency text)
returns boolean language sql immutable set search_path=public as $$
  select jsonb_typeof(target)='array' and jsonb_array_length(target) between 1 and 60 and not exists (
    select 1 from jsonb_array_elements(target) item
    where jsonb_typeof(item) <> 'object'
      or not (item ? 'due_date' and item ? 'amount')
      or (item->>'due_date') !~ '^\d{4}-\d{2}-\d{2}$'
      or not case when (item->>'amount') ~ '^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$' then (item->>'amount')::numeric > 0 else false end
      or (item ? 'currency_code' and item->>'currency_code' <> target_currency)
  );
$$;

create or replace function public.assert_payment_agreement_sources(target_agreement uuid)
returns void language plpgsql security definer set search_path=public set row_security=off as $$
declare a public.payment_agreements; invalid_count integer;
begin
  select * into a from public.payment_agreements where id=target_agreement;
  select count(*) into invalid_count from public.payment_agreement_receivables ar
  join public.receivable_items r on r.id=ar.receivable_item_id
  where ar.agreement_id=target_agreement and (r.condominium_id<>a.condominium_id or r.unit_id<>a.unit_id or r.currency_code<>a.currency_code or r.lifecycle_status<>'active');
  if invalid_count > 0 then raise exception 'agreement sources must be active receivables for the same unit and currency' using errcode='22023'; end if;
  if not exists(select 1 from public.payment_agreement_receivables where agreement_id=target_agreement) then raise exception 'agreement needs at least one receivable' using errcode='22023'; end if;
  if exists (
    select 1 from public.payment_agreement_receivables ar
    join public.payment_agreement_receivables other_ar on other_ar.receivable_item_id=ar.receivable_item_id
    join public.payment_agreements other on other.id=other_ar.agreement_id
    where ar.agreement_id=target_agreement and other.id<>target_agreement and other.status in ('pending','accepted')
  ) then raise exception 'receivable already has an active payment agreement' using errcode='23505'; end if;
end;
$$;

create or replace function public.create_payment_agreement(
  target_condominium uuid, target_unit uuid, target_legal_obligor uuid, target_currency text,
  target_schedule jsonb, target_receivable_ids uuid[], target_reason text, target_idempotency_key text
) returns public.payment_agreements language plpgsql security definer set search_path=public set row_security=off as $$
declare a public.payment_agreements; actor_kind public.payment_agreement_initiator; source_id uuid;
begin
  actor_kind:=public.payment_agreement_actor_kind(target_condominium);
  if not public.can_manage_receivables(target_condominium) and not public.can_propose_payment_agreement(target_unit) then raise exception 'payment agreement proposal denied' using errcode='42501'; end if;
  if not public.payment_agreement_schedule_is_valid(target_schedule,target_currency) then raise exception 'invalid agreement schedule' using errcode='22023'; end if;
  if not exists(select 1 from public.units where id=target_unit and condominium_id=target_condominium) then raise exception 'unit not found' using errcode='22023'; end if;
  if target_legal_obligor is null then
    select o.person_id into target_legal_obligor from public.unit_owners o join public.people p on p.id=o.person_id
    where o.unit_id=target_unit and p.status='active' and o.starts_at<=current_date and (o.ends_at is null or o.ends_at>=current_date)
    order by o.is_primary_contact desc, o.created_at asc limit 1;
  end if;
  if not exists(select 1 from public.unit_owners o join public.people p on p.id=o.person_id where o.unit_id=target_unit and o.person_id=target_legal_obligor and p.condominium_id=target_condominium and p.status='active' and o.starts_at<=current_date and (o.ends_at is null or o.ends_at>=current_date)) then raise exception 'legal obligor must be an active owner of the unit' using errcode='22023'; end if;
  select * into a from public.payment_agreements where condominium_id=target_condominium and proposed_by_user_id=auth.uid() and idempotency_key=target_idempotency_key;
  if a.id is not null then return a; end if;
  insert into public.payment_agreements(condominium_id,unit_id,legal_obligor_person_id,initiated_by,proposing_actor_kind,proposed_by_user_id,currency_code,schedule,reason,idempotency_key)
  values(target_condominium,target_unit,target_legal_obligor,actor_kind,actor_kind,auth.uid(),target_currency,target_schedule,nullif(target_reason,''),target_idempotency_key) returning * into a;
  foreach source_id in array target_receivable_ids loop insert into public.payment_agreement_receivables(agreement_id,receivable_item_id) values(a.id,source_id); end loop;
  perform public.assert_payment_agreement_sources(a.id);
  insert into public.payment_agreement_events(agreement_id,sequence_number,event_type,actor_user_id,previous_status,new_status,reason,schedule) values(a.id,1,'proposed',auth.uid(),null,'pending',a.reason,a.schedule);
  return a;
end;
$$;

create or replace function public.transition_payment_agreement(target_agreement uuid, target_action text, target_schedule jsonb default null, target_reason text default null, expected_version integer default null)
returns public.payment_agreements language plpgsql security definer set search_path=public set row_security=off as $$
declare a public.payment_agreements; actor_kind public.payment_agreement_initiator; event_kind public.payment_agreement_event_type; next_status public.payment_agreement_status; allowed boolean:=false; is_current_proposer boolean:=false;
begin
  select * into a from public.payment_agreements where id=target_agreement for update;
  if a.id is null then raise exception 'payment agreement not found' using errcode='P0002'; end if;
  if expected_version is not null and a.version<>expected_version then raise exception 'payment agreement changed' using errcode='40001'; end if;
  actor_kind:=public.payment_agreement_actor_kind(a.condominium_id);
  -- Whoever holds the outstanding proposal (initial proposer, or the last counterparty to counter)
  -- can only withdraw it; the other role must respond, so a counter can never self-accept.
  is_current_proposer := actor_kind=a.proposing_actor_kind;
  if target_action='counter' then
    allowed := a.status='pending' and a.revision_count<5 and not is_current_proposer and (public.can_manage_receivables(a.condominium_id) or public.can_propose_payment_agreement(a.unit_id));
    if not allowed or target_schedule is null or not public.payment_agreement_schedule_is_valid(target_schedule,a.currency_code) then raise exception 'payment agreement counterproposal denied' using errcode='42501'; end if;
    update public.payment_agreements set schedule=target_schedule,reason=nullif(target_reason,''),revision_count=revision_count+1,proposing_actor_kind=actor_kind,version=version+1,updated_at=now() where id=a.id returning * into a;
    event_kind:='counterproposed'; next_status:='pending';
  elsif target_action in ('accept','reject','cancel') then
    allowed := a.status='pending' and (case when target_action='cancel' then is_current_proposer else not is_current_proposer end) and (public.can_manage_receivables(a.condominium_id) or public.can_propose_payment_agreement(a.unit_id));
    if not allowed then raise exception 'payment agreement transition denied' using errcode='42501'; end if;
    next_status:=case target_action when 'accept' then 'accepted'::public.payment_agreement_status when 'reject' then 'rejected'::public.payment_agreement_status else 'cancelled'::public.payment_agreement_status end;
    event_kind:=case target_action when 'accept' then 'accepted'::public.payment_agreement_event_type when 'reject' then 'rejected'::public.payment_agreement_event_type else 'cancelled'::public.payment_agreement_event_type end;
    update public.payment_agreements set status=next_status,reason=coalesce(nullif(target_reason,''),reason),version=version+1,updated_at=now(),accepted_at=case when next_status='accepted' then now() else accepted_at end,cancelled_at=case when next_status='cancelled' then now() else cancelled_at end where id=a.id returning * into a;
  else raise exception 'invalid payment agreement action' using errcode='22023'; end if;
  insert into public.payment_agreement_events(agreement_id,sequence_number,event_type,actor_user_id,previous_status,new_status,reason,schedule)
  values(a.id,(select coalesce(max(sequence_number),0)+1 from public.payment_agreement_events where agreement_id=a.id),event_kind,auth.uid(),'pending',next_status,nullif(target_reason,''),a.schedule);
  return a;
end;
$$;

create view public.payment_agreement_progress with (security_invoker=true) as
select a.id agreement_id,a.condominium_id,a.unit_id,a.currency_code,
  coalesce(sum(case when e.direction='credit' and not exists (select 1 from public.receivable_ledger_entries reversal where reversal.reversal_of_entry_id=e.id) then e.amount else 0 end),0)::numeric as posted_amount,
  coalesce(sum(case when e.direction='debit' then e.amount else -e.amount end),0)::numeric as current_source_outstanding
from public.payment_agreements a
join public.payment_agreement_receivables ar on ar.agreement_id=a.id
join public.receivable_ledger_entries e on e.receivable_item_id=ar.receivable_item_id
group by a.id,a.condominium_id,a.unit_id,a.currency_code;

alter table public.payment_agreements enable row level security;
alter table public.payment_agreement_receivables enable row level security;
alter table public.payment_agreement_events enable row level security;
create policy payment_agreements_read on public.payment_agreements for select to authenticated using (public.can_read_receivables(condominium_id) or public.can_propose_payment_agreement(unit_id));
create policy payment_agreement_sources_read on public.payment_agreement_receivables for select to authenticated using (exists(select 1 from public.payment_agreements a where a.id=agreement_id and (public.can_read_receivables(a.condominium_id) or public.can_propose_payment_agreement(a.unit_id))));
create policy payment_agreement_events_read on public.payment_agreement_events for select to authenticated using (exists(select 1 from public.payment_agreements a where a.id=agreement_id and (public.can_read_receivables(a.condominium_id) or public.can_propose_payment_agreement(a.unit_id))));

revoke all on public.payment_agreements,public.payment_agreement_receivables,public.payment_agreement_events,public.payment_agreement_progress from anon,authenticated;
grant select on public.payment_agreements,public.payment_agreement_receivables,public.payment_agreement_events,public.payment_agreement_progress to authenticated;
revoke all on function public.can_propose_payment_agreement(uuid),public.payment_agreement_actor_kind(uuid),public.payment_agreement_schedule_is_valid(jsonb,text),public.assert_payment_agreement_sources(uuid),public.create_payment_agreement(uuid,uuid,uuid,text,jsonb,uuid[],text,text),public.transition_payment_agreement(uuid,text,jsonb,text,integer) from public,anon;
-- The select policies call this SECURITY DEFINER helper for each candidate row. Keep it
-- unavailable to anon, but permit authenticated callers so RLS can evaluate tenant scope.
grant execute on function public.can_propose_payment_agreement(uuid),public.create_payment_agreement(uuid,uuid,uuid,text,jsonb,uuid[],text,text),public.transition_payment_agreement(uuid,text,jsonb,text,integer) to authenticated,service_role;

-- Reuse the governed notification-event queue. Agreement events notify only the proposing actor,
-- the recorded legal obligor (when that person has an account), and financial administrators.
create or replace function public.enqueue_payment_agreement_notification()
returns trigger language plpgsql security definer set search_path=public set row_security=off as $$
declare a public.payment_agreements; kind public.notification_event_type;
begin
  select * into a from public.payment_agreements where id=new.agreement_id;
  kind := case when new.event_type='proposed' then 'payment_agreement_proposed'::public.notification_event_type else 'payment_agreement_updated'::public.notification_event_type end;
  insert into public.notification_events(condominium_id,event_type,aggregate_type,aggregate_id,unit_id,actor_user_id,payload,deduplication_key)
  values(a.condominium_id,kind,'payment_agreement',a.id,a.unit_id,new.actor_user_id,jsonb_build_object('condominium_id',a.condominium_id,'agreement_id',a.id,'status',new.new_status,'event_type',new.event_type),'payment-agreement:'||new.id::text)
  on conflict(deduplication_key) do nothing;
  return new;
end;
$$;
create trigger payment_agreement_event_notification after insert on public.payment_agreement_events for each row execute function public.enqueue_payment_agreement_notification();

create or replace function public.process_notification_event(target uuid)
returns boolean language plpgsql security definer set search_path=public set row_security=off as $$
declare e public.notification_events; attempts_value integer; recipient record; title_value text;
begin
  select * into e from public.notification_events where id=target for update;
  if e.id is null or e.status='expanded' then return true; end if;
  begin
    if e.aggregate_type='payment_agreement' then
      title_value:=case when e.event_type='payment_agreement_proposed' then 'Propuesta de acuerdo de pago' else 'Actualización de acuerdo de pago' end;
      for recipient in select distinct user_id from (
        select a.proposed_by_user_id user_id from public.payment_agreements a where a.id=e.aggregate_id
        union select p.auth_user_id from public.payment_agreements a join public.people p on p.id=a.legal_obligor_person_id where a.id=e.aggregate_id and p.auth_user_id is not null
        union select cm.user_id from public.condominium_memberships cm where cm.condominium_id=e.condominium_id and cm.role in ('condominium_admin','accountant')
        union select om.user_id from public.organization_memberships om join public.condominiums c on c.organization_id=om.organization_id where c.id=e.condominium_id and om.role='organization_owner'
      ) recipients loop
        insert into public.notifications(condominium_id,recipient_user_id,event_id,notification_type,title,body,action_url,metadata)
        values(e.condominium_id,recipient.user_id,e.id,e.event_type,title_value,'Hay una actualización en el calendario propuesto.','/app/fees',jsonb_build_object('agreement_id',e.aggregate_id,'unit_id',e.unit_id,'status',e.payload->>'status'))
        on conflict(event_id,recipient_user_id) do nothing;
      end loop;
      update public.notification_events set status='expanded',processed_at=now(),attempts=attempts+1 where id=e.id;
    else
      perform public.expand_notification_event(target);
    end if;
    return true;
  exception when others then
    select attempts into attempts_value from public.notification_events where id=target for update;
    update public.notification_events set status=case when attempts_value>=5 then 'failed'::public.notification_event_status else 'pending'::public.notification_event_status end,
      available_at=case when attempts_value>=5 then available_at else now()+make_interval(mins=>attempts_value*attempts_value) end,
      processed_at=case when attempts_value>=5 then now() else null end,last_error_code=sqlstate where id=target;
    return false;
  end;
end;
$$;
revoke all on function public.enqueue_payment_agreement_notification(),public.process_notification_event(uuid) from public,authenticated;
grant execute on function public.process_notification_event(uuid) to service_role;
