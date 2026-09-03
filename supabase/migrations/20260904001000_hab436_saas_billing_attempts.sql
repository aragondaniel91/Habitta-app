-- HAB-436: Habitta-owned SaaS billing attempts and due-period scheduling.
-- Stripe remains a payment execution provider; Habitta owns due dates, amounts, retries and state.

create table habitta_internal.saas_billing_attempts (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  billing_cycle_on date not null,
  attempt_no integer not null check (attempt_no between 1 and 3),
  expected_amount numeric(14,2) not null check (expected_amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  provider text not null check (provider ~ '^[a-z0-9][a-z0-9_-]{1,31}$'),
  provider_customer_ref text not null,
  payment_method_ref text not null,
  provider_payment_ref text,
  status text not null default 'pending'
    check (status in ('pending','provider_created','succeeded','failed','rejected')),
  claimed_at timestamptz,
  next_retry_at timestamptz not null default now(),
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(subscription_id, billing_cycle_on, attempt_no)
);

create unique index saas_billing_attempts_provider_payment_uq
  on habitta_internal.saas_billing_attempts(provider, provider_payment_ref)
  where provider_payment_ref is not null;
create index saas_billing_attempts_due_idx
  on habitta_internal.saas_billing_attempts(status, next_retry_at, billing_cycle_on);

revoke all on table habitta_internal.saas_billing_attempts from public, anon, authenticated, service_role;

create or replace function habitta_internal.saas_due_on_v1(p_subscription public.subscriptions)
returns date
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_subscription.current_period_end, p_subscription.trial_ends_at::date)
$$;

revoke all on function habitta_internal.saas_due_on_v1(public.subscriptions)
  from public, anon, authenticated, service_role;

create or replace function public.advance_zero_due_saas_periods_v1(
  p_run_at timestamptz default now(),
  p_limit_count integer default 25
)
returns integer
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  candidate record;
  expected record;
  current_sub public.subscriptions;
  current_term public.subscription_terms;
  due_on date;
  next_period_end date;
  advanced integer := 0;
begin
  if p_limit_count < 1 or p_limit_count > 100 then
    raise exception using errcode = '22023', message = 'invalid zero-due processing limit';
  end if;

  for candidate in
    select s.id
    from public.subscriptions s
    join habitta_internal.saas_billing_accounts a on a.subscription_id = s.id
    where s.status in ('trialing','active','past_due')
      and s.commercial_status = 'confirmed'
      and s.billing_consent_at is not null
      and s.billing_method_ready_at is not null
      and s.auto_bill_enabled
      and a.provider_customer_ref is not null
      and a.payment_method_ref is not null
      and habitta_internal.saas_due_on_v1(s) is not null
      and habitta_internal.saas_due_on_v1(s) <= p_run_at::date
    order by habitta_internal.saas_due_on_v1(s), s.id
    limit p_limit_count
  loop
    select * into current_sub from public.subscriptions where id = candidate.id for update;
    due_on := habitta_internal.saas_due_on_v1(current_sub);
    if due_on is null or due_on > p_run_at::date then continue; end if;

    select * into expected
    from habitta_internal.expected_saas_period_v1(current_sub.id, due_on);
    if expected.amount is distinct from 0::numeric then continue; end if;

    select * into current_term
    from public.subscription_terms t
    where t.subscription_id = current_sub.id
      and t.effective_from <= due_on
      and (t.effective_to is null or t.effective_to > due_on)
    order by t.effective_from desc, t.created_at desc
    limit 1;
    if current_term.id is null then continue; end if;

    next_period_end := case current_term.billing_period
      when 'monthly' then due_on + interval '1 month'
      when 'annual' then due_on + interval '1 year'
      else null
    end::date;
    if next_period_end is null then continue; end if;

    update public.subscriptions
       set status = 'active',
           current_period_end = next_period_end,
           updated_at = p_run_at
     where id = current_sub.id;

    insert into public.subscription_events(
      subscription_id, condominium_id, event_type, from_status, to_status,
      from_plan, to_plan, actor_user_id, reason, payload, created_at
    ) values (
      current_sub.id, current_sub.condominium_id, 'saas_zero_due_period_advanced',
      current_sub.status, 'active', current_term.plan_code, current_term.plan_code,
      null, 'commercial_period_due_zero',
      pg_catalog.jsonb_build_object(
        'billing_cycle_on', due_on,
        'amount', 0,
        'currency', expected.currency,
        'next_period_end', next_period_end,
        'resident_finance_mutated', false
      ),
      p_run_at
    );
    advanced := advanced + 1;
  end loop;

  return advanced;
