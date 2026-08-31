-- HAB-424: minimum commercial activation for early sales validation.
--
-- This migration deliberately keeps provider billing outside the database. It models the commercial
-- facts Habitta needs now: a fixed 30-day trial, time-boxed coupon definitions, explicitly gifted
-- months, effective customer price, and the consent/readiness gates a future automatic biller must
-- honor. No row in this migration represents a payment, invoice, receivable or ledger movement.

-- ------------------------------------------------------------------ subscription trial/billing intent

alter table public.subscriptions
  add column trial_starts_at timestamptz,
  add column billing_consent_at timestamptz,
  add column billing_method_ready_at timestamptz,
  add column auto_bill_enabled boolean not null default false;

update public.subscriptions
set trial_starts_at = created_at
where status = 'trialing'
  and trial_starts_at is null;

alter table public.subscriptions
  add constraint subscriptions_trial_window_complete check (
    status <> 'trialing'
    or (
      trial_starts_at is not null
      and trial_ends_at is not null
      and trial_ends_at > trial_starts_at
    )
  ),
  add constraint subscriptions_auto_bill_requires_explicit_setup check (
    not auto_bill_enabled
    or (billing_consent_at is not null and billing_method_ready_at is not null)
  );

-- ------------------------------------------------------------------ reusable coupon definitions

create table public.commercial_offers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  kind text not null,
  percentage_off numeric(5, 2),
  fixed_amount numeric(10, 2),
  currency text,
  duration_months integer not null default 1,
  valid_from date not null default current_date,
  valid_until date,
  max_redemptions integer,
  active boolean not null default true,
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  disabled_at timestamptz,
  disabled_by uuid references auth.users(id),
  constraint commercial_offers_code_shape check (
    code = upper(code)
    and code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'
  ),
  constraint commercial_offers_kind_shape check (kind in ('percentage', 'fixed')),
  constraint commercial_offers_value_shape check (
    (
      kind = 'percentage'
      and percentage_off > 0
      and percentage_off <= 100
      and fixed_amount is null
      and currency is null
    )
    or (
      kind = 'fixed'
      and fixed_amount > 0
      and percentage_off is null
      and currency ~ '^[A-Z]{3}$'
    )
  ),
  constraint commercial_offers_duration_shape check (duration_months between 1 and 24),
  constraint commercial_offers_validity_order check (
    valid_until is null or valid_until >= valid_from
  ),
  constraint commercial_offers_max_redemptions_shape check (
    max_redemptions is null or max_redemptions > 0
  ),
  constraint commercial_offers_disabled_shape check (
    active or (disabled_at is not null and disabled_by is not null)
  )
);

-- A subscription adjustment is the immutable application snapshot. The base subscription term is
-- never rewritten to "look discounted". That preserves the contractual amount and lets reports
-- distinguish list/contract price from a temporary promotion or gifted period.
create table public.subscription_adjustments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  offer_id uuid references public.commercial_offers(id),
  source text not null,
  adjustment_kind text not null,
  percentage_off numeric(5, 2),
  fixed_amount numeric(10, 2),
  currency text not null,
  reference_period_amount numeric(10, 2) not null,
  effective_period_amount numeric(10, 2) not null,
  effective_from date not null,
  effective_to date not null,
  authorized_by uuid not null references auth.users(id),
  note text,
  created_at timestamptz not null default now(),
  constraint subscription_adjustments_source_shape check (source in ('coupon', 'gift')),
  constraint subscription_adjustments_kind_shape check (
    adjustment_kind in ('percentage', 'fixed', 'free')
  ),
  constraint subscription_adjustments_dates_ordered check (effective_to > effective_from),
  constraint subscription_adjustments_currency_shape check (currency ~ '^[A-Z]{3}$'),
  constraint subscription_adjustments_amounts_shape check (
    reference_period_amount >= 0
    and effective_period_amount >= 0
    and effective_period_amount <= reference_period_amount
  ),
  constraint subscription_adjustments_origin_shape check (
    (
      source = 'coupon'
      and offer_id is not null
      and adjustment_kind in ('percentage', 'fixed')
      and (
        (adjustment_kind = 'percentage' and percentage_off > 0 and percentage_off <= 100 and fixed_amount is null)
        or
        (adjustment_kind = 'fixed' and fixed_amount > 0 and percentage_off is null)
      )
    )
    or (
      source = 'gift'
      and offer_id is null
      and adjustment_kind = 'free'
      and percentage_off is null
      and fixed_amount is null
      and effective_period_amount = 0
    )
  ),
  unique (subscription_id, offer_id)
);

