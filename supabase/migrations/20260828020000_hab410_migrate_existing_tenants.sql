-- HAB-410, part three: give every condominium that already exists something to resolve to.
--
-- The rule that must not break: nobody wakes up over their limit. Each condominium lands on the
-- smallest plan whose ceiling covers the units it already has, never a smaller one. Placing a
-- 95-unit condominium on Comunidad would put it in violation from the first second, without
-- anyone having done anything.
--
-- A condominium with no units goes to Esencial. That is a decision, not a fallback: an empty
-- condominium is almost always one created moments ago whose structure has not been loaded yet,
-- and charging it for capacity it has not used would be backwards.
--
-- Every row here is `not_yet_confirmed` and `grandfathered`. The placement makes the resolver
-- answerable; it is not a price anybody agreed to. Six months from now a `pro` row must not be
-- mistaken for an accepted contract, and those two markers are what keep that readable.

with sized as (
  select
    c.id as condominium_id,
    (
      select count(*)
      from public.units u
      where u.condominium_id = c.id and u.status = 'active'
    ) as active_units
  from public.condominiums c
  where not exists (
    select 1 from public.subscriptions s where s.condominium_id = c.id
  )
), placed as (
  select
    sized.condominium_id,
    sized.active_units,
    (
      select p.code
      from public.plans p
      where p.default_unit_limit >= sized.active_units
      order by p.default_unit_limit
      limit 1
    ) as plan_code
  from sized
), created as (
  insert into public.subscriptions (condominium_id, status, commercial_status)
  select placed.condominium_id, 'active', 'not_yet_confirmed'
  from placed
  returning id, condominium_id
), termed as (
  insert into public.subscription_terms (
    subscription_id, plan_code, contracted_period_amount, currency, billing_period,
    origin, catalog_reference_amount, effective_from, note
  )
  select
    created.id,
    placed.plan_code,
    plans.catalog_monthly_usd,
    'USD',
    'monthly',
    'grandfathered',
    plans.catalog_monthly_usd,
    current_date,
    'Colocado por la migración HAB-410 según ' || placed.active_units || ' unidades activas. No refleja un precio aceptado por el cliente.'
  from created
  join placed on placed.condominium_id = created.condominium_id
  join public.plans on plans.code = placed.plan_code
  returning subscription_id
)
insert into public.subscription_events (
  subscription_id, condominium_id, event_type, to_status, to_plan, reason, payload
)
select
  created.id,
  created.condominium_id,
  'migrated',
  'active',
  placed.plan_code,
  'HAB-410: fundación comercial aplicada a un condominio preexistente',
  jsonb_build_object(
    'active_units', placed.active_units,
    'commercial_status', 'not_yet_confirmed'
  )
from created
join placed on placed.condominium_id = created.condominium_id;

-- The condition the whole migration exists to satisfy. If any condominium is larger than the
-- largest plan it lands on Enterprise, whose contracted limit a human then has to set -- and that
-- is a conversation, not something to guess. Fail loudly here rather than quietly ship a tenant
-- that enforcement would block on the day it is switched on.
do $$
declare
  offending integer;
begin
  select count(*) into offending
  from public.subscriptions s
  join public.condominiums c on c.id = s.condominium_id
  where not ((public.resolve_entitlements(c.id)) ->> 'within_limit')::boolean;

  if offending > 0 then
    raise exception
      'HAB-410 migration would leave % condominium(s) above their unit limit; set an explicit contracted_unit_limit for them before continuing',
      offending;
  end if;
end;
$$;
