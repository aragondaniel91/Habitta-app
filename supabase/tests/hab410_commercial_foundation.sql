begin;
select plan(48);

-- ------------------------------------------------------------------ shape

select has_table('public', 'capabilities', 'the capability registry exists');
select has_table('public', 'plans', 'the plan catalogue exists');
select has_table('public', 'plan_capabilities', 'plans carry capabilities');
select has_table('public', 'subscriptions', 'subscriptions exist');
select has_table('public', 'subscription_terms', 'contracted terms exist');
select has_table('public', 'subscription_events', 'subscription events exist');
select has_function('public', 'resolve_entitlements', array['uuid'], 'the internal resolver exists');
select has_function('public', 'my_entitlements', array[]::text[], 'the tenant entry point exists');

select is(
  (select count(*) from public.plans),
  5::bigint,
  'the five plans are seeded'
);
select is(
  (select count(*) from public.plans where default_unit_limit is null),
  0::bigint,
  'no plan is unlimited by omission'
);
-- A capability referenced by a plan but absent from the registry is a foreign key violation.
select is(
  (select count(*) from public.plan_capabilities pc
   left join public.capabilities c on c.code = pc.capability
   where c.code is null),
  0::bigint,
  'every granted capability exists in the registry'
);
select is(
  (select count(*) from public.plan_capabilities where plan_code = 'esencial'
     and capability in ('finance.treasury', 'governance.voting')),
  0::bigint,
  'Esencial does not carry capabilities reserved for higher plans'
);
select ok(
  exists (select 1 from public.plan_capabilities
          where plan_code = 'comunidad' and capability = 'governance.assemblies'),
  'assemblies reach Comunidad, because the need does not scale with unit count'
);
select ok(
  not exists (select 1 from public.plan_capabilities
              where plan_code = 'comunidad' and capability = 'governance.voting'),
  'voting and quorum stay in Pro'
);
select ok(
  exists (select 1 from public.plan_capabilities
          where plan_code = 'comunidad' and capability = 'finance.late_fees'),
  'late fees reach Comunidad, because that module pays for the subscription'
);

-- ------------------------------------------------------------------ fixture

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
  ('41000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@hab410.test','x',now(),now()),
  ('41000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b@hab410.test','x',now(),now()),
  ('41000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-000000000000','authenticated','authenticated','c@hab410.test','x',now(),now());
insert into public.organizations(id,name,created_by) values
  ('41100000-0000-4000-8000-00000000000a','Org A','41000000-0000-0000-0000-00000000000a'),
  ('41100000-0000-4000-8000-00000000000b','Org B','41000000-0000-0000-0000-00000000000b');
insert into public.condominiums(id,organization_id,name,created_by) values
  ('41200000-0000-4000-8000-00000000000a','41100000-0000-4000-8000-00000000000a','Condo A','41000000-0000-0000-0000-00000000000a'),
  ('41200000-0000-4000-8000-00000000000b','41100000-0000-4000-8000-00000000000b','Condo B','41000000-0000-0000-0000-00000000000b');
insert into public.condominium_memberships(condominium_id,user_id,role) values
  ('41200000-0000-4000-8000-00000000000a','41000000-0000-0000-0000-00000000000a','condominium_admin'),
  ('41200000-0000-4000-8000-00000000000b','41000000-0000-0000-0000-00000000000b','condominium_admin');
insert into public.subscriptions(id,condominium_id,status) values
  ('41300000-0000-4000-8000-00000000000a','41200000-0000-4000-8000-00000000000a','active'),
  ('41300000-0000-4000-8000-00000000000b','41200000-0000-4000-8000-00000000000b','active');
insert into public.subscription_terms(subscription_id,plan_code,contracted_period_amount,billing_period,origin,catalog_reference_amount,effective_from) values
  ('41300000-0000-4000-8000-00000000000a','comunidad',49.00,'monthly','catalog',49.00,current_date - 30),
  ('41300000-0000-4000-8000-00000000000b','pro',79.00,'monthly','catalog',79.00,current_date - 30);

-- ------------------------------------------------------------------ terms: temporal integrity

