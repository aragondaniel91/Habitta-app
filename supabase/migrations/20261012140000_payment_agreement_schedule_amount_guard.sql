-- P6-006: an installment schedule is a promise for the current receivable balance,
-- never a second receivable or a financial allocation.
create or replace function public.payment_agreement_schedule_is_valid(target jsonb, target_currency text)
returns boolean language sql immutable set search_path=public as $$
  select jsonb_typeof(target) = 'array'
    and jsonb_array_length(target) between 1 and 60
    and not exists (
      select 1 from jsonb_array_elements(target) item
      where jsonb_typeof(item) <> 'object'
        or not (item ? 'due_date' and item ? 'amount')
        or (item->>'due_date') !~ '^\d{4}-\d{2}-\d{2}$'
        or not case when (item->>'amount') ~ '^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$'
                    then (item->>'amount')::numeric > 0 else false end
        or (item ? 'currency_code' and item->>'currency_code' <> target_currency)
    )
    and not exists (
      select 1
      from (
        select (item->>'due_date')::date as due_date,
               lag((item->>'due_date')::date) over (order by ordinality) as previous_due_date
        from jsonb_array_elements(target) with ordinality as rows(item, ordinality)
      ) dates
      where previous_due_date is not null and due_date <= previous_due_date
    );
$$;

create or replace function public.assert_payment_agreement_sources(target_agreement uuid)
returns void language plpgsql security definer set search_path=public set row_security=off as $$
declare
  a public.payment_agreements;
  invalid_count integer;
  outstanding_total numeric(18,2);
  schedule_total numeric(18,2);
begin
  select * into a from public.payment_agreements where id = target_agreement for update;
  if a.id is null then raise exception 'payment agreement not found' using errcode='P0002'; end if;

  select count(*) into invalid_count
  from public.payment_agreement_receivables ar
  join public.receivable_items r on r.id = ar.receivable_item_id
  where ar.agreement_id = target_agreement
    and (r.condominium_id <> a.condominium_id or r.unit_id <> a.unit_id
      or r.currency_code <> a.currency_code or r.lifecycle_status <> 'active');
  if invalid_count > 0 then
    raise exception 'agreement sources must be active receivables for the same unit and currency' using errcode='22023';
  end if;
  if not exists (select 1 from public.payment_agreement_receivables where agreement_id = target_agreement) then
    raise exception 'agreement needs at least one receivable' using errcode='22023';
  end if;
  if exists (
    select 1
    from public.payment_agreement_receivables ar
    join public.payment_agreement_receivables other_ar on other_ar.receivable_item_id = ar.receivable_item_id
    join public.payment_agreements other on other.id = other_ar.agreement_id
    where ar.agreement_id = target_agreement and other.id <> target_agreement
      and other.status in ('pending', 'accepted')
  ) then
    raise exception 'receivable already has an active payment agreement' using errcode='23505';
  end if;

  select coalesce(sum(b.outstanding_amount::numeric), 0)::numeric(18,2)
    into outstanding_total
  from public.payment_agreement_receivables ar
  join public.receivable_balances b on b.id = ar.receivable_item_id
  where ar.agreement_id = target_agreement;
  select coalesce(sum((item->>'amount')::numeric), 0)::numeric(18,2)
    into schedule_total
  from jsonb_array_elements(a.schedule) item;
  if outstanding_total <= 0 or schedule_total <> outstanding_total then
    raise exception 'agreement schedule must equal the current outstanding receivable amount' using errcode='22023';
  end if;
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
  is_current_proposer := actor_kind=a.proposing_actor_kind;
  if target_action='counter' then
    allowed := a.status='pending' and a.revision_count<5 and not is_current_proposer and (public.can_manage_receivables(a.condominium_id) or public.can_propose_payment_agreement(a.unit_id));
    if not allowed or target_schedule is null or not public.payment_agreement_schedule_is_valid(target_schedule,a.currency_code) then raise exception 'payment agreement counterproposal denied' using errcode='42501'; end if;
    update public.payment_agreements set schedule=target_schedule,reason=nullif(target_reason,''),revision_count=revision_count+1,proposing_actor_kind=actor_kind,version=version+1,updated_at=now() where id=a.id returning * into a;
    perform public.assert_payment_agreement_sources(a.id);
    event_kind:='counterproposed'; next_status:='pending';
  elsif target_action in ('accept','reject','cancel') then
    allowed := a.status='pending' and (case when target_action='cancel' then is_current_proposer else not is_current_proposer end) and (public.can_manage_receivables(a.condominium_id) or public.can_propose_payment_agreement(a.unit_id));
    if not allowed then raise exception 'payment agreement transition denied' using errcode='42501'; end if;
    if target_action = 'accept' then perform public.assert_payment_agreement_sources(a.id); end if;
    next_status:=case target_action when 'accept' then 'accepted'::public.payment_agreement_status when 'reject' then 'rejected'::public.payment_agreement_status else 'cancelled'::public.payment_agreement_status end;
    event_kind:=case target_action when 'accept' then 'accepted'::public.payment_agreement_event_type when 'reject' then 'rejected'::public.payment_agreement_event_type else 'cancelled'::public.payment_agreement_event_type end;
    update public.payment_agreements set status=next_status,reason=coalesce(nullif(target_reason,''),reason),version=version+1,updated_at=now(),accepted_at=case when next_status='accepted' then now() else accepted_at end,cancelled_at=case when next_status='cancelled' then now() else cancelled_at end where id=a.id returning * into a;
  else raise exception 'invalid payment agreement action' using errcode='22023'; end if;
  insert into public.payment_agreement_events(agreement_id,sequence_number,event_type,actor_user_id,previous_status,new_status,reason,schedule)
  values(a.id,(select coalesce(max(sequence_number),0)+1 from public.payment_agreement_events where agreement_id=a.id),event_kind,auth.uid(),'pending',next_status,nullif(target_reason,''),a.schedule);
  return a;
end;
$$;