-- No stacking in HAB-424. A second offer/gift can begin only after the first adjustment ends.
alter table public.subscription_adjustments
  add constraint subscription_adjustments_no_overlap
  exclude using gist (
    subscription_id with =,
    daterange(effective_from, effective_to, '[)') with &&
  );

create index commercial_offers_active_lookup
  on public.commercial_offers (active, valid_from, valid_until, code);
create index subscription_adjustments_lookup
  on public.subscription_adjustments (subscription_id, effective_from desc);

alter table public.commercial_offers enable row level security;
alter table public.subscription_adjustments enable row level security;

revoke all on public.commercial_offers, public.subscription_adjustments from anon, authenticated;

-- ------------------------------------------------------------------ internal helpers

create or replace function public.hab424_require_platform_admin()
returns void
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
end;
$$;

revoke all on function public.hab424_require_platform_admin() from public, anon, authenticated;
grant execute on function public.hab424_require_platform_admin() to service_role;

create or replace function public.hab424_customer_subscription(target_condominium uuid)
returns public.subscriptions
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  result public.subscriptions;
  target_type public.organization_account_type;
begin
  select o.account_type
    into target_type
    from public.condominiums c
    join public.organizations o on o.id = c.organization_id
   where c.id = target_condominium;

  if target_type is null then
    raise exception using errcode = '23503', message = 'condominium not found';
  end if;
  if target_type <> 'customer' then
    raise exception using errcode = '23514', message = 'commercial activation is only permitted for customer organizations';
  end if;

  select * into result
  from public.subscriptions s
  where s.condominium_id = target_condominium;

  return result;
end;
$$;

revoke all on function public.hab424_customer_subscription(uuid) from public, anon, authenticated;
grant execute on function public.hab424_customer_subscription(uuid) to service_role;

-- ------------------------------------------------------------------ platform offer administration