-- The guarantee that does not rely on the code behaving itself.
select throws_ok(
  $$insert into public.subscription_terms(subscription_id,plan_code,contracted_period_amount,billing_period,origin,catalog_reference_amount,effective_from)
    values ('41300000-0000-4000-8000-00000000000a','pro',79.00,'monthly','catalog',79.00,current_date - 10)$$,
  '23P01',
  null,
  'the database refuses a term that overlaps an open one'
);
select lives_ok(
  $$update public.subscription_terms set effective_to = current_date
    where subscription_id = '41300000-0000-4000-8000-00000000000a'$$,
  'closing the open term is allowed'
);
select lives_ok(
  $$insert into public.subscription_terms(subscription_id,plan_code,contracted_period_amount,billing_period,origin,catalog_reference_amount,effective_from)
    values ('41300000-0000-4000-8000-00000000000a','pro',79.00,'monthly','catalog',79.00,current_date)$$,
  'consecutive terms are allowed'
);
select is(
  (select count(*) from public.subscription_terms
   where subscription_id = '41300000-0000-4000-8000-00000000000a'
     and effective_from <= current_date
     and (effective_to is null or effective_to > current_date)),
  1::bigint,
  'exactly one term is in force on any given day'
);

-- ------------------------------------------------------------------ terms: money semantics

select lives_ok(
  $$insert into public.subscription_terms(subscription_id,plan_code,contracted_period_amount,currency,billing_period,origin,catalog_reference_amount,authorized_by,effective_from,effective_to)
    values ('41300000-0000-4000-8000-00000000000b','comunidad',35.00,'USD','monthly','founders',49.00,'41000000-0000-0000-0000-00000000000a',current_date - 200, current_date - 100)$$,
  'a Founders term records the discount against the list price of the day'
);
select throws_ok(
  $$insert into public.subscription_terms(subscription_id,plan_code,contracted_period_amount,billing_period,origin,catalog_reference_amount,effective_from,effective_to)
    values ('41300000-0000-4000-8000-00000000000b','comunidad',35.00,'monthly','founders',49.00,current_date - 400, current_date - 300)$$,
  '23514',
  null,
  'a term that is not the list price requires an author'
);
select throws_ok(
  $$insert into public.subscription_terms(subscription_id,plan_code,contracted_period_amount,billing_period,origin,catalog_reference_amount,effective_from,effective_to)
    values ('41300000-0000-4000-8000-00000000000b','pro',79.00,'weekly','catalog',79.00,current_date - 400, current_date - 300)$$,
  '23514',
  null,
  'only monthly and annual periods exist'
);

-- Raising the catalogue must not touch a signed contract. This is the whole reason the two are
-- separate tables.
select lives_ok(
  $$update public.plans set catalog_monthly_usd = 59.00 where code = 'comunidad'$$,
  'the catalogue price can be raised'
);
select is(
  (select contracted_period_amount from public.subscription_terms
   where subscription_id = '41300000-0000-4000-8000-00000000000a'
     and plan_code = 'comunidad'),
  49.00::numeric,
  'a term signed at 49 still says 49 after the catalogue moves to 59'
);
select lives_ok(
  $$update public.plans set catalog_monthly_usd = 49.00 where code = 'comunidad'$$,
  'catalogue restored for the remaining assertions'
);

-- Monthly to annual is a change of term, not of plan, and the history survives it.
select lives_ok(
  $$update public.subscription_terms set effective_to = current_date + 1
    where subscription_id = '41300000-0000-4000-8000-00000000000b' and effective_to is null$$,
  'the monthly term is closed'
);
select lives_ok(
  $$insert into public.subscription_terms(subscription_id,plan_code,contracted_period_amount,billing_period,origin,catalog_reference_amount,effective_from)
    values ('41300000-0000-4000-8000-00000000000b','pro',790.00,'annual','catalog',790.00,current_date + 1)$$,
  'an annual term follows it'
);
select is(
  (select count(*) from public.subscription_terms where subscription_id = '41300000-0000-4000-8000-00000000000b'),
  3::bigint,
  'the monthly history is preserved, not overwritten'
);

-- ------------------------------------------------------------------ resolution

select is(
  (public.resolve_entitlements('41200000-0000-4000-8000-00000000000a')) ->> 'plan_code',
  'pro',
  'the resolver reports the plan of the term in force today'
);
select is(
  ((public.resolve_entitlements('41200000-0000-4000-8000-00000000000a')) ->> 'unit_limit')::integer,
  150,
  'the limit falls back to the plan ceiling when the contract sets none'
);
select is(
  ((public.resolve_entitlements('41200000-0000-4000-8000-00000000000a')) ->> 'may_operate')::boolean,
  true,
  'an active subscription may operate'
);

-- Unlimited is only ever explicit.
insert into public.condominiums(id,organization_id,name,created_by) values
  ('41200000-0000-4000-8000-00000000000c','41100000-0000-4000-8000-00000000000a','Condo C','41000000-0000-0000-0000-00000000000a');
insert into public.subscriptions(id,condominium_id,status) values
  ('41300000-0000-4000-8000-00000000000c','41200000-0000-4000-8000-00000000000c','active');
