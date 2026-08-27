begin;
select plan(18);

-- The HAB-410 tenant migration ran green locally and was refused by production on its first real
-- row. It inserted nothing here because this database has no condominiums, and the test meant to
-- cover it only re-derived the placement rule with a temporary function -- it never executed the
-- insert. So this file builds real condominiums and runs the migration's own statement on them.

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
  ('41400000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@hab411.test','x',now(),now());
insert into public.organizations(id,name,created_by) values
  ('41410000-0000-4000-8000-00000000000a','Org M','41400000-0000-0000-0000-00000000000a');

-- Four condominiums: one empty, and one on each side of the first plan boundary.
insert into public.condominiums(id,organization_id,name,created_by) values
  ('41420000-0000-4000-8000-000000000001','41410000-0000-4000-8000-00000000000a','Vacio','41400000-0000-0000-0000-00000000000a'),
  ('41420000-0000-4000-8000-000000000002','41410000-0000-4000-8000-00000000000a','Cuatro','41400000-0000-0000-0000-00000000000a'),
  ('41420000-0000-4000-8000-000000000003','41410000-0000-4000-8000-00000000000a','Justo 30','41400000-0000-0000-0000-00000000000a'),
  ('41420000-0000-4000-8000-000000000004','41410000-0000-4000-8000-00000000000a','Treinta y uno','41400000-0000-0000-0000-00000000000a');

insert into public.units(condominium_id, code, type, status, created_by)
select '41420000-0000-4000-8000-000000000002', 'A' || g, 'apartment', 'active', '41400000-0000-0000-0000-00000000000a'
from generate_series(1,4) g;
insert into public.units(condominium_id, code, type, status, created_by)
select '41420000-0000-4000-8000-000000000003', 'B' || g, 'apartment', 'active', '41400000-0000-0000-0000-00000000000a'
from generate_series(1,30) g;
insert into public.units(condominium_id, code, type, status, created_by)
select '41420000-0000-4000-8000-000000000004', 'C' || g, 'apartment', 'active', '41400000-0000-0000-0000-00000000000a'
from generate_series(1,31) g;
-- Retired units must not count: a condominium does not pay for capacity it stopped using.
insert into public.units(condominium_id, code, type, status, created_by)
select '41420000-0000-4000-8000-000000000003', 'X' || g, 'apartment', 'inactive', '41400000-0000-0000-0000-00000000000a'
from generate_series(1,60) g;

-- ------------------------------------------------------------------ the migration's own statement

-- The same statement 20260828020000 executes. If this drifts from that file it stops being
-- evidence about the migration, which is exactly the failure this test exists to prevent.
select lives_ok($mig$
  with sized as (
    select c.id as condominium_id,
      (select count(*) from public.units u where u.condominium_id = c.id and u.status = 'active') as active_units
    from public.condominiums c
    where not exists (select 1 from public.subscriptions s where s.condominium_id = c.id)
  ), placed as (
    select sized.condominium_id, sized.active_units,
      (select p.code from public.plans p where p.default_unit_limit >= sized.active_units
       order by p.default_unit_limit limit 1) as plan_code
    from sized
  ), created as (
    insert into public.subscriptions (condominium_id, status, commercial_status)
    select placed.condominium_id, 'active', 'not_yet_confirmed' from placed
    returning id, condominium_id
  ), termed as (
    insert into public.subscription_terms (
      subscription_id, plan_code, contracted_period_amount, currency, billing_period,
      origin, catalog_reference_amount, effective_from, note)
    select created.id, placed.plan_code, plans.catalog_monthly_usd, 'USD', 'monthly',
      'grandfathered', plans.catalog_monthly_usd, current_date, 'placed by HAB-410'
    from created
    join placed on placed.condominium_id = created.condominium_id
    join public.plans on plans.code = placed.plan_code
    returning subscription_id
  )
  insert into public.subscription_events (subscription_id, condominium_id, event_type, to_status, to_plan, reason, payload)
  select created.id, created.condominium_id, 'migrated', 'active', placed.plan_code, 'HAB-410',
    jsonb_build_object('active_units', placed.active_units)
  from created join placed on placed.condominium_id = created.condominium_id
$mig$, 'the tenant migration actually inserts when condominiums exist');

-- ------------------------------------------------------------------ what it produced

create or replace function pg_temp.placed_plan(condo uuid) returns text language sql stable as $fn$
  select t.plan_code from public.subscription_terms t
  join public.subscriptions s on s.id = t.subscription_id
  where s.condominium_id = condo;
$fn$;

select is(pg_temp.placed_plan('41420000-0000-4000-8000-000000000001'), 'esencial', 'an empty condominium lands on Esencial');
select is(pg_temp.placed_plan('41420000-0000-4000-8000-000000000002'), 'esencial', 'four units land on Esencial');
select is(pg_temp.placed_plan('41420000-0000-4000-8000-000000000003'), 'esencial', '30 units fill Esencial exactly');
select is(pg_temp.placed_plan('41420000-0000-4000-8000-000000000004'), 'comunidad', '31 units cross into Comunidad');

