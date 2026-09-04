-- HAB-436: provider-neutral SaaS billing foundation.
--
-- This migration deliberately does NOT choose a payment provider. It establishes the narrow,
-- server-only boundary a concrete adapter must use later: customer-authorized setup attempts,
-- opaque provider references, idempotent normalized provider events and Habitta-owned commercial
-- transitions. Raw card data, provider secrets and resident/condominium accounting never enter
-- these tables.

create schema if not exists habitta_internal;
revoke all on schema habitta_internal from public, anon, authenticated, service_role;

-- One provider customer/payment-method binding per Habitta SaaS subscription. Provider references
-- are opaque correlation identifiers only; they are not commercial source-of-truth fields.
create table habitta_internal.saas_billing_accounts (
  subscription_id uuid primary key references public.subscriptions(id) on delete cascade,
  provider text not null,
  provider_customer_ref text not null,
  payment_method_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saas_billing_accounts_provider_shape check (provider ~ '^[a-z0-9][a-z0-9_-]{1,31}$'),
  constraint saas_billing_accounts_customer_ref_shape check (char_length(btrim(provider_customer_ref)) between 1 and 255),
  constraint saas_billing_accounts_method_ref_shape check (
    payment_method_ref is null or char_length(btrim(payment_method_ref)) between 1 and 255
  ),
  unique (provider, provider_customer_ref)
);

-- Browser-visible setup intent is represented by a Habitta attempt ID, never by a provider secret.
-- A concrete server-side adapter may later attach its opaque setup/customer references.
create table habitta_internal.billing_setup_attempts (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  requested_by uuid not null references auth.users(id),
  idempotency_key uuid not null,
  request_fingerprint text not null,
  provider text,
  provider_setup_ref text,
  provider_customer_ref text,
  status text not null default 'pending',
  expires_at timestamptz,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_setup_attempts_fingerprint_shape check (char_length(request_fingerprint) = 32),
  constraint billing_setup_attempts_provider_shape check (
    provider is null or provider ~ '^[a-z0-9][a-z0-9_-]{1,31}$'
  ),
  constraint billing_setup_attempts_setup_ref_shape check (
    provider_setup_ref is null or char_length(btrim(provider_setup_ref)) between 1 and 255
  ),
  constraint billing_setup_attempts_customer_ref_shape check (
    provider_customer_ref is null or char_length(btrim(provider_customer_ref)) between 1 and 255
  ),
  constraint billing_setup_attempts_status_shape check (
    status in ('pending', 'provider_created', 'ready', 'failed', 'expired')
  ),
  constraint billing_setup_attempts_provider_fields_shape check (
    (status = 'pending' and provider is null and provider_setup_ref is null and provider_customer_ref is null)
    or
    (status <> 'pending' and provider is not null)
  ),
  unique (requested_by, idempotency_key)
);

create index billing_setup_attempts_subscription_idx
  on habitta_internal.billing_setup_attempts (subscription_id, created_at desc);
create unique index billing_setup_attempts_provider_setup_idx
  on habitta_internal.billing_setup_attempts (provider, provider_setup_ref)
  where provider is not null and provider_setup_ref is not null;

-- Raw provider bodies are intentionally not stored. The Worker adapter must first verify the
-- provider signature, normalize the event and pass only the fields Habitta understands. The DB
-- computes its own SHA-256 over that normalized representation and uses provider+event_id as the
-- durable idempotency key.
create table habitta_internal.billing_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  normalized_event_type text not null,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  normalized_payload_hash text not null,
  provider_payment_ref text,
  amount numeric(10,2),
  currency text,
  occurred_at timestamptz not null,
  processing_status text not null,
  rejection_reason text,
  received_at timestamptz not null default now(),
  processed_at timestamptz not null default now(),
  constraint billing_provider_events_provider_shape check (provider ~ '^[a-z0-9][a-z0-9_-]{1,31}$'),
  constraint billing_provider_events_event_id_shape check (char_length(btrim(provider_event_id)) between 1 and 255),
  constraint billing_provider_events_type_shape check (
    normalized_event_type in (
      'payment_method_ready',
      'payment_method_removed',
      'setup_failed',
      'charge_succeeded',
      'charge_failed'
    )
  ),
  constraint billing_provider_events_hash_shape check (normalized_payload_hash ~ '^[0-9a-f]{64}$'),
  constraint billing_provider_events_payment_ref_shape check (
    provider_payment_ref is null or char_length(btrim(provider_payment_ref)) between 1 and 255
  ),
  constraint billing_provider_events_amount_shape check (amount is null or amount >= 0),
  constraint billing_provider_events_currency_shape check (currency is null or currency ~ '^[A-Z]{3}$'),
  constraint billing_provider_events_processing_shape check (processing_status in ('applied', 'rejected')),
  constraint billing_provider_events_rejection_shape check (
    (processing_status = 'applied' and rejection_reason is null)
    or (processing_status = 'rejected' and rejection_reason is not null)
  ),
  unique (provider, provider_event_id)
);

