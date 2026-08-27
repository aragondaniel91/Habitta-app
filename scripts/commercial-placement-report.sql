-- HAB-412: what the HAB-410 migration actually did to real tenants.
--
-- Run this by hand against production, read it, and only then design enforcement. Turning
-- enforcement on over placements nobody reviewed is how a paying customer gets locked out of their
-- own condominium by a row a migration wrote at 3am.
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
\echo '=== 1. Did every condominium get placed? ==='
-- A condominium with no subscription resolves closed, which means enforcement would block it on
-- day one. This must be zero before enforcement ships.
select
  (select count(*) from public.condominiums) as condominiums,
  (select count(*) from public.subscriptions) as subscriptions,
  (select count(*) from public.condominiums c
   where not exists (select 1 from public.subscriptions s where s.condominium_id = c.id))
    as sin_suscripcion;

\echo ''
\echo '=== 2. How the placements landed ==='
-- The shape of the customer base as the migration understood it. If this looks nothing like what
-- you would have sold these customers, the placement rule is wrong, not the customers.
select
  t.plan_code,
  count(*) as condominios,
  min(res.active_units) as unidades_min,
  max(res.active_units) as unidades_max,
  sum(t.contracted_period_amount) as mrr_nominal_usd
from public.subscriptions s
join public.subscription_terms t on t.subscription_id = s.id
  and t.effective_from <= current_date
  and (t.effective_to is null or t.effective_to > current_date)
cross join lateral (
  select ((public.resolve_entitlements(s.condominium_id)) ->> 'active_units')::int as active_units
) res
group by t.plan_code
order by min(res.active_units);

\echo ''
\echo '=== 3. Anybody over their limit? ==='
-- The migration refuses to finish if this is non-empty, so it should be empty. Checked anyway,
-- because "should be" is not evidence and units can be added after a placement.
select
  s.condominium_id,
  (public.resolve_entitlements(s.condominium_id)) ->> 'plan_code' as plan,
  (public.resolve_entitlements(s.condominium_id)) ->> 'active_units' as unidades,
  (public.resolve_entitlements(s.condominium_id)) ->> 'unit_limit' as limite
from public.subscriptions s
where not ((public.resolve_entitlements(s.condominium_id)) ->> 'within_limit')::boolean;

\echo ''
\echo '=== 4. Who is close to their ceiling? ==='
-- These are the condominiums where enforcement would bite first. Each one is a conversation to
-- have before the switch is thrown, not after.
select
  s.condominium_id,
  c.name,
  (res.payload ->> 'plan_code') as plan,
  (res.payload ->> 'active_units')::int as unidades,
  (res.payload ->> 'unit_limit')::int as limite,
  (res.payload ->> 'unit_limit')::int - (res.payload ->> 'active_units')::int as margen
from public.subscriptions s
join public.condominiums c on c.id = s.condominium_id
cross join lateral (select public.resolve_entitlements(s.condominium_id) as payload) res
where (res.payload ->> 'unlimited_units')::boolean is not true
  and (res.payload ->> 'unit_limit')::int - (res.payload ->> 'active_units')::int <= 5
order by margen;

\echo ''
\echo '=== 5. Nothing has been sold yet ==='
-- Every row the migration wrote is a placement, not an accepted price. If anything here reads
-- `confirmed` or an origin other than `grandfathered`, something wrote a contract that no customer
-- agreed to, and that is a defect to chase before enforcement.
select
  s.commercial_status,
  t.origin,
  count(*) as filas
from public.subscriptions s
join public.subscription_terms t on t.subscription_id = s.id
group by s.commercial_status, t.origin
order by 1, 2;

\echo ''
\echo '=== 6. Terms that need a human to have decided them ==='
-- Any term away from the list price must name its author. Should be empty today: the migration
-- writes only grandfathered rows at exactly the catalogue price.
select
  t.id,
  t.plan_code,
  t.origin,
  t.contracted_period_amount,
  t.catalog_reference_amount,
  t.authorized_by
from public.subscription_terms t
where t.contracted_period_amount <> t.catalog_reference_amount
order by t.created_at;

\echo ''
\echo '=== 7. Any subscription with no term covering today ==='
-- The fail-closed state. Empty today, and worth watching once renewals exist, because a tenant in
-- here resolves to no capabilities at all.
select
  s.condominium_id,
  s.status,
  (public.resolve_entitlements(s.condominium_id)) ->> 'has_term' as tiene_termino
from public.subscriptions s
where (public.resolve_entitlements(s.condominium_id)) ->> 'has_term' = 'false';

rollback;