end;
$$;

create or replace function public.claim_due_saas_billing_attempts_v1(
  p_run_at timestamptz default now(),
  p_limit_count integer default 20
)
returns table(
  attempt_id uuid,
  subscription_id uuid,
  condominium_id uuid,
  billing_cycle_on date,
  attempt_no integer,
  expected_amount numeric,
  currency text,
  provider text,
  provider_customer_ref text,
  payment_method_ref text
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  candidate record;
  expected record;
  latest habitta_internal.saas_billing_attempts;
  due_on date;
  created_id uuid;
begin
  if p_limit_count < 1 or p_limit_count > 100 then
    raise exception using errcode = '22023', message = 'invalid billing claim limit';
  end if;

  -- Release only claims whose Worker disappeared before attaching a provider payment reference.
  update habitta_internal.saas_billing_attempts a
     set claimed_at = null,
         updated_at = p_run_at
   where a.status = 'pending'
     and a.provider_payment_ref is null
     and a.claimed_at < p_run_at - interval '10 minutes';

  for candidate in
    select s.*, a.provider, a.provider_customer_ref, a.payment_method_ref
    from public.subscriptions s
    join habitta_internal.saas_billing_accounts a on a.subscription_id = s.id
    where s.status in ('trialing','active','past_due')
      and s.commercial_status = 'confirmed'
      and s.billing_consent_at is not null
      and s.billing_method_ready_at is not null
      and s.auto_bill_enabled
      and a.provider_customer_ref is not null
      and a.payment_method_ref is not null
      and habitta_internal.saas_due_on_v1(s) is not null
      and habitta_internal.saas_due_on_v1(s) <= p_run_at::date
    order by habitta_internal.saas_due_on_v1(s), s.id
  loop
    due_on := habitta_internal.saas_due_on_v1(candidate);
    select * into expected from habitta_internal.expected_saas_period_v1(candidate.id, due_on);
    if expected.amount is null or expected.amount <= 0 then continue; end if;

    select * into latest
    from habitta_internal.saas_billing_attempts a
    where a.subscription_id = candidate.id and a.billing_cycle_on = due_on
    order by a.attempt_no desc
    limit 1;

    created_id := null;
    if latest.id is null then
      insert into habitta_internal.saas_billing_attempts(
        subscription_id, condominium_id, billing_cycle_on, attempt_no,
        expected_amount, currency, provider, provider_customer_ref, payment_method_ref,
        next_retry_at, created_at, updated_at
      ) values (
        candidate.id, candidate.condominium_id, due_on, 1,
        expected.amount, expected.currency, candidate.provider,
        candidate.provider_customer_ref, candidate.payment_method_ref,
        p_run_at, p_run_at, p_run_at
      ) returning id into created_id;
    elsif latest.status = 'failed'
      and latest.attempt_no < 3
      and latest.next_retry_at <= p_run_at
    then
      insert into habitta_internal.saas_billing_attempts(
        subscription_id, condominium_id, billing_cycle_on, attempt_no,
        expected_amount, currency, provider, provider_customer_ref, payment_method_ref,
        next_retry_at, created_at, updated_at
      ) values (
        candidate.id, candidate.condominium_id, due_on, latest.attempt_no + 1,
        latest.expected_amount, latest.currency, candidate.provider,
        candidate.provider_customer_ref, candidate.payment_method_ref,
        p_run_at, p_run_at, p_run_at
      ) returning id into created_id;
    end if;
  end loop;

  return query
  with claimed as (
    select a.id
    from habitta_internal.saas_billing_attempts a
    where a.status = 'pending'
      and a.provider_payment_ref is null
      and a.next_retry_at <= p_run_at
      and a.claimed_at is null
    order by a.billing_cycle_on, a.created_at
    for update skip locked
    limit p_limit_count
  ), updated as (
    update habitta_internal.saas_billing_attempts a
       set claimed_at = p_run_at,
           updated_at = p_run_at
      from claimed c
     where a.id = c.id
    returning a.*
  )
  select u.id, u.subscription_id, u.condominium_id, u.billing_cycle_on, u.attempt_no,
         u.expected_amount, u.currency, u.provider, u.provider_customer_ref, u.payment_method_ref
  from updated u;
end;
$$;

create or replace function public.attach_saas_billing_provider_payment_v1(
  p_attempt_id uuid,
  p_provider text,
  p_provider_payment_ref text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  attempt habitta_internal.saas_billing_attempts;
  normalized_provider text := lower(btrim(p_provider));
  normalized_payment_ref text := nullif(btrim(coalesce(p_provider_payment_ref, '')), '');
begin
  select * into attempt
  from habitta_internal.saas_billing_attempts a
  where a.id = p_attempt_id
  for update;
  if attempt.id is null then raise exception using errcode='P0002', message='SaaS billing attempt not found'; end if;
  if normalized_payment_ref is null then raise exception using errcode='22023', message='provider payment reference is required'; end if;
  if attempt.provider <> normalized_provider then raise exception using errcode='23514', message='billing attempt provider mismatch'; end if;

  if attempt.provider_payment_ref is not null then
    if attempt.provider_payment_ref = normalized_payment_ref then
      return pg_catalog.jsonb_build_object('attempt_id',attempt.id,'status',attempt.status,'idempotent_replay',true);
    end if;
    raise exception using errcode='23514', message='billing attempt already attached to different provider payment';
  end if;

  update habitta_internal.saas_billing_attempts
     set provider_payment_ref = normalized_payment_ref,
         status = 'provider_created',
         claimed_at = null,
         updated_at = now()
   where id = attempt.id;

  return pg_catalog.jsonb_build_object('attempt_id',attempt.id,'status','provider_created','idempotent_replay',false);
end;
$$;

create or replace function public.release_saas_billing_attempt_for_retry_v1(
  p_attempt_id uuid,
  p_error_code text,
  p_retry_at timestamptz default now() + interval '15 minutes'
)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  update habitta_internal.saas_billing_attempts a
     set claimed_at = null,
         next_retry_at = p_retry_at,
         last_error_code = left(nullif(btrim(coalesce(p_error_code,'')),''),120),
         updated_at = now()
   where a.id = p_attempt_id
     and a.status = 'pending'
     and a.provider_payment_ref is null;
  return found;
end;
$$;

create or replace function habitta_internal.sync_saas_billing_attempt_from_provider_event_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if new.provider_payment_ref is null or new.event_type not in ('charge_succeeded','charge_failed') then
    return new;
  end if;

  update habitta_internal.saas_billing_attempts a
     set status = case
           when new.processing_status = 'rejected' then 'rejected'
           when new.event_type = 'charge_succeeded' then 'succeeded'
           else 'failed'
         end,
         next_retry_at = case
           when new.processing_status = 'applied' and new.event_type = 'charge_failed'
             then greatest(new.created_at + interval '1 hour', now())
           else a.next_retry_at
         end,
         last_error_code = case
           when new.processing_status = 'rejected' then new.rejection_reason
           when new.event_type = 'charge_failed' then 'provider_charge_failed'
           else null
         end,
         claimed_at = null,
         updated_at = now()
   where a.provider = new.provider
     and a.provider_payment_ref = new.provider_payment_ref;
  return new;
end;
$$;

drop trigger if exists sync_saas_billing_attempt_from_provider_event_v1
  on habitta_internal.billing_provider_events;
create trigger sync_saas_billing_attempt_from_provider_event_v1
after insert or update of processing_status, rejection_reason
on habitta_internal.billing_provider_events
for each row execute function habitta_internal.sync_saas_billing_attempt_from_provider_event_v1();

revoke all on function public.advance_zero_due_saas_periods_v1(timestamptz,integer)
  from public, anon, authenticated, service_role;
revoke all on function public.claim_due_saas_billing_attempts_v1(timestamptz,integer)
  from public, anon, authenticated, service_role;
revoke all on function public.attach_saas_billing_provider_payment_v1(uuid,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.release_saas_billing_attempt_for_retry_v1(uuid,text,timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function habitta_internal.sync_saas_billing_attempt_from_provider_event_v1()
  from public, anon, authenticated, service_role;

grant execute on function public.advance_zero_due_saas_periods_v1(timestamptz,integer) to service_role;
grant execute on function public.claim_due_saas_billing_attempts_v1(timestamptz,integer) to service_role;
grant execute on function public.attach_saas_billing_provider_payment_v1(uuid,text,text) to service_role;
grant execute on function public.release_saas_billing_attempt_for_retry_v1(uuid,text,timestamptz) to service_role;

comment on table habitta_internal.saas_billing_attempts is
  'HAB-436 private SaaS billing execution attempts. Amount/currency are Habitta-derived; provider payment refs are opaque.';
comment on function public.advance_zero_due_saas_periods_v1(timestamptz,integer) is
  'HAB-436 service-only advancement of $0 SaaS periods without provider charges or resident-finance records.';
comment on function public.claim_due_saas_billing_attempts_v1(timestamptz,integer) is
  'HAB-436 service-only claim of due positive SaaS charges with bounded retries and Habitta-owned expected amounts.';
