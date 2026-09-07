-- HAB-494 (#483 Phase 3): plan change, end-of-term cancellation and reactivation.
--
-- HAB-424 gave Platform Admin a way to start a trial, activate manually, apply a coupon and gift
-- months. There was still no approved way to change what a customer contracted, end the
-- relationship, or bring a cancelled customer back. This migration adds exactly those three
-- mutations plus the deterministic cron transition cancellation requires, following the same
-- shape as every commercial RPC before it: SECURITY DEFINER, authorization checked in the
-- function body, one subscription_events row per mutation, subscription_terms closed and
-- reopened instead of rewritten, and no row here ever represents a payment.

alter table public.subscriptions
  add column cancel_at date;

comment on column public.subscriptions.cancel_at is
  'HAB-494: end-of-term cancellation date the operator scheduled. Set by platform_request_subscription_cancellation, cleared by platform_undo_scheduled_cancellation, left in place as the historical effective date once process_scheduled_cancellations() has run.';

-- ------------------------------------------------------------------ plan change (immediate)

create or replace function public.platform_change_plan(
  p_condominium_id uuid,
  p_new_plan_code text,
  p_new_billing_period text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_sub public.subscriptions;
  current_term public.subscription_terms;
  selected_plan public.plans;
  amount numeric(10,2);
  updated_term public.subscription_terms;
begin
  perform public.hab424_require_platform_admin();
  current_sub := public.hab424_customer_subscription(p_condominium_id);
  if current_sub.id is null then
    raise exception using errcode = 'P0002', message = 'subscription not found';
  end if;
  if current_sub.status not in ('trialing', 'active', 'past_due') then
    raise exception using errcode = '23514', message = 'plan changes require a trialing, active or past-due subscription';
  end if;
  if current_sub.cancel_at is not null then
    raise exception using errcode = '23514', message = 'resolve the pending cancellation before changing plan';
  end if;

  select * into selected_plan from public.plans where code = p_new_plan_code and is_public;
  if selected_plan.code is null then
    raise exception using errcode = '22023', message = 'public plan not found';
  end if;
  if p_new_billing_period not in ('monthly', 'annual') then
    raise exception using errcode = '22023', message = 'billing period must be monthly or annual';
  end if;

  select * into current_term
  from public.subscription_terms t
  where t.subscription_id = current_sub.id
    and t.effective_to is null
  order by t.effective_from desc
  limit 1;

  if current_term.id is null then
    raise exception using errcode = '23514', message = 'subscription has no open commercial term to change';
  end if;
  if current_term.plan_code = selected_plan.code and current_term.billing_period = p_new_billing_period then
    raise exception using errcode = '22023', message = 'requested plan and billing period match the current term';
  end if;
  if current_term.effective_from >= current_date then
    raise exception using errcode = '23514', message = 'cannot change plan the same day the current term started; try again tomorrow';
  end if;

  amount := case when p_new_billing_period = 'annual'
    then selected_plan.catalog_annual_usd
    else selected_plan.catalog_monthly_usd
  end;

  update public.subscription_terms
     set effective_to = current_date
   where id = current_term.id
   returning * into updated_term;

  insert into public.subscription_terms(
    subscription_id, plan_code, contracted_period_amount, currency, billing_period,
    contracted_unit_limit, unlimited_units, origin, catalog_reference_amount,
    authorized_by, effective_from, effective_to, note
  ) values (
    current_sub.id, selected_plan.code, amount, 'USD', p_new_billing_period,
    selected_plan.default_unit_limit, false, 'catalog', amount,
    auth.uid(), current_date, null, 'HAB-494 plan change term'
  );

  update public.subscriptions set updated_at = now() where id = current_sub.id;

  insert into public.subscription_events(
    subscription_id, condominium_id, event_type, from_status, to_status,
    from_plan, to_plan, actor_user_id, reason, payload
  ) values (
    current_sub.id, p_condominium_id, 'plan_changed', current_sub.status, current_sub.status,
    current_term.plan_code, selected_plan.code, auth.uid(), nullif(btrim(p_reason), ''),
    jsonb_build_object(
      'from_billing_period', current_term.billing_period,
      'to_billing_period', p_new_billing_period,
      'from_amount', current_term.contracted_period_amount,
      'to_amount', amount,
      'effective_from', current_date
    )
  );

  return jsonb_build_object(
    'subscription_id', current_sub.id,
    'plan_code', selected_plan.code,
    'billing_period', p_new_billing_period,
    'contracted_period_amount', amount,
    'effective_from', current_date
  );
end;
$$;

revoke all on function public.platform_change_plan(uuid,text,text,text) from public, anon;
grant execute on function public.platform_change_plan(uuid,text,text,text) to authenticated, service_role;

-- ------------------------------------------------------------------ end-of-term cancellation

create or replace function public.platform_request_subscription_cancellation(
  p_condominium_id uuid,
  p_effective_at date default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_sub public.subscriptions;
  current_term public.subscription_terms;
  effective_on date;
begin
  perform public.hab424_require_platform_admin();
  current_sub := public.hab424_customer_subscription(p_condominium_id);
  if current_sub.id is null then
    raise exception using errcode = 'P0002', message = 'subscription not found';
  end if;
  if current_sub.status = 'cancelled' then
    raise exception using errcode = '23514', message = 'subscription is already cancelled';
  end if;
  if current_sub.cancel_at is not null then
    raise exception using errcode = '23514', message = 'a cancellation is already scheduled for this subscription';
  end if;

  effective_on := coalesce(
    p_effective_at,
    current_sub.current_period_end,
    current_sub.trial_ends_at::date,
    current_date
  );
  if effective_on < current_date then
    raise exception using errcode = '22023', message = 'cancellation date cannot be in the past';
  end if;

  select * into current_term
  from public.subscription_terms t
  where t.subscription_id = current_sub.id
    and t.effective_to is null
  order by t.effective_from desc
  limit 1;

  if current_term.id is not null and effective_on <= current_term.effective_from then
    raise exception using errcode = '23514', message = 'cancellation date must be after the current term started';
  end if;

  update public.subscriptions
     set cancel_at = effective_on,
         updated_at = now()
   where id = current_sub.id;

  insert into public.subscription_events(
    subscription_id, condominium_id, event_type, from_status, to_status,
    actor_user_id, reason, payload
  ) values (
    current_sub.id, p_condominium_id, 'subscription_cancellation_requested', current_sub.status, null,
    auth.uid(), nullif(btrim(p_reason), ''),
    jsonb_build_object('cancel_at', effective_on)
  );

  return jsonb_build_object(
    'subscription_id', current_sub.id,
    'status', current_sub.status,
    'cancel_at', effective_on
  );
end;
$$;

revoke all on function public.platform_request_subscription_cancellation(uuid,date,text) from public, anon;
grant execute on function public.platform_request_subscription_cancellation(uuid,date,text) to authenticated, service_role;

create or replace function public.platform_undo_scheduled_cancellation(
  p_condominium_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_sub public.subscriptions;
  previous_cancel_at date;
begin
  perform public.hab424_require_platform_admin();
  current_sub := public.hab424_customer_subscription(p_condominium_id);
  if current_sub.id is null then
    raise exception using errcode = 'P0002', message = 'subscription not found';
  end if;
  if current_sub.status = 'cancelled' then
    raise exception using errcode = '23514', message = 'subscription is already cancelled; use platform_reactivate_subscription instead';
  end if;
  if current_sub.cancel_at is null then
    raise exception using errcode = '23514', message = 'no cancellation is scheduled for this subscription';
  end if;

  previous_cancel_at := current_sub.cancel_at;

  update public.subscriptions
     set cancel_at = null,
         updated_at = now()
   where id = current_sub.id;

  insert into public.subscription_events(
    subscription_id, condominium_id, event_type, from_status, to_status,
    actor_user_id, reason, payload
  ) values (
    current_sub.id, p_condominium_id, 'subscription_cancellation_reversed', current_sub.status, current_sub.status,
    auth.uid(), 'platform_undo_scheduled_cancellation',
    jsonb_build_object('previous_cancel_at', previous_cancel_at)
  );

  return jsonb_build_object(
    'subscription_id', current_sub.id,
    'status', current_sub.status,
    'cancel_at', null
  );
end;
$$;

revoke all on function public.platform_undo_scheduled_cancellation(uuid) from public, anon;
grant execute on function public.platform_undo_scheduled_cancellation(uuid) to authenticated, service_role;

-- Deterministic transition, same shape as process_expired_trials(): a cron/worker calls this on a
-- schedule, never a client. Closing the term here (rather than at request time) keeps the contract
-- honest -- the customer keeps the term they are paying for until the date actually arrives.
create or replace function public.process_scheduled_cancellations()
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  changed integer := 0;
  row_record record;
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin')
     and nullif(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;

  for row_record in
    update public.subscriptions
       set status = 'cancelled',
           auto_bill_enabled = false,
           updated_at = now()
     where cancel_at is not null
       and cancel_at <= current_date
       and status <> 'cancelled'
     returning id, condominium_id, status as prior_status, cancel_at
  loop
    update public.subscription_terms
       set effective_to = row_record.cancel_at
     where subscription_id = row_record.id
       and effective_to is null;

    changed := changed + 1;
    insert into public.subscription_events(
      subscription_id, condominium_id, event_type, from_status, to_status, reason, payload
    ) values (
      row_record.id, row_record.condominium_id, 'subscription_cancelled', row_record.prior_status, 'cancelled',
      'scheduled_cancellation_effective',
      jsonb_build_object('cancel_at', row_record.cancel_at, 'auto_bill_disabled', true)
    );
  end loop;

  return changed;
end;
$$;

revoke all on function public.process_scheduled_cancellations() from public, anon, authenticated;
grant execute on function public.process_scheduled_cancellations() to service_role;

-- ------------------------------------------------------------------ reactivation

create or replace function public.platform_reactivate_subscription(
  p_condominium_id uuid,
  p_plan_code text,
  p_billing_period text
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_sub public.subscriptions;
  selected_plan public.plans;
  amount numeric(10,2);
begin
  perform public.hab424_require_platform_admin();
  current_sub := public.hab424_customer_subscription(p_condominium_id);
  if current_sub.id is null then
    raise exception using errcode = 'P0002', message = 'subscription not found';
  end if;
  if current_sub.status <> 'cancelled' then
    raise exception using errcode = '23514', message = 'only a cancelled subscription can be reactivated';
  end if;

  select * into selected_plan from public.plans where code = p_plan_code and is_public;
  if selected_plan.code is null then
    raise exception using errcode = '22023', message = 'public plan not found';
  end if;
  if p_billing_period not in ('monthly', 'annual') then
    raise exception using errcode = '22023', message = 'billing period must be monthly or annual';
  end if;

  amount := case when p_billing_period = 'annual'
    then selected_plan.catalog_annual_usd
    else selected_plan.catalog_monthly_usd
  end;

  insert into public.subscription_terms(
    subscription_id, plan_code, contracted_period_amount, currency, billing_period,
    contracted_unit_limit, unlimited_units, origin, catalog_reference_amount,
    authorized_by, effective_from, effective_to, note
  ) values (
    current_sub.id, selected_plan.code, amount, 'USD', p_billing_period,
    selected_plan.default_unit_limit, false, 'catalog', amount,
    auth.uid(), current_date, null, 'HAB-494 reactivation term'
  );

  -- Reactivation never assumes a pre-cancellation consent, payment method or billing cycle still
  -- applies. It restores access on the confirmed commercial relationship the customer already had;
  -- automatic billing must be set up again through the existing consent/payment-method flow.
  update public.subscriptions
     set status = 'active',
         commercial_status = 'confirmed',
         cancel_at = null,
         auto_bill_enabled = false,
         billing_consent_at = null,
         billing_method_ready_at = null,
         current_period_end = null,
         trial_starts_at = null,
         trial_ends_at = null,
         updated_at = now()
   where id = current_sub.id;

  insert into public.subscription_events(
    subscription_id, condominium_id, event_type, from_status, to_status,
    to_plan, actor_user_id, reason, payload
  ) values (
    current_sub.id, p_condominium_id, 'subscription_reactivated', 'cancelled', 'active',
    selected_plan.code, auth.uid(), 'platform_reactivation',
    jsonb_build_object(
      'billing_period', p_billing_period,
      'contracted_period_amount', amount,
      'auto_bill_enabled', false,
      'billing_consent_reset', true
    )
  );

  return jsonb_build_object(
    'subscription_id', current_sub.id,
    'status', 'active',
    'commercial_status', 'confirmed',
    'plan_code', selected_plan.code,
    'billing_period', p_billing_period,
    'contracted_period_amount', amount,
    'auto_bill_enabled', false
  );
end;
$$;

revoke all on function public.platform_reactivate_subscription(uuid,text,text) from public, anon;
grant execute on function public.platform_reactivate_subscription(uuid,text,text) to authenticated, service_role;

-- ------------------------------------------------------------------ expose cancel_at to Platform Admin reads

drop function if exists public.get_platform_commercial_overview();

create or replace function public.get_platform_commercial_overview()
returns table (
  organization_id uuid,
  organization_name text,
  account_type text,
  condominium_id uuid,
  condominium_name text,
  active_unit_count bigint,
  subscription_id uuid,
  subscription_status text,
  commercial_status text,
  trial_starts_at timestamptz,
  trial_ends_at timestamptz,
  plan_code text,
  plan_name text,
  billing_period text,
  contracted_period_amount numeric,
  catalog_reference_amount numeric,
  currency text,
  adjustment_source text,
  adjustment_kind text,
  adjustment_effective_from date,
  adjustment_effective_to date,
  effective_period_amount numeric,
  auto_bill_enabled boolean,
  billing_consent_recorded boolean,
  billing_method_ready boolean,
  cancel_at date
)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception using errcode = '42501', message = 'platform admin required';
  end if;

  return query
  select
    o.id,
    o.name,
    o.account_type::text,
    c.id,
    c.name,
    (select count(*) from public.units u where u.condominium_id = c.id and u.status = 'active'),
    s.id,
    s.status::text,
    s.commercial_status::text,
    s.trial_starts_at,
    s.trial_ends_at,
    t.plan_code,
    p.name,
    t.billing_period,
    t.contracted_period_amount,
    t.catalog_reference_amount,
    t.currency,
    a.source,
    a.adjustment_kind,
    a.effective_from,
    a.effective_to,
    case
      when s.status = 'trialing' and s.trial_ends_at > now() then 0::numeric
      when a.id is not null then a.effective_period_amount
      else t.contracted_period_amount
    end,
    s.auto_bill_enabled,
    s.billing_consent_at is not null,
    s.billing_method_ready_at is not null,
    s.cancel_at
  from public.condominiums c
  join public.organizations o on o.id = c.organization_id
  left join public.subscriptions s on s.condominium_id = c.id
  left join lateral (
    select st.* from public.subscription_terms st
    where st.subscription_id = s.id
      and st.effective_from <= current_date
      and (st.effective_to is null or st.effective_to > current_date)
    order by st.effective_from desc limit 1
  ) t on true
  left join public.plans p on p.code = t.plan_code
  left join lateral (
    select sa.* from public.subscription_adjustments sa
    where sa.subscription_id = s.id
      and sa.effective_from <= current_date
      and sa.effective_to > current_date
    order by sa.effective_from desc limit 1
  ) a on true
  order by c.created_at desc;
end;
$$;

revoke all on function public.get_platform_commercial_overview() from public, anon;
grant execute on function public.get_platform_commercial_overview() to authenticated, service_role;
