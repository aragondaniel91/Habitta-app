-- HAB-437: self-service first workspace + 30-day trial.
--
-- Esencial and Comunidad may be provisioned without Platform Admin intervention. Pro remains a
-- guided/commercial onboarding plan. The whole workspace + subscription operation is transactional
-- and idempotent so a lost HTTP response cannot create a second organization on retry.

create schema if not exists habitta_internal;
revoke all on schema habitta_internal from public, anon, authenticated, service_role;

create table if not exists habitta_internal.self_service_onboarding_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key uuid not null,
  request_fingerprint text not null check (char_length(request_fingerprint) = 32),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  result_payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, idempotency_key)
);

revoke all on table habitta_internal.self_service_onboarding_requests
  from public, anon, authenticated, service_role;

create or replace function public.create_self_service_trial_workspace_v1(
  p_organization_name text,
  p_organization_type text,
  p_condominium_name text,
  p_country_code text,
  p_address_line1 text,
  p_city text,
  p_timezone text,
  p_primary_currency_code text,
  p_property_topology public.condominium_property_topology,
  p_plan_code text,
  p_billing_period text,
  p_idempotency_key uuid,
  p_secondary_currency_code text default null,
  p_legal_name text default null,
  p_legal_id_type text default null,
  p_legal_id_number text default null,
  p_address_line2 text default null,
  p_state_region text default null,
  p_municipality text default null,
  p_parish text default null,
  p_postal_code text default null,
  p_declared_unit_count integer default null,
  p_declared_building_count integer default null,
  p_first_building_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor uuid := auth.uid();
  normalized_plan_code text := lower(btrim(p_plan_code));
  normalized_billing_period text := lower(btrim(p_billing_period));
  selected_plan public.plans;
  previous_request habitta_internal.self_service_onboarding_requests;
  request_fingerprint text;
  workspace jsonb;
  created_subscription public.subscriptions;
  organization_id uuid;
  condominium_id uuid;
  contracted_amount numeric(10,2);
  trial_started_at timestamptz := clock_timestamp();
  trial_ends_at timestamptz;
  result jsonb;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_idempotency_key is null then
    raise exception using errcode = '22023', message = 'idempotency key is required';
  end if;

  -- Serialize first-workspace creation per authenticated user. This is a user-scoped lock, not a
  -- global tenant lock, and prevents two different browser retries from both passing the
  -- no-membership check before either transaction commits.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text, 437));

  request_fingerprint := pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'organization_name', btrim(p_organization_name),
      'organization_type', p_organization_type,
      'condominium_name', btrim(p_condominium_name),
      'country_code', upper(p_country_code),
      'address_line1', btrim(p_address_line1),
      'city', btrim(p_city),
      'timezone', btrim(p_timezone),
      'primary_currency_code', upper(p_primary_currency_code),
      'property_topology', p_property_topology::text,
      'plan_code', normalized_plan_code,
      'billing_period', normalized_billing_period,
      'secondary_currency_code', nullif(upper(btrim(coalesce(p_secondary_currency_code, ''))), ''),
      'legal_name', nullif(btrim(coalesce(p_legal_name, '')), ''),
      'legal_id_type', nullif(upper(btrim(coalesce(p_legal_id_type, ''))), ''),
      'legal_id_number', nullif(upper(btrim(coalesce(p_legal_id_number, ''))), ''),
      'address_line2', nullif(btrim(coalesce(p_address_line2, '')), ''),
      'state_region', nullif(btrim(coalesce(p_state_region, '')), ''),
      'municipality', nullif(btrim(coalesce(p_municipality, '')), ''),
      'parish', nullif(btrim(coalesce(p_parish, '')), ''),
      'postal_code', nullif(btrim(coalesce(p_postal_code, '')), ''),
      'declared_unit_count', p_declared_unit_count,
      'declared_building_count', p_declared_building_count,
      'first_building_name', nullif(btrim(coalesce(p_first_building_name, '')), '')
    )::text
  );

  select * into previous_request
  from habitta_internal.self_service_onboarding_requests r
  where r.user_id = actor
    and r.idempotency_key = p_idempotency_key;

  if previous_request.user_id is not null then
    if previous_request.request_fingerprint <> request_fingerprint then
      raise exception using errcode = '22023', message = 'idempotency key reused with different onboarding request';
    end if;
    return previous_request.result_payload;
  end if;

  if exists (
    select 1
    from public.organization_memberships om
    where om.user_id = actor
  ) then
    raise exception using errcode = '23505', message = 'self-service onboarding is only available for the first workspace';
  end if;

  if normalized_plan_code not in ('esencial', 'comunidad') then
    raise exception using errcode = '23514', message = 'selected plan requires guided onboarding';
  end if;

  select * into selected_plan
  from public.plans p
  where p.code = normalized_plan_code
    and p.is_public;

  if selected_plan.code is null then
    raise exception using errcode = '22023', message = 'public plan not found';
  end if;

  if normalized_billing_period not in ('monthly', 'annual') then
    raise exception using errcode = '22023', message = 'billing period must be monthly or annual';
  end if;

  if p_declared_unit_count is not null
    and p_declared_unit_count > selected_plan.default_unit_limit
  then
    raise exception using errcode = '23514', message = 'selected plan unit limit exceeded';
  end if;

  workspace := public.create_admin_workspace_v2(
    organization_name => p_organization_name,
    organization_type => p_organization_type,
    condominium_name => p_condominium_name,
    country_code => p_country_code,
    address_line1 => p_address_line1,
    city => p_city,
    timezone => p_timezone,
    primary_currency_code => p_primary_currency_code,
    property_topology => p_property_topology,
    secondary_currency_code => p_secondary_currency_code,
    legal_name => p_legal_name,
    legal_id_type => p_legal_id_type,
    legal_id_number => p_legal_id_number,
    address_line2 => p_address_line2,
    state_region => p_state_region,
    municipality => p_municipality,
    parish => p_parish,
    postal_code => p_postal_code,
    declared_unit_count => p_declared_unit_count,
    declared_building_count => p_declared_building_count,
    first_building_name => p_first_building_name
  );

  organization_id := (workspace #>> '{organization,id}')::uuid;
  condominium_id := (workspace #>> '{condominium,id}')::uuid;

  if organization_id is null or condominium_id is null then
    raise exception using errcode = 'P0001', message = 'workspace creation did not return required identifiers';
  end if;
  if not exists (
    select 1
    from public.organizations o
    where o.id = organization_id
      and o.account_type = 'customer'
      and o.created_by = actor
  ) then
    raise exception using errcode = '23514', message = 'self-service onboarding requires a customer organization';
  end if;

  contracted_amount := case
    when normalized_billing_period = 'annual' then selected_plan.catalog_annual_usd
    else selected_plan.catalog_monthly_usd
  end;
  trial_ends_at := trial_started_at + interval '30 days';

  insert into public.subscriptions(
    condominium_id,
    status,
    commercial_status,
    trial_starts_at,
    trial_ends_at,
    current_period_end,
    auto_bill_enabled
  ) values (
    condominium_id,
    'trialing',
    'not_yet_confirmed',
    trial_started_at,
    trial_ends_at,
    null,
    false
  ) returning * into created_subscription;

  insert into public.subscription_terms(
    subscription_id,
    plan_code,
    contracted_period_amount,
    currency,
    billing_period,
    contracted_unit_limit,
    unlimited_units,
    origin,
    catalog_reference_amount,
    authorized_by,
    effective_from,
    effective_to,
    note
  ) values (
    created_subscription.id,
    selected_plan.code,
    contracted_amount,
    'USD',
    normalized_billing_period,
    selected_plan.default_unit_limit,
    false,
    'catalog',
    contracted_amount,
    actor,
    current_date,
    null,
    'HAB-437 self-service 30-day trial term'
  );

  insert into public.subscription_events(
    subscription_id,
    condominium_id,
    event_type,
    to_status,
    to_plan,
    actor_user_id,
    reason,
    payload
  ) values (
    created_subscription.id,
    condominium_id,
    'trial_started',
    'trialing',
    selected_plan.code,
    actor,
    'self_service_30_day_trial',
    pg_catalog.jsonb_build_object(
      'trial_starts_at', trial_started_at,
      'trial_ends_at', trial_ends_at,
      'billing_period', normalized_billing_period,
      'onboarding', 'self_service'
    )
  );

  result := workspace || pg_catalog.jsonb_build_object(
    'trial', pg_catalog.jsonb_build_object(
      'subscription_id', created_subscription.id,
      'status', created_subscription.status,
      'commercial_status', created_subscription.commercial_status,
      'plan_code', selected_plan.code,
      'billing_period', normalized_billing_period,
      'contracted_period_amount', contracted_amount,
      'trial_starts_at', trial_started_at,
      'trial_ends_at', trial_ends_at,
      'auto_bill_enabled', false
    )
  );

  insert into habitta_internal.self_service_onboarding_requests(
    user_id,
    idempotency_key,
    request_fingerprint,
    organization_id,
    condominium_id,
    subscription_id,
    result_payload
  ) values (
    actor,
    p_idempotency_key,
    request_fingerprint,
    organization_id,
    condominium_id,
    created_subscription.id,
    result
  );

  return result;
end;
$$;

revoke all on function public.create_self_service_trial_workspace_v1(
  text,text,text,text,text,text,text,text,public.condominium_property_topology,text,text,uuid,
  text,text,text,text,text,text,text,text,text,integer,integer,text
) from public, anon, authenticated, service_role;
grant execute on function public.create_self_service_trial_workspace_v1(
  text,text,text,text,text,text,text,text,public.condominium_property_topology,text,text,uuid,
  text,text,text,text,text,text,text,text,text,integer,integer,text
) to authenticated;

comment on function public.create_self_service_trial_workspace_v1(
  text,text,text,text,text,text,text,text,public.condominium_property_topology,text,text,uuid,
  text,text,text,text,text,text,text,text,text,integer,integer,text
) is
  'HAB-437 atomic/idempotent first workspace + 30-day trial for self-service Esencial/Comunidad. Pro remains guided onboarding.';
