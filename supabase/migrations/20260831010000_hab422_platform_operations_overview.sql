-- HAB-422: expose a deliberately narrow, read-only operating view for Habitta's platform team.
--
-- Platform Admin is not a tenant role. The browser still uses only the anon key + the operator's
-- JWT; this RPC is the sole cross-tenant commercial read surface and returns no resident PII,
-- balances, documents, payment proofs, or other tenant-private records.

create or replace function public.get_platform_operations_overview()
returns table (
  organization_id uuid,
  organization_name text,
  account_type text,
  condominium_id uuid,
  condominium_name text,
  building_count bigint,
  active_unit_count bigint,
  membership_count bigint,
  created_at timestamptz,
  subscription_id uuid,
  subscription_status text,
  commercial_status text,
  trial_ends_at timestamptz,
  current_period_end date,
  plan_code text,
  plan_name text,
  billing_period text,
  contracted_period_amount numeric,
  catalog_reference_amount numeric,
  currency text,
  term_origin text,
  term_effective_from date,
  term_effective_to date
)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select
    o.id as organization_id,
    o.name as organization_name,
    o.account_type::text as account_type,
    c.id as condominium_id,
    c.name as condominium_name,
    (select count(*) from public.buildings b where b.condominium_id = c.id) as building_count,
    (
      select count(*)
      from public.units u
      where u.condominium_id = c.id
        and u.status = 'active'
    ) as active_unit_count,
    (
      select count(*)
      from public.condominium_memberships cm
      where cm.condominium_id = c.id
    ) as membership_count,
    c.created_at,
    s.id as subscription_id,
    s.status::text as subscription_status,
    s.commercial_status::text as commercial_status,
    s.trial_ends_at,
    s.current_period_end,
    t.plan_code,
    p.name as plan_name,
    t.billing_period,
    t.contracted_period_amount,
    t.catalog_reference_amount,
    t.currency,
    t.origin as term_origin,
    t.effective_from as term_effective_from,
    t.effective_to as term_effective_to
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
  where public.is_platform_admin()
  order by c.created_at desc;
$$;

revoke all on function public.get_platform_operations_overview()
  from public, anon, authenticated;
grant execute on function public.get_platform_operations_overview()
  to authenticated, service_role;
