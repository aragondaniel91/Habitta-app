-- HAB-412/HAB-416: what commercial placement actually did to real customers.
--
-- Run this by hand against production, read it, and only then design enforcement. Turning
-- enforcement on over placements nobody reviewed is how a paying customer gets locked out of their
-- own condominium by a row a migration wrote at 3am.
--
-- HAB-416 makes the commercial boundary explicit: every metric and review query below is scoped to
-- organizations.account_type = 'customer'. Demo/internal tenants are operational fixtures, not
-- revenue, contracts, MRR, or customers. The final diagnostic must remain zero and catches any
-- historical contradiction if this report is run against a database predating the HAB-416 guard.
--
-- Read-only by construction: the first statement puts the session in a read-only transaction, so
-- an accidental UPDATE in here fails rather than executes. There is no write in this file, and
-- there must never be one -- if you need to change a placement, that is a migration with a review,
-- not a script somebody ran once.
--
-- This is deliberately NOT a CI workflow. The repository is public, and Actions logs and artifacts
-- on a public repository are readable by anyone; a report naming condominiums and plans would
-- publish the customer list. Run it locally, where the output stays with you.
--
--   psql "$HABITTA_PROD_URL" -f scripts/commercial-placement-report.sql
--
-- Do not paste the connection string into a shell history file you sync, and do not paste the
-- output anywhere public.

begin transaction read only;

\echo ''
\echo '=== 1. Did every CUSTOMER condominium get placed? ==='
-- A customer condominium with no subscription resolves closed, which means enforcement would block
-- it on day one. Demo/internal are intentionally absent from this denominator.
select
  (select count(*)
     from public.condominiums c
     join public.organizations o on o.id = c.organization_id
    where o.account_type = 'customer') as customer_condominiums,
  (select count(*)
     from public.subscriptions s
     join public.condominiums c on c.id = s.condominium_id
     join public.organizations o on o.id = c.organization_id
    where o.account_type = 'customer') as customer_subscriptions,
  (select count(*)
     from public.condominiums c
     join public.organizations o on o.id = c.organization_id
    where o.account_type = 'customer'
      and not exists (select 1 from public.subscriptions s where s.condominium_id = c.id))
    as customer_sin_suscripcion;

\echo ''
\echo '=== 2. How the CUSTOMER placements landed ==='
select
  t.plan_code,
  count(*) as condominios,
  min(res.active_units) as unidades_min,
  max(res.active_units) as unidades_max,
  sum(t.contracted_period_amount) as mrr_nominal_usd
from public.subscriptions s
join public.condominiums c on c.id = s.condominium_id
join public.organizations o on o.id = c.organization_id and o.account_type = 'customer'
join public.subscription_terms t on t.subscription_id = s.id
  and t.effective_from <= current_date
  and (t.effective_to is null or t.effective_to > current_date)
cross join lateral (
  select ((public.resolve_entitlements(s.condominium_id)) ->> 'active_units')::int as active_units
) res
group by t.plan_code
order by min(res.active_units);

\echo ''
\echo '=== 3. Any CUSTOMER over their limit? ==='
select
  s.condominium_id,
  (public.resolve_entitlements(s.condominium_id)) ->> 'plan_code' as plan,
  (public.resolve_entitlements(s.condominium_id)) ->> 'active_units' as unidades,
  (public.resolve_entitlements(s.condominium_id)) ->> 'unit_limit' as limite
from public.subscriptions s
join public.condominiums c on c.id = s.condominium_id
join public.organizations o on o.id = c.organization_id and o.account_type = 'customer'
where not ((public.resolve_entitlements(s.condominium_id)) ->> 'within_limit')::boolean;

\echo ''
\echo '=== 4. Which CUSTOMERS are close to their ceiling? ==='
select
  s.condominium_id,
  c.name,
  (res.payload ->> 'plan_code') as plan,
  (res.payload ->> 'active_units')::int as unidades,
  (res.payload ->> 'unit_limit')::int as limite,
  (res.payload ->> 'unit_limit')::int - (res.payload ->> 'active_units')::int as margen
from public.subscriptions s
join public.condominiums c on c.id = s.condominium_id
join public.organizations o on o.id = c.organization_id and o.account_type = 'customer'
cross join lateral (select public.resolve_entitlements(s.condominium_id) as payload) res
where (res.payload ->> 'unlimited_units')::boolean is not true
  and (res.payload ->> 'unit_limit')::int - (res.payload ->> 'active_units')::int <= 5
order by margen;

\echo ''
\echo '=== 5. CUSTOMER commercial status ==='
select
  s.commercial_status,
  t.origin,
  count(*) as filas
from public.subscriptions s
join public.condominiums c on c.id = s.condominium_id
join public.organizations o on o.id = c.organization_id and o.account_type = 'customer'
join public.subscription_terms t on t.subscription_id = s.id
group by s.commercial_status, t.origin
order by 1, 2;

\echo ''
\echo '=== 6. CUSTOMER terms that need a human decision ==='
select
  t.id,
  t.plan_code,
  t.origin,
  t.contracted_period_amount,
  t.catalog_reference_amount,
  t.authorized_by
from public.subscription_terms t
join public.subscriptions s on s.id = t.subscription_id
join public.condominiums c on c.id = s.condominium_id
join public.organizations o on o.id = c.organization_id and o.account_type = 'customer'
where t.contracted_period_amount <> t.catalog_reference_amount
order by t.created_at;

\echo ''
\echo '=== 7. Any CUSTOMER subscription with no term covering today ==='
select
  s.condominium_id,
  s.status,
  (public.resolve_entitlements(s.condominium_id)) ->> 'has_term' as tiene_termino
from public.subscriptions s
join public.condominiums c on c.id = s.condominium_id
join public.organizations o on o.id = c.organization_id and o.account_type = 'customer'
where (public.resolve_entitlements(s.condominium_id)) ->> 'has_term' = 'false';

\echo ''
\echo '=== 8. NON-CUSTOMER subscriptions (MUST BE ZERO) ==='
select count(*) as noncustomer_subscriptions
from public.subscriptions s
join public.condominiums c on c.id = s.condominium_id
join public.organizations o on o.id = c.organization_id
where o.account_type <> 'customer';

rollback;
