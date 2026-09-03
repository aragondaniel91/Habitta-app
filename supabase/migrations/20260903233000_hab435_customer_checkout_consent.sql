-- HAB-435: customer-authorized commercial checkout preview + explicit billing consent.
--
-- This slice deliberately stops before payment-method setup/provider integration. The customer may
-- review the exact commercial terms, optionally redeem one HAB-424 offer, and explicitly consent.
-- Nothing here can enable automatic billing, manufacture an invoice/payment, or touch resident
-- receivables/treasury/ledger state.

create schema if not exists habitta_internal;
revoke all on schema habitta_internal from public, anon, authenticated, service_role;

create or replace function habitta_internal.commercial_checkout_preview_v1(
  p_condominium_id uuid,
  p_offer_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  current_sub public.subscriptions;
  current_term public.subscription_terms;
  current_plan public.plans;
  selected_offer public.commercial_offers;
  normalized_offer_code text := nullif(upper(btrim(coalesce(p_offer_code, ''))), '');
  catalog_period_amount numeric(10,2);
  effective_period_amount numeric(10,2);
  first_billing_date date;
  promotion_ends_on date;
  redemption_count bigint;
  promotion_payload jsonb := null;
  terms_payload jsonb;
  fingerprint text;
begin
  select s.*
    into current_sub
    from public.subscriptions s
   where s.condominium_id = p_condominium_id;

  if current_sub.id is null then
    raise exception using errcode = 'P0002', message = 'subscription not found';
  end if;
  if current_sub.status <> 'trialing'
    or current_sub.trial_ends_at is null
    or current_sub.trial_ends_at <= clock_timestamp()
  then
    raise exception using errcode = '23514', message = 'commercial checkout requires an active trial';
  end if;
  if current_sub.commercial_status <> 'not_yet_confirmed' or current_sub.billing_consent_at is not null then
    raise exception using errcode = '23514', message = 'commercial consent already recorded';
  end if;

  if not exists (
    select 1
      from public.condominiums c
      join public.organizations o on o.id = c.organization_id
     where c.id = p_condominium_id
       and o.account_type = 'customer'
  ) then
    raise exception using errcode = '23514', message = 'commercial checkout is only available for customer organizations';
  end if;

  select t.*
    into current_term
    from public.subscription_terms t
   where t.subscription_id = current_sub.id
     and t.effective_from <= current_date
     and (t.effective_to is null or t.effective_to > current_date)
   order by t.effective_from desc
   limit 1;

  if current_term.id is null then
    raise exception using errcode = 'P0002', message = 'active subscription term not found';
  end if;
  if current_term.plan_code not in ('esencial', 'comunidad') then
    raise exception using errcode = '23514', message = 'selected plan requires guided onboarding';
  end if;
  if current_term.billing_period not in ('monthly', 'annual') then
    raise exception using errcode = '23514', message = 'subscription billing period is not supported';
  end if;

  select p.*
    into current_plan
    from public.plans p
   where p.code = current_term.plan_code
     and p.is_public;

  if current_plan.code is null then
    raise exception using errcode = 'P0002', message = 'public plan not found';
  end if;

  catalog_period_amount := case
    when current_term.billing_period = 'annual' then current_plan.catalog_annual_usd
    else current_plan.catalog_monthly_usd
  end;
  effective_period_amount := current_term.contracted_period_amount;
  first_billing_date := current_sub.trial_ends_at::date;

  if normalized_offer_code is not null then
    select o.*
      into selected_offer
      from public.commercial_offers o
     where o.code = normalized_offer_code;

    if selected_offer.id is null then
      raise exception using errcode = '22023', message = 'promotion code is invalid';
    end if;
    if not selected_offer.active
      or current_date < selected_offer.valid_from
      or (selected_offer.valid_until is not null and current_date > selected_offer.valid_until)
    then
      raise exception using errcode = '22023', message = 'promotion code is not active';
    end if;

    select count(*)
      into redemption_count
      from public.subscription_adjustments a
     where a.offer_id = selected_offer.id;

    if selected_offer.max_redemptions is not null
      and redemption_count >= selected_offer.max_redemptions
    then
      raise exception using errcode = '23514', message = 'promotion redemption limit reached';
    end if;
    if selected_offer.kind = 'fixed' and selected_offer.currency <> current_term.currency then
      raise exception using errcode = '23514', message = 'fixed offer currency does not match subscription currency';
    end if;

    promotion_ends_on := (
      first_billing_date + pg_catalog.make_interval(months => selected_offer.duration_months)
    )::date;

    if exists (
      select 1
        from public.subscription_adjustments a
       where a.subscription_id = current_sub.id
         and daterange(a.effective_from, a.effective_to, '[)')
             && daterange(first_billing_date, promotion_ends_on, '[)')
    ) then
      raise exception using errcode = '23514', message = 'promotion conflicts with an existing subscription adjustment';
    end if;

    effective_period_amount := case selected_offer.kind
      when 'percentage' then round(
        current_term.contracted_period_amount * (1 - selected_offer.percentage_off / 100),
        2
      )
      else greatest(current_term.contracted_period_amount - selected_offer.fixed_amount, 0)
    end;

    promotion_payload := pg_catalog.jsonb_build_object(
      'code', selected_offer.code,
      'kind', selected_offer.kind,
      'percentage_off', selected_offer.percentage_off,
      'fixed_amount', selected_offer.fixed_amount,
      'currency', selected_offer.currency,
      'duration_months', selected_offer.duration_months,
      'starts_on', first_billing_date,
      'ends_on', promotion_ends_on,
      'effective_period_amount', effective_period_amount
    );
  end if;

  terms_payload := pg_catalog.jsonb_build_object(
    'condominium_id', p_condominium_id,
    'subscription_id', current_sub.id,
    'status', current_sub.status,
    'commercial_status', current_sub.commercial_status,
    'plan_code', current_term.plan_code,
    'plan_name', current_plan.name,
    'billing_period', current_term.billing_period,
    'currency', current_term.currency,
    'catalog_period_amount', catalog_period_amount,
    'contracted_period_amount', current_term.contracted_period_amount,
    'amount_due_today', 0,
    'trial_ends_at', current_sub.trial_ends_at,
    'first_billing_at', current_sub.trial_ends_at,
    'first_billing_date', first_billing_date,
    'first_period_amount', effective_period_amount,
    'post_promotion_period_amount', current_term.contracted_period_amount,
    'promotion', promotion_payload,
    'billing_consent_recorded', false,
    'billing_method_ready', current_sub.billing_method_ready_at is not null,
    'auto_bill_enabled', false
  );

  fingerprint := encode(extensions.digest(terms_payload::text, 'sha256'), 'hex');
  return terms_payload || pg_catalog.jsonb_build_object('terms_fingerprint', fingerprint);
end;
$$;

revoke all on function habitta_internal.commercial_checkout_preview_v1(uuid,text)
  from public, anon, authenticated, service_role;

create or replace function public.get_customer_commercial_checkout_preview_v1(
  p_condominium_id uuid,
  p_offer_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if not coalesce(public.is_organization_owner_for_condominium(p_condominium_id), false) then
    raise exception using errcode = '42501', message = 'commercial checkout requires organization owner scope';
  end if;

  return habitta_internal.commercial_checkout_preview_v1(p_condominium_id, p_offer_code);
end;
$$;

revoke all on function public.get_customer_commercial_checkout_preview_v1(uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_customer_commercial_checkout_preview_v1(uuid,text)
  to authenticated;

create or replace function public.record_customer_commercial_consent_v1(
  p_condominium_id uuid,
  p_offer_code text,
  p_terms_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor uuid := auth.uid();
  current_sub public.subscriptions;
  locked_term public.subscription_terms;
  locked_plan public.plans;
  selected_offer public.commercial_offers;
  normalized_offer_code text := nullif(upper(btrim(coalesce(p_offer_code, ''))), '');
  normalized_fingerprint text := lower(btrim(coalesce(p_terms_fingerprint, '')));
  preview jsonb;
  recorded_event public.subscription_events;
  created_adjustment public.subscription_adjustments;
  consented_at timestamptz;
  promotion jsonb;
  result jsonb;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if not coalesce(public.is_organization_owner_for_condominium(p_condominium_id), false) then
    raise exception using errcode = '42501', message = 'commercial checkout requires organization owner scope';
  end if;
  if normalized_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'valid commercial terms fingerprint is required';
  end if;

  select s.*
    into current_sub
    from public.subscriptions s
   where s.condominium_id = p_condominium_id
   for update;

  if current_sub.id is null then
    raise exception using errcode = 'P0002', message = 'subscription not found';
  end if;

  if current_sub.billing_consent_at is not null then
    select e.*
      into recorded_event
      from public.subscription_events e
     where e.subscription_id = current_sub.id
       and e.event_type = 'billing_consent_recorded'
     order by e.created_at desc, e.id desc
     limit 1;

    if recorded_event.id is not null
      and recorded_event.payload->>'terms_fingerprint' = normalized_fingerprint
      and coalesce(recorded_event.payload->>'offer_code', '') = coalesce(normalized_offer_code, '')
    then
      return (recorded_event.payload->'checkout') || pg_catalog.jsonb_build_object(
        'billing_consent_recorded', true,
        'billing_consent_at', current_sub.billing_consent_at,
        'billing_method_ready', current_sub.billing_method_ready_at is not null,
        'auto_bill_enabled', false,
        'idempotent_replay', true
      );
    end if;

    raise exception using errcode = '23514', message = 'commercial consent already recorded';
  end if;

  if current_sub.status <> 'trialing'
    or current_sub.trial_ends_at is null
    or current_sub.trial_ends_at <= clock_timestamp()
  then
    raise exception using errcode = '23514', message = 'commercial checkout requires an active trial';
  end if;

  select t.*
    into locked_term
    from public.subscription_terms t
   where t.subscription_id = current_sub.id
     and t.effective_from <= current_date
     and (t.effective_to is null or t.effective_to > current_date)
   order by t.effective_from desc
   limit 1
   for share;

  if locked_term.id is null then
    raise exception using errcode = 'P0002', message = 'active subscription term not found';
  end if;

  select p.*
    into locked_plan
    from public.plans p
   where p.code = locked_term.plan_code
   for share;

  if locked_plan.code is null then
    raise exception using errcode = 'P0002', message = 'public plan not found';
  end if;

  if normalized_offer_code is not null then
    select o.*
      into selected_offer
      from public.commercial_offers o
     where o.code = normalized_offer_code
     for update;

    if selected_offer.id is null then
      raise exception using errcode = '22023', message = 'promotion code is invalid';
    end if;
  end if;

  preview := habitta_internal.commercial_checkout_preview_v1(
    p_condominium_id,
    normalized_offer_code
  );

  if preview->>'terms_fingerprint' <> normalized_fingerprint then
    raise exception using errcode = '23514', message = 'commercial terms changed; refresh checkout preview';
  end if;

  promotion := preview->'promotion';

  if normalized_offer_code is not null then
    insert into public.subscription_adjustments(
      subscription_id,
      offer_id,
      source,
      adjustment_kind,
      percentage_off,
      fixed_amount,
      currency,
      reference_period_amount,
      effective_period_amount,
      effective_from,
      effective_to,
      authorized_by,
      note
    ) values (
      current_sub.id,
      selected_offer.id,
      'coupon',
      selected_offer.kind,
      selected_offer.percentage_off,
      selected_offer.fixed_amount,
      locked_term.currency,
      locked_term.contracted_period_amount,
      (promotion->>'effective_period_amount')::numeric,
      (promotion->>'starts_on')::date,
      (promotion->>'ends_on')::date,
      actor,
      'HAB-435 customer-authorized checkout promotion'
    )
    returning * into created_adjustment;
  end if;

  consented_at := clock_timestamp();

  update public.subscriptions
     set commercial_status = 'confirmed',
         billing_consent_at = consented_at,
         auto_bill_enabled = false,
         updated_at = consented_at
   where id = current_sub.id;

  result := preview || pg_catalog.jsonb_build_object(
    'commercial_status', 'confirmed',
    'billing_consent_recorded', true,
    'billing_consent_at', consented_at,
    'billing_method_ready', current_sub.billing_method_ready_at is not null,
    'auto_bill_enabled', false,
    'idempotent_replay', false
  );

  insert into public.subscription_events(
    subscription_id,
    condominium_id,
    event_type,
    from_status,
    to_status,
    from_plan,
    to_plan,
    actor_user_id,
    reason,
    payload
  ) values (
    current_sub.id,
    p_condominium_id,
    'billing_consent_recorded',
    current_sub.status,
    current_sub.status,
    locked_term.plan_code,
    locked_term.plan_code,
    actor,
    'customer_checkout_consent',
    pg_catalog.jsonb_build_object(
      'terms_fingerprint', normalized_fingerprint,
      'offer_code', normalized_offer_code,
      'promotion_adjustment_id', created_adjustment.id,
      'from_commercial_status', current_sub.commercial_status,
      'to_commercial_status', 'confirmed',
      'billing_method_ready', current_sub.billing_method_ready_at is not null,
      'auto_bill_enabled', false,
      'checkout', result
    )
  );

  return result;
end;
$$;

revoke all on function public.record_customer_commercial_consent_v1(uuid,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.record_customer_commercial_consent_v1(uuid,text,text)
  to authenticated;

comment on function public.get_customer_commercial_checkout_preview_v1(uuid,text) is
  'HAB-435 customer-owner commercial preview. Validates optional HAB-424 promotion and returns fingerprinted terms without mutating billing state.';
comment on function public.record_customer_commercial_consent_v1(uuid,text,text) is
  'HAB-435 customer-owner explicit commercial consent. Revalidates fingerprinted terms, snapshots one optional promotion, records audit evidence, and never enables automatic billing.';
