-- HAB-424 follow-up hardening.
--
-- The generic RLS-bypass regression intentionally requires client-reachable SECURITY DEFINER
-- functions with row_security=off to carry their authorization check in their own body. Keep these
-- read RPCs explicit rather than relying on the transitive hab424_require_platform_admin() helper.

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
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception using errcode = '42501', message = 'platform admin required';
  end if;

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
    s.billing_method_ready_at is not null
  from public.condominiums c
  join public.organizations o on o.id = c.organization_id
  left join public.subscriptions s on s.condominium_id = c.id
  left join lateral (
    select st.*
    from public.subscription_terms st
    where st.subscription_id = s.id
      and st.effective_from <= current_date
      and (st.effective_to is null or st.effective_to > current_date)
    order by st.effective_from desc
    limit 1
  ) t on true
  left join public.plans p on p.code = t.plan_code
  left join lateral (
    select sa.*
    from public.subscription_adjustments sa
    where sa.subscription_id = s.id
      and sa.effective_from <= current_date
      and sa.effective_to > current_date
    order by sa.effective_from desc
    limit 1
  ) a on true
  order by c.created_at desc;
end;
$$;

revoke all on function public.get_platform_commercial_overview() from public, anon;
grant execute on function public.get_platform_commercial_overview() to authenticated, service_role;