create index billing_provider_events_subscription_idx
  on habitta_internal.billing_provider_events (subscription_id, received_at desc);

revoke all on table
  habitta_internal.saas_billing_accounts,
  habitta_internal.billing_setup_attempts,
  habitta_internal.billing_provider_events
from public, anon, authenticated, service_role;

-- ------------------------------------------------------------------ internal helpers

create or replace function habitta_internal.require_customer_subscription_v1(target_condominium uuid)
returns public.subscriptions
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  result public.subscriptions;
  account_type public.organization_account_type;
begin
  select o.account_type
    into account_type
    from public.condominiums c
    join public.organizations o on o.id = c.organization_id
   where c.id = target_condominium;

  if account_type is null then
    raise exception using errcode = '23503', message = 'condominium not found';
  end if;
  if account_type <> 'customer' then
    raise exception using errcode = '23514', message = 'SaaS billing is only permitted for customer organizations';
  end if;

  select * into result
  from public.subscriptions s
  where s.condominium_id = target_condominium;

  if result.id is null then
    raise exception using errcode = 'P0002', message = 'subscription not found';
  end if;

  return result;
end;
$$;

revoke all on function habitta_internal.require_customer_subscription_v1(uuid)
  from public, anon, authenticated, service_role;

create or replace function habitta_internal.expected_saas_period_v1(
  target_subscription uuid,
  billing_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  term public.subscription_terms;
  adjustment public.subscription_adjustments;
  effective_amount numeric(10,2);
begin
  select * into term
  from public.subscription_terms t
  where t.subscription_id = target_subscription
    and t.effective_from <= billing_date
    and (t.effective_to is null or t.effective_to > billing_date)
  order by t.effective_from desc
  limit 1;

  if term.id is null then
    raise exception using errcode = 'P0002', message = 'commercial term not found for billing date';
  end if;

  select * into adjustment
  from public.subscription_adjustments a
  where a.subscription_id = target_subscription
    and a.effective_from <= billing_date
    and a.effective_to > billing_date
  order by a.effective_from desc
  limit 1;

  effective_amount := case
    when adjustment.id is not null then adjustment.effective_period_amount
    else term.contracted_period_amount
  end;

  return pg_catalog.jsonb_build_object(
    'currency', term.currency,
    'billing_period', term.billing_period,
    'contracted_period_amount', term.contracted_period_amount,
    'effective_period_amount', effective_amount,
    'adjustment_id', adjustment.id
  );
end;
$$;

revoke all on function habitta_internal.expected_saas_period_v1(uuid,date)
  from public, anon, authenticated, service_role;

-- ------------------------------------------------------------------ customer-authorized setup intent

create or replace function public.begin_customer_billing_setup_v1(
  p_condominium_id uuid,
  p_idempotency_key uuid
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
  previous habitta_internal.billing_setup_attempts;
  created habitta_internal.billing_setup_attempts;
  fingerprint text;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_idempotency_key is null then
    raise exception using errcode = '22023', message = 'idempotency key is required';
  end if;
  if not public.is_organization_owner_for_condominium(p_condominium_id) then
    raise exception using errcode = '42501', message = 'billing setup requires organization owner scope';
  end if;

  current_sub := habitta_internal.require_customer_subscription_v1(p_condominium_id);

  if current_sub.status = 'cancelled' then
    raise exception using errcode = '23514', message = 'cancelled subscription cannot configure billing';
  end if;
  if current_sub.commercial_status <> 'confirmed' or current_sub.billing_consent_at is null then
    raise exception using errcode = '23514', message = 'explicit commercial consent is required before payment setup';
  end if;

  fingerprint := pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'condominium_id', p_condominium_id,
      'subscription_id', current_sub.id,
      'requested_by', actor
    )::text
  );

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text, 436));

  select * into previous
  from habitta_internal.billing_setup_attempts a
  where a.requested_by = actor
    and a.idempotency_key = p_idempotency_key;

  if previous.id is not null then
    if previous.request_fingerprint <> fingerprint then
      raise exception using errcode = '22023', message = 'idempotency key reused with different billing setup request';
    end if;
    return pg_catalog.jsonb_build_object(
      'attempt_id', previous.id,
      'subscription_id', previous.subscription_id,
      'condominium_id', previous.condominium_id,
      'status', previous.status,
      'idempotent_replay', true,
      'billing_method_ready', current_sub.billing_method_ready_at is not null,
      'auto_bill_enabled', current_sub.auto_bill_enabled
    );
  end if;

  if current_sub.billing_method_ready_at is not null then
    return pg_catalog.jsonb_build_object(
      'attempt_id', null,
      'subscription_id', current_sub.id,
      'condominium_id', p_condominium_id,
      'status', 'ready',
      'idempotent_replay', false,
      'billing_method_ready', true,
      'auto_bill_enabled', current_sub.auto_bill_enabled
    );
  end if;

  insert into habitta_internal.billing_setup_attempts(
    subscription_id,
    condominium_id,
    requested_by,
    idempotency_key,
    request_fingerprint
  ) values (
    current_sub.id,
    p_condominium_id,
    actor,
    p_idempotency_key,
    fingerprint
  ) returning * into created;

  insert into public.subscription_events(
    subscription_id,
    condominium_id,
    event_type,
    from_status,
    to_status,
    actor_user_id,
    reason,
    payload
  ) values (
    current_sub.id,
    p_condominium_id,
    'billing_setup_requested',
    current_sub.status,
    current_sub.status,
    actor,
    'customer_payment_method_setup',
    pg_catalog.jsonb_build_object('attempt_id', created.id, 'auto_bill_enabled', false)
  );

  return pg_catalog.jsonb_build_object(
    'attempt_id', created.id,
    'subscription_id', created.subscription_id,
    'condominium_id', created.condominium_id,
    'status', created.status,
    'idempotent_replay', false,
    'billing_method_ready', false,
    'auto_bill_enabled', false
  );
