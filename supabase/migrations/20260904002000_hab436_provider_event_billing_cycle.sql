-- HAB-436: correlate provider charge events to the Habitta billing cycle that created the charge.
-- A delayed webhook must never move a customer's billing anniversary or re-evaluate a promotion
-- against the webhook arrival date. Habitta billing attempts snapshot amount/currency and due date.

create or replace function public.apply_billing_provider_event_v1(
  p_provider text,
  p_provider_event_id text,
  p_event_type text,
  p_subscription_id uuid,
  p_provider_setup_ref text,
  p_provider_customer_ref text,
  p_payment_method_ref text,
  p_provider_payment_ref text,
  p_amount numeric,
  p_currency text,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  normalized_provider text := lower(btrim(p_provider));
  normalized_type text := lower(btrim(p_event_type));
  normalized_currency text := nullif(upper(btrim(coalesce(p_currency, ''))), '');
  normalized_payment_ref text := nullif(btrim(coalesce(p_provider_payment_ref, '')), '');
  normalized_hash text;
  previous habitta_internal.billing_provider_events;
  current_sub public.subscriptions;
  attempt habitta_internal.billing_setup_attempts;
  account habitta_internal.saas_billing_accounts;
  billing_attempt habitta_internal.saas_billing_attempts;
  expected jsonb;
  expected_amount numeric(10,2);
  expected_currency text;
  expected_period text;
  billing_date date;
  event_status text := 'applied';
  rejection text;
  next_period_end date;
begin
  if normalized_provider !~ '^[a-z0-9][a-z0-9_-]{1,31}$' then
    raise exception using errcode = '22023', message = 'invalid billing provider';
  end if;
  if nullif(btrim(coalesce(p_provider_event_id, '')), '') is null then
    raise exception using errcode = '22023', message = 'provider event id is required';
  end if;
  if normalized_type not in (
    'payment_method_ready',
    'payment_method_removed',
    'setup_failed',
    'charge_succeeded',
    'charge_failed'
  ) then
    raise exception using errcode = '22023', message = 'unsupported normalized billing event type';
  end if;
  if p_occurred_at is null then
    raise exception using errcode = '22023', message = 'provider event occurred_at is required';
  end if;

  normalized_hash := encode(
    extensions.digest(
      convert_to(
        pg_catalog.jsonb_strip_nulls(
          pg_catalog.jsonb_build_object(
            'provider', normalized_provider,
            'event_id', btrim(p_provider_event_id),
            'event_type', normalized_type,
            'subscription_id', p_subscription_id,
            'provider_setup_ref', nullif(btrim(coalesce(p_provider_setup_ref, '')), ''),
            'provider_customer_ref', nullif(btrim(coalesce(p_provider_customer_ref, '')), ''),
            'payment_method_ref', nullif(btrim(coalesce(p_payment_method_ref, '')), ''),
            'provider_payment_ref', normalized_payment_ref,
            'amount', p_amount,
            'currency', normalized_currency,
            'occurred_at', p_occurred_at
          )
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(normalized_provider || ':' || btrim(p_provider_event_id), 436)
  );

  select * into previous
  from habitta_internal.billing_provider_events e
  where e.provider = normalized_provider
    and e.provider_event_id = btrim(p_provider_event_id);

  if previous.id is not null then
    if previous.normalized_payload_hash <> normalized_hash then
      raise exception using errcode = '23514', message = 'provider event id reused with different normalized payload';
    end if;
    return pg_catalog.jsonb_build_object(
      'event_id', previous.id,
      'processing_status', previous.processing_status,
      'rejection_reason', previous.rejection_reason,
      'idempotent_replay', true
    );
  end if;

  if p_subscription_id is not null then
    select * into current_sub
    from public.subscriptions s
    where s.id = p_subscription_id
    for update;
  end if;

  if normalized_type in ('payment_method_ready', 'setup_failed') then
    if nullif(btrim(coalesce(p_provider_setup_ref, '')), '') is null then
      event_status := 'rejected';
      rejection := 'provider_setup_ref_required';
    else
      select * into attempt
      from habitta_internal.billing_setup_attempts a
      where a.provider = normalized_provider
        and a.provider_setup_ref = btrim(p_provider_setup_ref)
      for update;

      if attempt.id is null then
        event_status := 'rejected';
        rejection := 'billing_setup_attempt_not_found';
      elsif p_subscription_id is null or attempt.subscription_id <> p_subscription_id then
        event_status := 'rejected';
        rejection := 'subscription_mismatch';
      end if;
    end if;
  else
    if p_subscription_id is null or current_sub.id is null then
      event_status := 'rejected';
      rejection := 'subscription_not_found';
    else
      select * into account
      from habitta_internal.saas_billing_accounts a
      where a.subscription_id = p_subscription_id
      for update;

      if account.subscription_id is null or account.provider <> normalized_provider then
        event_status := 'rejected';
        rejection := 'billing_account_not_found';
      elsif nullif(btrim(coalesce(p_provider_customer_ref, '')), '') is not null
        and account.provider_customer_ref <> btrim(p_provider_customer_ref)
      then
        event_status := 'rejected';
        rejection := 'provider_customer_mismatch';
      end if;
    end if;
  end if;

  if event_status = 'applied' and normalized_type = 'payment_method_ready' then
    if nullif(btrim(coalesce(p_provider_customer_ref, '')), '') is null
      or nullif(btrim(coalesce(p_payment_method_ref, '')), '') is null
    then
      event_status := 'rejected';
      rejection := 'payment_method_reference_required';
    elsif current_sub.id is null then
      select * into current_sub
      from public.subscriptions s
      where s.id = attempt.subscription_id
      for update;
    end if;

    if event_status = 'applied'
      and (current_sub.commercial_status <> 'confirmed' or current_sub.billing_consent_at is null)
    then
      event_status := 'rejected';
      rejection := 'commercial_consent_missing';
    end if;
  end if;

  if event_status = 'applied' and normalized_type in ('charge_succeeded', 'charge_failed') then
    if normalized_payment_ref is null then
      event_status := 'rejected';
      rejection := 'provider_payment_ref_required';
    elsif current_sub.billing_consent_at is null
      or current_sub.billing_method_ready_at is null
      or not current_sub.auto_bill_enabled
    then
      event_status := 'rejected';
      rejection := 'automatic_billing_not_authorized';
    else
      select * into billing_attempt
      from habitta_internal.saas_billing_attempts a
      where a.provider = normalized_provider
        and a.provider_payment_ref = normalized_payment_ref
      for update;

      if billing_attempt.id is not null then
        if billing_attempt.subscription_id <> current_sub.id then
          event_status := 'rejected';
          rejection := 'billing_attempt_subscription_mismatch';
        else
          billing_date := billing_attempt.billing_cycle_on;
          expected_amount := billing_attempt.expected_amount;
          expected_currency := billing_attempt.currency;
          expected := habitta_internal.expected_saas_period_v1(current_sub.id, billing_date);
          expected_period := expected->>'billing_period';
        end if;
      else
        -- Compatibility for provider events created before the scheduler foundation. New scheduled
        -- charges always have a Habitta attempt and therefore never use webhook arrival as cadence.
        billing_date := coalesce(
          current_sub.current_period_end,
          current_sub.trial_ends_at::date,
          p_occurred_at::date
        );
        expected := habitta_internal.expected_saas_period_v1(current_sub.id, billing_date);
        expected_amount := (expected->>'effective_period_amount')::numeric;
        expected_currency := expected->>'currency';
        expected_period := expected->>'billing_period';
      end if;

      if event_status = 'applied' then
        if p_amount is null or normalized_currency is null then
          event_status := 'rejected';
          rejection := 'amount_and_currency_required';
        elsif p_amount <> expected_amount or normalized_currency <> expected_currency then
          event_status := 'rejected';
          rejection := 'commercial_amount_mismatch';
        elsif expected_amount <= 0 then
          event_status := 'rejected';
          rejection := 'no_provider_charge_expected';
        end if;
      end if;
    end if;
  end if;

  if event_status = 'applied' and normalized_type = 'payment_method_ready' then
    insert into habitta_internal.saas_billing_accounts(
      subscription_id,
      provider,
      provider_customer_ref,
      payment_method_ref
    ) values (
      current_sub.id,
      normalized_provider,
      btrim(p_provider_customer_ref),
      btrim(p_payment_method_ref)
    )
    on conflict (subscription_id) do update
      set provider = excluded.provider,
          provider_customer_ref = excluded.provider_customer_ref,
          payment_method_ref = excluded.payment_method_ref,
          updated_at = now();

    update habitta_internal.billing_setup_attempts
       set status = 'ready',
           provider_customer_ref = coalesce(provider_customer_ref, btrim(p_provider_customer_ref)),
           updated_at = now(),
           failure_code = null
     where id = attempt.id;

    update public.subscriptions
       set billing_method_ready_at = coalesce(billing_method_ready_at, p_occurred_at),
           auto_bill_enabled = true,
           updated_at = now()
     where id = current_sub.id;

    insert into public.subscription_events(
      subscription_id, condominium_id, event_type, from_status, to_status,
      actor_user_id, reason, payload
    ) values (
      current_sub.id, current_sub.condominium_id, 'payment_method_ready',
      current_sub.status, current_sub.status, null, 'billing_provider_event',
      pg_catalog.jsonb_build_object(
        'provider', normalized_provider,
        'provider_event_id', btrim(p_provider_event_id),
        'attempt_id', attempt.id,
        'automatic_billing_enabled', true
      )
    );
  elsif event_status = 'applied' and normalized_type = 'setup_failed' then
    update habitta_internal.billing_setup_attempts
       set status = 'failed',
           failure_code = 'provider_setup_failed',
           updated_at = now()
     where id = attempt.id;

    insert into public.subscription_events(
      subscription_id, condominium_id, event_type, from_status, to_status,
      actor_user_id, reason, payload
    ) values (
      attempt.subscription_id, attempt.condominium_id, 'billing_setup_failed',
      current_sub.status, current_sub.status, null, 'billing_provider_event',
      pg_catalog.jsonb_build_object(
        'provider', normalized_provider,
        'provider_event_id', btrim(p_provider_event_id),
        'attempt_id', attempt.id
      )
    );
  elsif event_status = 'applied' and normalized_type = 'payment_method_removed' then
    update habitta_internal.saas_billing_accounts
       set payment_method_ref = null,
           updated_at = now()
     where subscription_id = current_sub.id;

    update public.subscriptions
       set billing_method_ready_at = null,
           auto_bill_enabled = false,
           updated_at = now()
     where id = current_sub.id;

    insert into public.subscription_events(
      subscription_id, condominium_id, event_type, from_status, to_status,
      actor_user_id, reason, payload
    ) values (
      current_sub.id, current_sub.condominium_id, 'payment_method_removed',
      current_sub.status, current_sub.status, null, 'billing_provider_event',
      pg_catalog.jsonb_build_object(
        'provider', normalized_provider,
        'provider_event_id', btrim(p_provider_event_id),
        'automatic_billing_enabled', false
      )
    );
  elsif event_status = 'applied' and normalized_type = 'charge_succeeded' then
    next_period_end := case expected_period
      when 'annual' then (billing_date + interval '1 year')::date
      else (billing_date + interval '1 month')::date
    end;

    update public.subscriptions
       set status = 'active',
           current_period_end = next_period_end,
           updated_at = now()
     where id = current_sub.id;

    insert into public.subscription_events(
      subscription_id, condominium_id, event_type, from_status, to_status,
      actor_user_id, reason, payload
    ) values (
      current_sub.id, current_sub.condominium_id, 'saas_billing_succeeded',
      current_sub.status, 'active', null, 'billing_provider_event',
      pg_catalog.jsonb_build_object(
        'provider', normalized_provider,
        'provider_event_id', btrim(p_provider_event_id),
        'provider_payment_ref', normalized_payment_ref,
        'amount', p_amount,
        'currency', normalized_currency,
        'billing_cycle_on', billing_date,
        'provider_occurred_at', p_occurred_at,
        'period_end', next_period_end
      )
    );
  elsif event_status = 'applied' and normalized_type = 'charge_failed' then
    update public.subscriptions
       set status = 'past_due',
           updated_at = now()
     where id = current_sub.id;

    insert into public.subscription_events(
      subscription_id, condominium_id, event_type, from_status, to_status,
      actor_user_id, reason, payload
    ) values (
      current_sub.id, current_sub.condominium_id, 'saas_billing_failed',
      current_sub.status, 'past_due', null, 'billing_provider_event',
      pg_catalog.jsonb_build_object(
        'provider', normalized_provider,
        'provider_event_id', btrim(p_provider_event_id),
        'provider_payment_ref', normalized_payment_ref,
        'amount', p_amount,
        'currency', normalized_currency,
        'billing_cycle_on', billing_date,
        'provider_occurred_at', p_occurred_at
      )
    );
  end if;

  insert into habitta_internal.billing_provider_events(
    provider,
    provider_event_id,
    normalized_event_type,
    subscription_id,
    normalized_payload_hash,
    provider_payment_ref,
    amount,
    currency,
    occurred_at,
    processing_status,
    rejection_reason
  ) values (
    normalized_provider,
    btrim(p_provider_event_id),
    normalized_type,
    p_subscription_id,
    normalized_hash,
    normalized_payment_ref,
    p_amount,
    normalized_currency,
    p_occurred_at,
    event_status,
    rejection
  ) returning id into previous.id;

  return pg_catalog.jsonb_build_object(
    'event_id', previous.id,
    'processing_status', event_status,
    'rejection_reason', rejection,
    'idempotent_replay', false
  );
end;
$$;

revoke all on function public.apply_billing_provider_event_v1(
  text,text,text,uuid,text,text,text,text,numeric,text,timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.apply_billing_provider_event_v1(
  text,text,text,uuid,text,text,text,text,numeric,text,timestamptz
) to service_role;

comment on function public.apply_billing_provider_event_v1(text,text,text,uuid,text,text,text,text,numeric,text,timestamptz) is
  'HAB-436 service-only normalized provider reducer. Scheduled charge validation/period cadence comes from the Habitta billing attempt, never webhook arrival time.';
