begin;
select plan(14);

-- The migration that places existing condominiums runs once, at deploy time, so it cannot be
-- re-executed here. What it can be is re-derived: this asserts the placement rule itself against
-- every boundary, using the same query the migration uses.

create or replace function pg_temp.plan_for(active_units integer) returns text
language sql stable as $$
  select p.code
  from public.plans p
  where p.default_unit_limit >= active_units
  order by p.default_unit_limit
  limit 1;
$$;

-- The boundaries you asked for, each one the first unit of its band.
select is(pg_temp.plan_for(0),   'esencial',   'a condominium with no units goes to Esencial, decided rather than defaulted');
select is(pg_temp.plan_for(1),   'esencial',   'one unit is Esencial');
select is(pg_temp.plan_for(30),  'esencial',   '30 fills Esencial exactly');
select is(pg_temp.plan_for(31),  'comunidad',  '31 crosses into Comunidad');
select is(pg_temp.plan_for(80),  'comunidad',  '80 fills Comunidad exactly');
select is(pg_temp.plan_for(81),  'pro',        '81 crosses into Pro');
select is(pg_temp.plan_for(150), 'pro',        '150 fills Pro exactly');
select is(pg_temp.plan_for(151), 'plus',       '151 crosses into Plus');
select is(pg_temp.plan_for(300), 'plus',       '300 fills Plus exactly');
select is(pg_temp.plan_for(301), 'enterprise', '301 crosses into Enterprise');
select is(pg_temp.plan_for(500), 'enterprise', '500 fills Enterprise exactly');

-- Above the largest plan there is no automatic answer, and that is correct: a condominium of that
-- size needs a contracted limit somebody agreed to, not a guess. The migration raises instead of
-- silently placing such a tenant in violation.
select is(pg_temp.plan_for(501), null, 'beyond the largest plan the rule refuses to choose');

-- The property the whole migration exists to guarantee, asserted over every condominium present.
select is(
  (select count(*) from public.subscriptions s
   join public.condominiums c on c.id = s.condominium_id
   where not ((public.resolve_entitlements(c.id)) ->> 'within_limit')::boolean),
  0::bigint,
  'no migrated condominium sits above its limit'
);

-- A placement is not a contract. Six months from now a `pro` row must not read as a price the
-- customer accepted, and these two markers are what keep that distinction legible.
select is(
  (select count(*) from public.subscriptions s
   join public.subscription_terms t on t.subscription_id = s.id
   where t.origin = 'grandfathered' and s.commercial_status <> 'not_yet_confirmed'),
  0::bigint,
  'every grandfathered placement is still marked as unconfirmed commercially'
);

select * from finish();
rollback;