select is(
  (public.resolve_entitlements('41420000-0000-4000-8000-000000000003')) ->> 'active_units',
  '30',
  'retired units do not count toward the limit'
);

select is(
  (select count(*) from public.subscription_terms t
   join public.subscriptions s on s.id = t.subscription_id
   join public.condominiums c on c.id = s.condominium_id
   where c.organization_id = '41410000-0000-4000-8000-00000000000a'
     and t.contracted_period_amount <> t.catalog_reference_amount),
  0::bigint,
  'every placement is written at exactly the list price, never a discount'
);

select is(
  (select count(*) from public.subscription_events e
   join public.condominiums c on c.id = e.condominium_id
   where c.organization_id = '41410000-0000-4000-8000-00000000000a' and e.event_type = 'migrated'),
  4::bigint,
  'each placement leaves an event behind'
);

-- The property the migration's closing guard enforces, now over rows it really wrote.
select is(
  (select count(*) from public.subscriptions s
   join public.condominiums c on c.id = s.condominium_id
   where c.organization_id = '41410000-0000-4000-8000-00000000000a'
     and not ((public.resolve_entitlements(c.id)) ->> 'within_limit')::boolean),
  0::bigint,
  'no migrated condominium sits above its limit'
);

select is(
  (select count(*) from public.subscriptions s
   join public.subscription_terms t on t.subscription_id = s.id
   where t.origin = 'grandfathered' and s.commercial_status <> 'not_yet_confirmed'),
  0::bigint,
  'a placement is never mistaken for a price the customer confirmed'
);

-- Production refused this migration once, so it has to be safe to run again. The `not exists`
-- guard is what makes that true, and it is worth asserting rather than assuming.
select lives_ok(
  $$insert into public.subscriptions (condominium_id, status, commercial_status)
    select c.id, 'active', 'not_yet_confirmed' from public.condominiums c
    where not exists (select 1 from public.subscriptions s where s.condominium_id = c.id)$$,
  're-running the placement insert is allowed'
);
select is(
  (select count(*) from public.subscriptions s
   join public.condominiums c on c.id = s.condominium_id
   where c.organization_id = '41410000-0000-4000-8000-00000000000a'),
  4::bigint,
  're-running it creates no duplicate subscription'
);

-- ------------------------------------------------------------------ the constraint HAB-411 rewrote

-- What production refused: a system placement has no human author, and must not need one.
select lives_ok(
  $$insert into public.subscription_terms(subscription_id,plan_code,contracted_period_amount,billing_period,origin,catalog_reference_amount,effective_from,effective_to)
    select s.id,'esencial',29.00,'monthly','grandfathered',29.00,current_date - 400,current_date - 300
    from public.subscriptions s where s.condominium_id='41420000-0000-4000-8000-000000000001'$$,
  'a grandfathered term at the list price needs no author'
);

-- What it must still refuse -- including the case the original constraint let straight through: a
-- term labelled `catalog` while charging something other than the catalogue price.
select throws_ok(
  $$insert into public.subscription_terms(subscription_id,plan_code,contracted_period_amount,billing_period,origin,catalog_reference_amount,effective_from,effective_to)
    select s.id,'esencial',15.00,'monthly','catalog',29.00,current_date - 800,current_date - 700
    from public.subscriptions s where s.condominium_id='41420000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'a term calling itself catalog while charging less still needs an author'
);
select throws_ok(
  $$insert into public.subscription_terms(subscription_id,plan_code,contracted_period_amount,billing_period,origin,catalog_reference_amount,effective_from,effective_to)
    select s.id,'esencial',15.00,'monthly','grandfathered',29.00,current_date - 800,current_date - 700
    from public.subscriptions s where s.condominium_id='41420000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'a discount cannot hide behind the grandfathered origin either'
);
select throws_ok(
  $$insert into public.subscription_terms(subscription_id,plan_code,contracted_period_amount,billing_period,origin,catalog_reference_amount,effective_from,effective_to)
    select s.id,'esencial',29.00,'monthly','negotiated',29.00,current_date - 800,current_date - 700
    from public.subscriptions s where s.condominium_id='41420000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'a negotiated term needs an author even when it lands on the list price'
);
select lives_ok(
  $$insert into public.subscription_terms(subscription_id,plan_code,contracted_period_amount,billing_period,origin,catalog_reference_amount,authorized_by,effective_from,effective_to)
    select s.id,'esencial',15.00,'monthly','negotiated',29.00,'41400000-0000-0000-0000-00000000000a',current_date - 800,current_date - 700
    from public.subscriptions s where s.condominium_id='41420000-0000-4000-8000-000000000001'$$,
  'a discount with a named author is accepted'
);

-- A placement is a commercial fact and must not quietly become a confirmed one.
select is(
  (public.resolve_entitlements('41420000-0000-4000-8000-000000000004')) ->> 'commercial_status',
  'not_yet_confirmed',
  'the resolver reports the placement as commercially unconfirmed'
);

select * from finish();
rollback;