end;
$$;

revoke all on function public.begin_customer_billing_setup_v1(uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.begin_customer_billing_setup_v1(uuid,uuid) to authenticated;

-- The Worker calls this only after a concrete server-side adapter creates a provider setup session.
create or replace function public.attach_billing_provider_setup_v1(
  p_attempt_id uuid,
  p_provider text,
  p_provider_setup_ref text,
  p_provider_customer_ref text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  attempt habitta_internal.billing_setup_attempts;
  normalized_provider text := lower(btrim(p_provider));
begin
  select * into attempt
  from habitta_internal.billing_setup_attempts a
  where a.id = p_attempt_id
  for update;

  if attempt.id is null then
    raise exception using errcode = 'P0002', message = 'billing setup attempt not found';
  end if;
  if normalized_provider !~ '^[a-z0-9][a-z0-9_-]{1,31}$' then
    raise exception using errcode = '22023', message = 'invalid billing provider';
  end if;
  if nullif(btrim(coalesce(p_provider_setup_ref, '')), '') is null
    or nullif(btrim(coalesce(p_provider_customer_ref, '')), '') is null
  then
    raise exception using errcode = '22023', message = 'provider setup references are required';
  end if;

  if attempt.status = 'provider_created' then
    if attempt.provider = normalized_provider
      and attempt.provider_setup_ref = btrim(p_provider_setup_ref)
      and attempt.provider_customer_ref = btrim(p_provider_customer_ref)
    then
      return pg_catalog.jsonb_build_object(
        'attempt_id', attempt.id,
        'status', attempt.status,
        'idempotent_replay', true
      );
    end if;
    raise exception using errcode = '23514', message = 'billing setup attempt already attached to different provider state';
  end if;
  if attempt.status <> 'pending' then
    raise exception using errcode = '23514', message = 'billing setup attempt is not attachable';
  end if;

  update habitta_internal.billing_setup_attempts
     set provider = normalized_provider,
         provider_setup_ref = btrim(p_provider_setup_ref),
         provider_customer_ref = btrim(p_provider_customer_ref),
         status = 'provider_created',
         expires_at = p_expires_at,
         updated_at = now()
   where id = attempt.id;

  return pg_catalog.jsonb_build_object(
    'attempt_id', attempt.id,
    'status', 'provider_created',
    'idempotent_replay', false
  );
end;
$$;

revoke all on function public.attach_billing_provider_setup_v1(uuid,text,text,text,timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.attach_billing_provider_setup_v1(uuid,text,text,text,timestamptz)
  to service_role;

-- ------------------------------------------------------------------ normalized, idempotent provider events

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
  normalized_hash text;
  previous habitta_internal.billing_provider_events;
  current_sub public.subscriptions;
  attempt habitta_internal.billing_setup_attempts;
  account habitta_internal.saas_billing_accounts;
  expected jsonb;
  expected_amount numeric(10,2);
  expected_currency text;
  expected_period text;
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
            'provider_payment_ref', nullif(btrim(coalesce(p_provider_payment_ref, '')), ''),
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
    select * into account
    from habitta_internal.saas_billing_accounts a
    where a.subscription_id = p_subscription_id
    for update;

    if p_subscription_id is null or current_sub.id is null then
      event_status := 'rejected';
      rejection := 'subscription_not_found';
    elsif account.subscription_id is null or account.provider <> normalized_provider then
      event_status := 'rejected';
      rejection := 'billing_account_not_found';
    elsif nullif(btrim(coalesce(p_provider_customer_ref, '')), '') is not null
      and account.provider_customer_ref <> btrim(p_provider_customer_ref)
    then
      event_status := 'rejected';
      rejection := 'provider_customer_mismatch';
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
    if current_sub.billing_consent_at is null
      or current_sub.billing_method_ready_at is null
      or not current_sub.auto_bill_enabled
    then
      event_status := 'rejected';
      rejection := 'automatic_billing_not_authorized';
    else
      expected := habitta_internal.expected_saas_period_v1(current_sub.id, p_occurred_at::date);
      expected_amount := (expected->>'effective_period_amount')::numeric;
      expected_currency := expected->>'currency';
      expected_period := expected->>'billing_period';

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
      when 'annual' then (p_occurred_at::date + interval '1 year')::date
      else (p_occurred_at::date + interval '1 month')::date
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
        'provider_payment_ref', nullif(btrim(coalesce(p_provider_payment_ref, '')), ''),
        'amount', p_amount,
        'currency', normalized_currency,
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
        'provider_payment_ref', nullif(btrim(coalesce(p_provider_payment_ref, '')), ''),
        'amount', p_amount,
        'currency', normalized_currency
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
    nullif(btrim(coalesce(p_provider_payment_ref, '')), ''),
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

comment on function public.begin_customer_billing_setup_v1(uuid,uuid) is
  'HAB-436 customer-authorized/idempotent payment-method setup intent. Requires prior HAB-435 commercial consent and never marks a payment method ready.';
comment on function public.attach_billing_provider_setup_v1(uuid,text,text,text,timestamptz) is
  'HAB-436 service-only attachment of opaque provider setup/customer references after server-side provider session creation.';
comment on function public.apply_billing_provider_event_v1(text,text,text,uuid,text,text,text,text,numeric,text,timestamptz) is
  'HAB-436 service-only normalized provider event reducer. Idempotent by provider+event id; provider payloads never mutate resident finance.';