create or replace function public.platform_create_commercial_offer(
  p_code text,
  p_kind text,
  p_value numeric,
  p_duration_months integer,
  p_valid_from date,
  p_valid_until date,
  p_max_redemptions integer,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  created public.commercial_offers;
  normalized_code text := upper(btrim(p_code));
  normalized_kind text := lower(btrim(p_kind));
begin
  perform public.hab424_require_platform_admin();

  if normalized_kind not in ('percentage', 'fixed') then
    raise exception using errcode = '22023', message = 'offer kind must be percentage or fixed';
  end if;

  insert into public.commercial_offers(
    code, kind, percentage_off, fixed_amount, currency, duration_months,
    valid_from, valid_until, max_redemptions, note, created_by
  ) values (
    normalized_code,
    normalized_kind,
    case when normalized_kind = 'percentage' then p_value else null end,
    case when normalized_kind = 'fixed' then p_value else null end,
    case when normalized_kind = 'fixed' then 'USD' else null end,
    p_duration_months,
    coalesce(p_valid_from, current_date),
    p_valid_until,
    p_max_redemptions,
    nullif(btrim(p_note), ''),
    auth.uid()
  )
  returning * into created;

  return jsonb_build_object(
    'id', created.id,
    'code', created.code,
    'kind', created.kind,
    'percentage_off', created.percentage_off,
    'fixed_amount', created.fixed_amount,
    'currency', created.currency,
    'duration_months', created.duration_months,
    'valid_from', created.valid_from,
    'valid_until', created.valid_until,
    'max_redemptions', created.max_redemptions,
    'active', created.active
  );
end;
$$;

revoke all on function public.platform_create_commercial_offer(text,text,numeric,integer,date,date,integer,text)
  from public, anon;
grant execute on function public.platform_create_commercial_offer(text,text,numeric,integer,date,date,integer,text)
  to authenticated, service_role;

create or replace function public.platform_disable_commercial_offer(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  changed public.commercial_offers;
begin
  perform public.hab424_require_platform_admin();

  update public.commercial_offers
     set active = false,
         disabled_at = coalesce(disabled_at, now()),
         disabled_by = coalesce(disabled_by, auth.uid())
   where id = p_offer_id
   returning * into changed;

  if changed.id is null then
    raise exception using errcode = 'P0002', message = 'commercial offer not found';
  end if;

  return jsonb_build_object('id', changed.id, 'code', changed.code, 'active', changed.active);
end;
$$;

revoke all on function public.platform_disable_commercial_offer(uuid) from public, anon;
grant execute on function public.platform_disable_commercial_offer(uuid) to authenticated, service_role;

create or replace function public.platform_list_commercial_offers()
returns table (
  id uuid,
  code text,
  kind text,
  percentage_off numeric,
  fixed_amount numeric,
  currency text,
  duration_months integer,
  valid_from date,
  valid_until date,
  max_redemptions integer,
  redemption_count bigint,
  active boolean,
  note text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  perform public.hab424_require_platform_admin();

  return query
  select
    o.id, o.code, o.kind, o.percentage_off, o.fixed_amount, o.currency,
    o.duration_months, o.valid_from, o.valid_until, o.max_redemptions,
    (select count(*) from public.subscription_adjustments a where a.offer_id = o.id),
    o.active, o.note, o.created_at
  from public.commercial_offers o
  order by o.created_at desc;
end;
$$;

revoke all on function public.platform_list_commercial_offers() from public, anon;
grant execute on function public.platform_list_commercial_offers() to authenticated, service_role;

-- ------------------------------------------------------------------ trial activation

create or replace function public.platform_start_30_day_trial(
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
  existing public.subscriptions;
  selected_plan public.plans;
  created public.subscriptions;
  amount numeric(10,2);
  started timestamptz := clock_timestamp();
  ends_at timestamptz;
begin
  perform public.hab424_require_platform_admin();
  perform public.hab424_customer_subscription(p_condominium_id);

  select * into existing from public.subscriptions where condominium_id = p_condominium_id for update;
  if existing.id is not null then
    raise exception using errcode = '23505', message = 'condominium already has a subscription';
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
  ends_at := started + interval '30 days';

  insert into public.subscriptions(
    condominium_id, status, commercial_status, trial_starts_at, trial_ends_at,
    current_period_end, auto_bill_enabled
  ) values (
    p_condominium_id, 'trialing', 'not_yet_confirmed', started, ends_at,
    null, false
  ) returning * into created;

  insert into public.subscription_terms(
    subscription_id, plan_code, contracted_period_amount, currency, billing_period,
    contracted_unit_limit, unlimited_units, origin, catalog_reference_amount,
    authorized_by, effective_from, effective_to, note
  ) values (
    created.id, selected_plan.code, amount, 'USD', p_billing_period,
    selected_plan.default_unit_limit, false, 'catalog', amount,
    auth.uid(), current_date, null, 'HAB-424 30-day trial commercial term'
  );

  insert into public.subscription_events(
    subscription_id, condominium_id, event_type, to_status, to_plan, actor_user_id, reason, payload
  ) values (
    created.id, p_condominium_id, 'trial_started', 'trialing', selected_plan.code,
    auth.uid(), 'platform_30_day_trial',
    jsonb_build_object('trial_starts_at', started, 'trial_ends_at', ends_at, 'billing_period', p_billing_period)
  );

  return jsonb_build_object(
    'subscription_id', created.id,
    'status', created.status,
    'commercial_status', created.commercial_status,
    'plan_code', selected_plan.code,
    'billing_period', p_billing_period,
    'contracted_period_amount', amount,
    'trial_starts_at', started,
    'trial_ends_at', ends_at,
    'auto_bill_enabled', false
  );
end;
$$;

revoke all on function public.platform_start_30_day_trial(uuid,text,text) from public, anon;
grant execute on function public.platform_start_30_day_trial(uuid,text,text) to authenticated, service_role;

-- Explicit activation is separate from the trial. No trial expiration function charges anything.
-- A future provider may enable automatic billing only when both consent and payment-method readiness
-- have explicit timestamps; the table check above makes that invariant independent of application code.
create or replace function public.platform_activate_subscription(
  p_condominium_id uuid,
  p_billing_consent_at timestamptz,
  p_billing_method_ready_at timestamptz,
  p_enable_auto_bill boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_sub public.subscriptions;
  prior_status public.subscription_status;
begin
  perform public.hab424_require_platform_admin();
  current_sub := public.hab424_customer_subscription(p_condominium_id);
  if current_sub.id is null then
    raise exception using errcode = 'P0002', message = 'subscription not found';
  end if;
  if current_sub.status = 'cancelled' then
    raise exception using errcode = '23514', message = 'cancelled subscription cannot be activated';
  end if;
  if p_enable_auto_bill and (p_billing_consent_at is null or p_billing_method_ready_at is null) then
    raise exception using errcode = '23514', message = 'automatic billing requires explicit consent and payment method readiness';
  end if;

  prior_status := current_sub.status;

  update public.subscriptions
     set status = 'active',
         commercial_status = 'confirmed',
         billing_consent_at = p_billing_consent_at,
         billing_method_ready_at = p_billing_method_ready_at,
         auto_bill_enabled = p_enable_auto_bill,
         updated_at = now()
   where id = current_sub.id
   returning * into current_sub;

  insert into public.subscription_events(
    subscription_id, condominium_id, event_type, from_status, to_status,
    actor_user_id, reason, payload
  ) values (
    current_sub.id, p_condominium_id, 'subscription_activated', prior_status, 'active',
    auth.uid(), 'platform_activation',
    jsonb_build_object(
      'auto_bill_enabled', p_enable_auto_bill,
      'billing_consent_recorded', p_billing_consent_at is not null,
      'billing_method_ready_recorded', p_billing_method_ready_at is not null
    )
  );

  return jsonb_build_object(
    'subscription_id', current_sub.id,
    'status', current_sub.status,
    'commercial_status', current_sub.commercial_status,
    'auto_bill_enabled', current_sub.auto_bill_enabled
  );
end;
$$;

revoke all on function public.platform_activate_subscription(uuid,timestamptz,timestamptz,boolean)
  from public, anon;
grant execute on function public.platform_activate_subscription(uuid,timestamptz,timestamptz,boolean)
  to authenticated, service_role;

-- ------------------------------------------------------------------ coupon application / gifts

create or replace function public.platform_apply_commercial_offer(
  p_condominium_id uuid,
  p_code text,
  p_start_date date
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
  selected_offer public.commercial_offers;
  starts_on date := coalesce(p_start_date, current_date);
  ends_on date;
  effective_amount numeric(10,2);
  redemptions bigint;
  created public.subscription_adjustments;
begin
  perform public.hab424_require_platform_admin();
  current_sub := public.hab424_customer_subscription(p_condominium_id);
  if current_sub.id is null then
    raise exception using errcode = 'P0002', message = 'subscription not found';
  end if;
  if current_sub.status = 'cancelled' then
    raise exception using errcode = '23514', message = 'cancelled subscription cannot receive offers';
  end if;

  select * into selected_offer
  from public.commercial_offers
  where code = upper(btrim(p_code))
  for update;

  if selected_offer.id is null then
    raise exception using errcode = 'P0002', message = 'commercial offer not found';
  end if;
  if not selected_offer.active then
    raise exception using errcode = '23514', message = 'commercial offer is disabled';
  end if;
  if current_date < selected_offer.valid_from
     or (selected_offer.valid_until is not null and current_date > selected_offer.valid_until) then
    raise exception using errcode = '23514', message = 'commercial offer is outside its redemption window';
  end if;

  select count(*) into redemptions
  from public.subscription_adjustments
  where offer_id = selected_offer.id;
  if selected_offer.max_redemptions is not null and redemptions >= selected_offer.max_redemptions then
    raise exception using errcode = '23514', message = 'commercial offer redemption limit reached';
  end if;

  select * into current_term
  from public.subscription_terms t
  where t.subscription_id = current_sub.id
    and t.effective_from <= starts_on
    and (t.effective_to is null or t.effective_to > starts_on)
  order by t.effective_from desc
  limit 1;

  if current_term.id is null then
    raise exception using errcode = '23514', message = 'subscription has no commercial term for offer start date';
  end if;
  if selected_offer.kind = 'fixed' and selected_offer.currency <> current_term.currency then
    raise exception using errcode = '23514', message = 'fixed offer currency does not match subscription currency';
  end if;

  ends_on := (starts_on + make_interval(months => selected_offer.duration_months))::date;
  effective_amount := case selected_offer.kind
    when 'percentage' then round(current_term.contracted_period_amount * (1 - selected_offer.percentage_off / 100), 2)
    else greatest(current_term.contracted_period_amount - selected_offer.fixed_amount, 0)
  end;

  insert into public.subscription_adjustments(
    subscription_id, offer_id, source, adjustment_kind, percentage_off, fixed_amount,
    currency, reference_period_amount, effective_period_amount,
    effective_from, effective_to, authorized_by, note
  ) values (
    current_sub.id, selected_offer.id, 'coupon', selected_offer.kind,
    selected_offer.percentage_off, selected_offer.fixed_amount,
    current_term.currency, current_term.contracted_period_amount, effective_amount,
    starts_on, ends_on, auth.uid(), selected_offer.note
  ) returning * into created;

  insert into public.subscription_events(
    subscription_id, condominium_id, event_type, actor_user_id, reason, payload
  ) values (
    current_sub.id, p_condominium_id, 'commercial_offer_applied', auth.uid(), selected_offer.code,
    jsonb_build_object(
      'adjustment_id', created.id,
      'offer_code', selected_offer.code,
      'effective_from', starts_on,
      'effective_to', ends_on,
      'reference_period_amount', current_term.contracted_period_amount,
      'effective_period_amount', effective_amount
    )
  );

  return jsonb_build_object(
    'adjustment_id', created.id,
    'offer_code', selected_offer.code,
    'source', created.source,
    'effective_from', created.effective_from,
    'effective_to', created.effective_to,
    'reference_period_amount', created.reference_period_amount,
    'effective_period_amount', created.effective_period_amount,
    'currency', created.currency
  );
end;
$$;

revoke all on function public.platform_apply_commercial_offer(uuid,text,date) from public, anon;
grant execute on function public.platform_apply_commercial_offer(uuid,text,date) to authenticated, service_role;

create or replace function public.platform_gift_months(
  p_condominium_id uuid,
  p_months integer,
  p_start_date date,
  p_note text
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
  starts_on date := coalesce(p_start_date, current_date);
  ends_on date;
  created public.subscription_adjustments;
begin
  perform public.hab424_require_platform_admin();
  if p_months is null or p_months not between 1 and 12 then
    raise exception using errcode = '22023', message = 'gift months must be between 1 and 12';
  end if;

  current_sub := public.hab424_customer_subscription(p_condominium_id);
  if current_sub.id is null then
    raise exception using errcode = 'P0002', message = 'subscription not found';
  end if;
  if current_sub.status not in ('active', 'past_due') then
    raise exception using errcode = '23514', message = 'gifted months require an active or past-due subscription';
  end if;

  select * into current_term
  from public.subscription_terms t
  where t.subscription_id = current_sub.id
    and t.effective_from <= starts_on
    and (t.effective_to is null or t.effective_to > starts_on)
  order by t.effective_from desc
  limit 1;

  if current_term.id is null then
    raise exception using errcode = '23514', message = 'subscription has no commercial term for gift start date';
  end if;
  if current_term.billing_period <> 'monthly' then
    raise exception using errcode = '23514', message = 'HAB-424 gifted months are supported only for monthly subscriptions';
  end if;

  ends_on := (starts_on + make_interval(months => p_months))::date;

  insert into public.subscription_adjustments(
    subscription_id, offer_id, source, adjustment_kind, percentage_off, fixed_amount,
    currency, reference_period_amount, effective_period_amount,
    effective_from, effective_to, authorized_by, note
  ) values (
    current_sub.id, null, 'gift', 'free', null, null,
    current_term.currency, current_term.contracted_period_amount, 0,
    starts_on, ends_on, auth.uid(), nullif(btrim(p_note), '')
  ) returning * into created;

  insert into public.subscription_events(
    subscription_id, condominium_id, event_type, actor_user_id, reason, payload
  ) values (
    current_sub.id, p_condominium_id, 'gifted_access_granted', auth.uid(), 'platform_gift',
    jsonb_build_object(
      'adjustment_id', created.id,
      'months', p_months,
      'effective_from', starts_on,
      'effective_to', ends_on,
      'reference_period_amount', current_term.contracted_period_amount
    )
  );

  return jsonb_build_object(
    'adjustment_id', created.id,
    'source', created.source,
    'effective_from', created.effective_from,
    'effective_to', created.effective_to,
    'reference_period_amount', created.reference_period_amount,
    'effective_period_amount', created.effective_period_amount,
    'currency', created.currency
  );
end;
$$;

revoke all on function public.platform_gift_months(uuid,integer,date,text) from public, anon;
grant execute on function public.platform_gift_months(uuid,integer,date,text) to authenticated, service_role;

-- ------------------------------------------------------------------ deterministic trial expiration

create or replace function public.process_expired_trials()
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
  -- This is an internal transition function for a future cron/worker. Platform browsers cannot call it.
  if current_user not in ('postgres', 'service_role', 'supabase_admin')
     and nullif(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;

  for row_record in
    update public.subscriptions
       set status = 'suspended', updated_at = now()
     where status = 'trialing'
       and trial_ends_at <= now()
     returning id, condominium_id
  loop
    changed := changed + 1;
    insert into public.subscription_events(
      subscription_id, condominium_id, event_type, from_status, to_status, reason, payload
    ) values (
      row_record.id, row_record.condominium_id, 'trial_expired', 'trialing', 'suspended',
      'trial_expired_without_billing_activation',
      jsonb_build_object('automatic_charge_attempted', false)
    );
  end loop;

  return changed;
end;
$$;

revoke all on function public.process_expired_trials() from public, anon, authenticated;
grant execute on function public.process_expired_trials() to service_role;

-- Expired trials fail closed even before the transition job runs. This is the access invariant; the
-- status transition above is the bookkeeping invariant.
create or replace function public.resolve_entitlements(target_condominium uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  subscription public.subscriptions;
  term public.subscription_terms;
  plan public.plans;
  active_units integer;
  effective_limit integer;
  may_operate boolean;
begin
  select * into subscription
  from public.subscriptions s
  where s.condominium_id = target_condominium;

  if subscription.id is null then
    return jsonb_build_object(
      'found', false,
      'has_term', false,
      'capabilities', '[]'::jsonb,
      'unlimited_units', false,
      'unit_limit', 0,
      'within_limit', false,
      'may_operate', false
    );
  end if;

  select * into term
  from public.subscription_terms t
  where t.subscription_id = subscription.id
    and t.effective_from <= current_date
    and (t.effective_to is null or t.effective_to > current_date)
  limit 1;

  if term.id is null then
    return jsonb_build_object(
      'found', true,
      'condominium_id', target_condominium,
      'has_term', false,
      'status', subscription.status,
      'commercial_status', subscription.commercial_status,
      'capabilities', '[]'::jsonb,
      'unlimited_units', false,
      'unit_limit', 0,
      'within_limit', false,
      'may_operate', false
    );
  end if;

  select * into plan from public.plans p where p.code = term.plan_code;
  select count(*) into active_units
  from public.units u
  where u.condominium_id = target_condominium and u.status = 'active';

  effective_limit := case
    when term.unlimited_units then null
    else coalesce(term.contracted_unit_limit, plan.default_unit_limit)
  end;

  may_operate := case
    when subscription.status = 'trialing' then subscription.trial_ends_at > now()
    when subscription.status in ('active', 'past_due') then true
    else false
  end;

  return jsonb_build_object(
    'found', true,
    'has_term', true,
    'condominium_id', target_condominium,
    'plan_code', term.plan_code,
    'plan_name', plan.name,
    'status', subscription.status,
    'commercial_status', subscription.commercial_status,
    'trial_starts_at', subscription.trial_starts_at,
    'trial_ends_at', subscription.trial_ends_at,
    'billing_period', term.billing_period,
    'contracted_period_amount', term.contracted_period_amount,
    'currency', term.currency,
    'term_origin', term.origin,
    'unlimited_units', term.unlimited_units,
    'unit_limit', effective_limit,
    'active_units', active_units,
    'within_limit', term.unlimited_units or active_units <= effective_limit,
    'capabilities', coalesce(
      (select jsonb_agg(pc.capability order by pc.capability)
       from public.plan_capabilities pc where pc.plan_code = term.plan_code),
      '[]'::jsonb
    ),
    'may_operate', may_operate
  );
end;
$$;

revoke all on function public.resolve_entitlements(uuid) from public, anon, authenticated;
grant execute on function public.resolve_entitlements(uuid) to service_role;

-- ------------------------------------------------------------------ customer-facing commercial summary

create or replace function public.my_commercial_summary(p_condominium_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  caller uuid := auth.uid();
  allowed boolean;
  sub public.subscriptions;
  term public.subscription_terms;
  adj public.subscription_adjustments;
  plan public.plans;
  effective_now numeric(10,2);
  next_amount numeric(10,2);
  next_bill date;
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select
    public.is_organization_owner_for_condominium(p_condominium_id)
    or exists (
      select 1 from public.condominium_memberships cm
      where cm.condominium_id = p_condominium_id
        and cm.user_id = caller
        and cm.role = 'condominium_admin'
    )
  into allowed;

  if not coalesce(allowed, false) then
    raise exception using errcode = '42501', message = 'commercial summary requires condominium owner/admin scope';
  end if;

  select * into sub from public.subscriptions where condominium_id = p_condominium_id;
  if sub.id is null then
    return jsonb_build_object('found', false, 'condominium_id', p_condominium_id);
  end if;

  select * into term
  from public.subscription_terms t
  where t.subscription_id = sub.id
    and t.effective_from <= current_date
    and (t.effective_to is null or t.effective_to > current_date)
  order by t.effective_from desc limit 1;

  if term.id is null then
    return jsonb_build_object(
      'found', true,
      'has_term', false,
      'condominium_id', p_condominium_id,
      'status', sub.status,
      'trial_starts_at', sub.trial_starts_at,
      'trial_ends_at', sub.trial_ends_at,
      'auto_bill_enabled', sub.auto_bill_enabled
    );
  end if;

  select * into plan from public.plans where code = term.plan_code;
  select * into adj
  from public.subscription_adjustments a
  where a.subscription_id = sub.id
    and a.effective_from <= current_date
    and a.effective_to > current_date
  order by a.effective_from desc limit 1;

  effective_now := case
    when sub.status = 'trialing' and sub.trial_ends_at > now() then 0
    when adj.id is not null then adj.effective_period_amount
    else term.contracted_period_amount
  end;

  next_amount := case
    when sub.status = 'trialing' then coalesce(
      (
        select a2.effective_period_amount
        from public.subscription_adjustments a2
        where a2.subscription_id = sub.id
          and a2.effective_from <= sub.trial_ends_at::date
          and a2.effective_to > sub.trial_ends_at::date
        order by a2.effective_from desc limit 1
      ),
      term.contracted_period_amount
    )
    when adj.id is not null then term.contracted_period_amount
    else term.contracted_period_amount
  end;

  next_bill := case
    when sub.status = 'trialing' then sub.trial_ends_at::date
    else sub.current_period_end
  end;

  return jsonb_build_object(
    'found', true,
    'has_term', true,
    'condominium_id', p_condominium_id,
    'status', sub.status,
    'commercial_status', sub.commercial_status,
    'plan_code', term.plan_code,
    'plan_name', plan.name,
    'billing_period', term.billing_period,
    'currency', term.currency,
    'catalog_reference_amount', term.catalog_reference_amount,
    'contracted_period_amount', term.contracted_period_amount,
    'current_effective_period_amount', effective_now,
    'next_period_amount', next_amount,
    'trial_starts_at', sub.trial_starts_at,
    'trial_ends_at', sub.trial_ends_at,
    'next_billing_date', next_bill,
    'adjustment_source', case when adj.id is null then null else adj.source end,
    'adjustment_kind', case when adj.id is null then null else adj.adjustment_kind end,
    'adjustment_ends_at', case when adj.id is null then null else adj.effective_to end,
    'auto_bill_enabled', sub.auto_bill_enabled,
    'billing_consent_recorded', sub.billing_consent_at is not null,
    'billing_method_ready', sub.billing_method_ready_at is not null
  );
end;
$$;

revoke all on function public.my_commercial_summary(uuid) from public, anon;
grant execute on function public.my_commercial_summary(uuid) to authenticated, service_role;

-- ------------------------------------------------------------------ platform commercial overview

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
  billing_method_ready boolean
)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  perform public.hab424_require_platform_admin();

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
    s.billing_method_ready_at is not null
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
