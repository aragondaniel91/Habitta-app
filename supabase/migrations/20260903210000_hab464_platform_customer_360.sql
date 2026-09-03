-- HAB-464 / HAB-430 Phase 2: narrow Platform Admin Customer 360 read model.
--
-- This is a SaaS-commercial read boundary, not a tenant accounting view. It deliberately returns
-- organization/condominium identity, subscription/contract state, safe aggregate usage counts and
-- commercial history while excluding resident PII, receivables, payments, ledger and treasury.

create or replace function public.get_platform_customer_360(target_organization uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  organization_name text;
  organization_account_type text;
  result jsonb;
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception using errcode = '42501', message = 'platform admin required';
  end if;

  select o.name, o.account_type::text
    into organization_name, organization_account_type
  from public.organizations o
  where o.id = target_organization;

  if organization_name is null then
    raise exception using errcode = 'P0002', message = 'organization not found';
  end if;

  result := jsonb_build_object(
    'organization', jsonb_build_object(
      'id', target_organization,
      'name', organization_name,
      'account_type', organization_account_type,
      'billable', organization_account_type = 'customer'
    ),
    'condominiums', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'active_unit_count', (
            select count(*)
            from public.units u
            where u.condominium_id = c.id
              and u.status = 'active'
          ),
          'membership_count', (
            select count(*)
            from public.condominium_memberships cm
            where cm.condominium_id = c.id
          ),
          'subscription', case when s.id is null then null else jsonb_build_object(
            'id', s.id,
            'status', s.status::text,
            'commercial_status', s.commercial_status::text,
            'trial_starts_at', s.trial_starts_at,
            'trial_ends_at', s.trial_ends_at,
            'current_period_end', s.current_period_end
          ) end,
          'terms', case when t.id is null then null else jsonb_build_object(
            'id', t.id,
            'plan_code', t.plan_code,
            'plan_name', p.name,
            'billing_period', t.billing_period,
            'currency', t.currency,
            'contracted_period_amount', t.contracted_period_amount,
            'catalog_reference_amount', t.catalog_reference_amount,
            'contracted_unit_limit', t.contracted_unit_limit,
            'unlimited_units', t.unlimited_units,
            'origin', t.origin,
            'effective_from', t.effective_from,
            'effective_to', t.effective_to
          ) end,
          'effective_period_amount', case
            when organization_account_type <> 'customer' or t.id is null then null
            when s.status = 'trialing' and s.trial_ends_at > clock_timestamp() then 0::numeric
            when a.id is not null then a.effective_period_amount
            else t.contracted_period_amount
          end,
          'current_adjustment', case when a.id is null then null else jsonb_build_object(
            'id', a.id,
            'source', a.source,
            'kind', a.adjustment_kind,
            'percentage_off', a.percentage_off,
            'fixed_amount', a.fixed_amount,
            'currency', a.currency,
            'reference_period_amount', a.reference_period_amount,
            'effective_period_amount', a.effective_period_amount,
            'effective_from', a.effective_from,
            'effective_to', a.effective_to,
            'authorized_by', a.authorized_by
          ) end,
          'billing_readiness', jsonb_build_object(
            'auto_bill_enabled', coalesce(s.auto_bill_enabled, false),
            'consent_recorded', s.billing_consent_at is not null,
            'method_ready', s.billing_method_ready_at is not null
          ),
          'attention', jsonb_build_object(
            'missing_subscription', organization_account_type = 'customer' and s.id is null,
            'trial_ends_within_7_days', organization_account_type = 'customer'
              and s.status = 'trialing'
              and s.trial_ends_at > clock_timestamp()
              and s.trial_ends_at <= clock_timestamp() + interval '7 days',
            'billing_setup_incomplete', organization_account_type = 'customer'
              and s.status = 'active'
              and (s.billing_consent_at is null or s.billing_method_ready_at is null),
            'past_due', organization_account_type = 'customer' and s.status = 'past_due',
            'suspended', organization_account_type = 'customer' and s.status = 'suspended'
          )
        )
        order by c.created_at, c.id
      )
      from public.condominiums c
      left join public.subscriptions s on s.condominium_id = c.id
      left join lateral (
        select st.*
        from public.subscription_terms st
        where st.subscription_id = s.id
          and st.effective_from <= current_date
          and (st.effective_to is null or st.effective_to > current_date)
        order by st.effective_from desc, st.created_at desc
        limit 1
      ) t on true
      left join public.plans p on p.code = t.plan_code
      left join lateral (
        select sa.*
        from public.subscription_adjustments sa
        where sa.subscription_id = s.id
          and sa.effective_from <= current_date
          and sa.effective_to > current_date
        order by sa.effective_from desc, sa.created_at desc
        limit 1
      ) a on true
      where c.organization_id = target_organization
    ), '[]'::jsonb),
    'terms_history', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'condominium_id', c.id,
          'subscription_id', s.id,
          'plan_code', st.plan_code,
          'billing_period', st.billing_period,
          'currency', st.currency,
          'contracted_period_amount', st.contracted_period_amount,
          'catalog_reference_amount', st.catalog_reference_amount,
          'contracted_unit_limit', st.contracted_unit_limit,
          'unlimited_units', st.unlimited_units,
          'origin', st.origin,
          'authorized_by', st.authorized_by,
          'effective_from', st.effective_from,
          'effective_to', st.effective_to,
          'created_at', st.created_at
        )
        order by st.effective_from desc, st.created_at desc
      )
      from public.condominiums c
      join public.subscriptions s on s.condominium_id = c.id
      join public.subscription_terms st on st.subscription_id = s.id
      where c.organization_id = target_organization
    ), '[]'::jsonb),
    'adjustment_history', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'condominium_id', c.id,
          'subscription_id', s.id,
          'source', sa.source,
          'kind', sa.adjustment_kind,
          'percentage_off', sa.percentage_off,
          'fixed_amount', sa.fixed_amount,
          'currency', sa.currency,
          'reference_period_amount', sa.reference_period_amount,
          'effective_period_amount', sa.effective_period_amount,
          'effective_from', sa.effective_from,
          'effective_to', sa.effective_to,
          'authorized_by', sa.authorized_by,
          'created_at', sa.created_at
        )
        order by sa.created_at desc
      )
      from public.condominiums c
      join public.subscriptions s on s.condominium_id = c.id
      join public.subscription_adjustments sa on sa.subscription_id = s.id
      where c.organization_id = target_organization
    ), '[]'::jsonb),
    'commercial_history', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'condominium_id', se.condominium_id,
          'subscription_id', se.subscription_id,
          'event_type', se.event_type,
          'from_status', se.from_status::text,
          'to_status', se.to_status::text,
          'from_plan', se.from_plan,
          'to_plan', se.to_plan,
          'actor_user_id', se.actor_user_id,
          'reason', se.reason,
          'created_at', se.created_at
        )
        order by se.created_at desc, se.id desc
      )
      from public.subscription_events se
      join public.condominiums c on c.id = se.condominium_id
      where c.organization_id = target_organization
    ), '[]'::jsonb)
  );

  return result;
end;
$$;

revoke all on function public.get_platform_customer_360(uuid) from public, anon;
grant execute on function public.get_platform_customer_360(uuid) to authenticated, service_role;

comment on function public.get_platform_customer_360(uuid) is
  'HAB-464 Platform Admin Customer 360: SaaS commercial facts and aggregate usage only; excludes resident PII and condominium financial ledger data.';