insert into public.subscription_terms(subscription_id,plan_code,contracted_period_amount,billing_period,origin,catalog_reference_amount,authorized_by,effective_from,contracted_unit_limit) values
  ('41300000-0000-4000-8000-00000000000c','enterprise',249.00,'monthly','negotiated',169.00,'41000000-0000-0000-0000-00000000000a',current_date,1000);
select is(
  ((public.resolve_entitlements('41200000-0000-4000-8000-00000000000c')) ->> 'unit_limit')::integer,
  1000,
  'a contracted limit overrides the plan ceiling'
);
select is(
  ((public.resolve_entitlements('41200000-0000-4000-8000-00000000000c')) ->> 'unlimited_units')::boolean,
  false,
  'Enterprise is not unlimited merely for being Enterprise'
);
select lives_ok(
  $$update public.subscription_terms set unlimited_units = true
    where subscription_id = '41300000-0000-4000-8000-00000000000c'$$,
  'unlimited can be granted explicitly'
);
select is(
  (public.resolve_entitlements('41200000-0000-4000-8000-00000000000c')) ->> 'unit_limit',
  null,
  'only then is there no ceiling'
);

-- A condominium with no subscription has contracted nothing, not everything.
insert into public.condominiums(id,organization_id,name,created_by) values
  ('41200000-0000-4000-8000-00000000000d','41100000-0000-4000-8000-00000000000a','Condo D','41000000-0000-0000-0000-00000000000a');
select is(
  ((public.resolve_entitlements('41200000-0000-4000-8000-00000000000d')) ->> 'found')::boolean,
  false,
  'an unsubscribed condominium resolves to nothing'
);
select is(
  ((public.resolve_entitlements('41200000-0000-4000-8000-00000000000d')) ->> 'may_operate')::boolean,
  false,
  'and may not operate: the resolver fails closed'
);

-- ------------------------------------------------------------------ security

select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'resolve_entitlements'
     and (has_function_privilege('anon', p.oid, 'EXECUTE')
       or has_function_privilege('authenticated', p.oid, 'EXECUTE'))),
  0::bigint,
  'the internal resolver is unreachable from both client roles'
);
select ok(
  (select has_function_privilege('authenticated', p.oid, 'EXECUTE')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'my_entitlements'),
  'the tenant entry point is reachable by an authenticated caller'
);
select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'my_entitlements' and p.pronargs > 0),
  0::bigint,
  'the tenant entry point accepts no identifier to tamper with'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','41000000-0000-0000-0000-00000000000a',true);

select throws_ok(
  $$select public.resolve_entitlements('41200000-0000-4000-8000-00000000000b')$$,
  '42501',
  'permission denied for function resolve_entitlements',
  'a user cannot ask the internal resolver about anybody'
);
select throws_ok(
  $$select count(*) from public.subscription_terms$$,
  '42501',
  'permission denied for table subscription_terms',
  'a user cannot read what other customers negotiated'
);
select is(
  (select jsonb_array_length(public.my_entitlements())),
  1,
  'a user receives exactly the condominiums they belong to, and no more'
);
select is(
  (select count(*) from jsonb_array_elements(public.my_entitlements()) e
   where e ->> 'condominium_id' = '41200000-0000-4000-8000-00000000000b'),
  0::bigint,
  'and never one from another organization'
);

select set_config('request.jwt.claim.sub','41000000-0000-0000-0000-00000000000c',true);
select is(
  (select jsonb_array_length(public.my_entitlements())),
  0,
  'a user with no membership receives nothing rather than an error'
);
reset role;

-- The other branch of the union: an organization owner reaches every condominium underneath it,
-- including the ones where they hold no condominium membership of their own.
insert into public.organization_memberships(organization_id,user_id,role)
values ('41100000-0000-4000-8000-00000000000a','41000000-0000-0000-0000-00000000000c','organization_owner');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','41000000-0000-0000-0000-00000000000c',true);
select is(
  (select jsonb_array_length(public.my_entitlements())),
  3,
  'an organization owner reaches every condominium of that organization'
);
select is(
  (select count(*) from jsonb_array_elements(public.my_entitlements()) e
   where e ->> 'condominium_id' = '41200000-0000-4000-8000-00000000000b'),
  0::bigint,
  'and still nothing from the other organization'
);
reset role;

-- Catalogue is public pricing; reading it leaks nothing about a customer.
set local role authenticated;
select set_config('request.jwt.claim.sub','41000000-0000-0000-0000-00000000000a',true);
select is(
  (select count(*) from public.plans),
  5::bigint,
  'any authenticated user may read the catalogue'
);
reset role;

select * from finish();
rollback;
