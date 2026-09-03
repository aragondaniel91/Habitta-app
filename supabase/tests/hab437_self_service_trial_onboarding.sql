begin;
select plan(26);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
('43700000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','esencial@hab437.test','x',now(),now()),
('43700000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','comunidad@hab437.test','x',now(),now()),
('43700000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pro@hab437.test','x',now(),now()),
('43700000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','limit@hab437.test','x',now(),now()),
('43700000-0000-4000-8000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','existing@hab437.test','x',now(),now());

insert into public.organizations(id,name,created_by,account_type) values
('43710000-0000-4000-8000-000000000005','Existing HAB437','43700000-0000-4000-8000-000000000005','customer');
insert into public.organization_memberships(organization_id,user_id,role) values
('43710000-0000-4000-8000-000000000005','43700000-0000-4000-8000-000000000005','organization_owner');

select has_function(
  'public',
  'create_self_service_trial_workspace_v1',
  array[
    'text','text','text','text','text','text','text','text','condominium_property_topology',
    'text','text','uuid','text','text','text','text','text','text','text','text','text','integer','integer','text'
  ],
  'self-service workspace/trial RPC exists'
);
select ok(
  not has_function_privilege('anon','public.create_self_service_trial_workspace_v1(text,text,text,text,text,text,text,text,condominium_property_topology,text,text,uuid,text,text,text,text,text,text,text,text,text,integer,integer,text)','execute'),
  'anon cannot invoke self-service provisioning'
);
select ok(
  has_function_privilege('authenticated','public.create_self_service_trial_workspace_v1(text,text,text,text,text,text,text,text,condominium_property_topology,text,text,uuid,text,text,text,text,text,text,text,text,text,integer,integer,text)','execute'),
  'authenticated users can invoke the narrow self-service RPC'
);

-- Invoke the public contract as the tenant actor. Direct inspection of protected commercial tables
-- below intentionally returns to the trusted test role instead of broadening tenant table grants.
set local role authenticated;
select set_config('request.jwt.claim.sub','43700000-0000-4000-8000-000000000001',true);
create temporary table hab437_esencial as
select public.create_self_service_trial_workspace_v1(
  p_organization_name := 'Junta HAB437 Esencial',
  p_organization_type := 'independent',
  p_condominium_name := 'Residencias HAB437 Esencial',
  p_country_code := 'VE',
  p_address_line1 := 'Av. Principal 1',
  p_city := 'Caracas',
  p_timezone := 'America/Caracas',
  p_primary_currency_code := 'VES',
  p_property_topology := 'house_community',
  p_plan_code := 'esencial',
  p_billing_period := 'monthly',
  p_idempotency_key := '43770000-0000-4000-8000-000000000001',
  p_secondary_currency_code := 'USD',
  p_declared_unit_count := 20
) as result;

select is((select result #>> '{trial,plan_code}' from hab437_esencial),'esencial','Esencial self-service plan is accepted');
select is((select result #>> '{trial,billing_period}' from hab437_esencial),'monthly','monthly intent is retained');
select is((select (result #>> '{trial,contracted_period_amount}')::numeric from hab437_esencial),29.00::numeric,'Esencial monthly catalogue amount is contracted');
select is((select (result #>> '{trial,auto_bill_enabled}')::boolean from hab437_esencial),false,'trial never enables automatic billing');

reset role;
select is(
  (
    select extract(epoch from (s.trial_ends_at - s.trial_starts_at))::bigint
    from public.subscriptions s
    where s.id = (select (result #>> '{trial,subscription_id}')::uuid from hab437_esencial)
  ),
  2592000::bigint,
  'trial window is exactly 30 days'
);
select is(
  (
    select o.account_type::text
    from public.organizations o
    where o.id = (select (result #>> '{organization,id}')::uuid from hab437_esencial)
  ),
  'customer',
  'self-service creates a billable customer organization'
);
select is(
  (
    select st.contracted_unit_limit
    from public.subscription_terms st
    where st.subscription_id = (select (result #>> '{trial,subscription_id}')::uuid from hab437_esencial)
  ),
  30,
  'trial terms snapshot the authoritative Esencial unit limit'
);
select ok(
  (
    select s.billing_consent_at is null and s.billing_method_ready_at is null and not s.auto_bill_enabled
    from public.subscriptions s
    where s.id = (select (result #>> '{trial,subscription_id}')::uuid from hab437_esencial)
  ),
  'billing consent and payment setup remain explicitly incomplete'
);
select is(
  (
    select count(*)
    from public.payments p
    where p.condominium_id = (select (result #>> '{condominium,id}')::uuid from hab437_esencial)
  ),
  0::bigint,
  'SaaS trial provisioning creates no resident payment rows'
);
select is(
  (
    select count(*)
    from public.receivable_ledger_entries rle
    where rle.condominium_id = (select (result #>> '{condominium,id}')::uuid from hab437_esencial)
  ),
  0::bigint,
  'SaaS trial provisioning creates no resident ledger entries'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','43700000-0000-4000-8000-000000000001',true);
create temporary table hab437_esencial_retry as
select public.create_self_service_trial_workspace_v1(
  p_organization_name := 'Junta HAB437 Esencial',
  p_organization_type := 'independent',
  p_condominium_name := 'Residencias HAB437 Esencial',
  p_country_code := 'VE',
  p_address_line1 := 'Av. Principal 1',
  p_city := 'Caracas',
  p_timezone := 'America/Caracas',
  p_primary_currency_code := 'VES',
  p_property_topology := 'house_community',
  p_plan_code := 'esencial',
  p_billing_period := 'monthly',
  p_idempotency_key := '43770000-0000-4000-8000-000000000001',
  p_secondary_currency_code := 'USD',
  p_declared_unit_count := 20
) as result;

select is(
  (select result #>> '{organization,id}' from hab437_esencial_retry),
  (select result #>> '{organization,id}' from hab437_esencial),
  'same idempotency key returns the original organization'
);
select is(
  (select result #>> '{trial,subscription_id}' from hab437_esencial_retry),
  (select result #>> '{trial,subscription_id}' from hab437_esencial),
  'same idempotency key returns the original subscription'
);

reset role;
select is(
  (select count(*) from public.organization_memberships where user_id='43700000-0000-4000-8000-000000000001'),
  1::bigint,
  'retry does not duplicate organization membership/workspace'
);
select is(
  (select count(*) from public.subscriptions where condominium_id=(select (result #>> '{condominium,id}')::uuid from hab437_esencial)),
  1::bigint,
  'retry does not duplicate subscription'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','43700000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$select public.create_self_service_trial_workspace_v1(
    p_organization_name := 'Junta HAB437 Esencial', p_organization_type := 'independent',
    p_condominium_name := 'Residencias HAB437 Esencial', p_country_code := 'VE',
    p_address_line1 := 'Av. Principal 1', p_city := 'Caracas', p_timezone := 'America/Caracas',
    p_primary_currency_code := 'VES', p_property_topology := 'house_community',
    p_plan_code := 'comunidad', p_billing_period := 'monthly',
    p_idempotency_key := '43770000-0000-4000-8000-000000000001',
    p_secondary_currency_code := 'USD', p_declared_unit_count := 20
  )$$,
  '22023','idempotency key reused with different onboarding request',
  'same idempotency key cannot be reused to tamper with plan intent'
);

select set_config('request.jwt.claim.sub','43700000-0000-4000-8000-000000000002',true);
create temporary table hab437_comunidad as
select public.create_self_service_trial_workspace_v1(
  p_organization_name := 'Administradora HAB437 Comunidad',
  p_organization_type := 'management_company',
  p_condominium_name := 'Conjunto HAB437 Comunidad',
  p_country_code := 'VE',
  p_address_line1 := 'Av. Principal 2',
  p_city := 'Valencia',
  p_timezone := 'America/Caracas',
  p_primary_currency_code := 'USD',
  p_property_topology := 'house_community',
  p_plan_code := 'comunidad',
  p_billing_period := 'annual',
  p_idempotency_key := '43770000-0000-4000-8000-000000000002',
  p_declared_unit_count := 70
) as result;
select is((select result #>> '{trial,plan_code}' from hab437_comunidad),'comunidad','Comunidad self-service plan is accepted');
select is((select (result #>> '{trial,contracted_period_amount}')::numeric from hab437_comunidad),490.00::numeric,'Comunidad annual catalogue amount is contracted');

reset role;
select is(
  (
    select st.authorized_by
    from public.subscription_terms st
    where st.subscription_id=(select (result #>> '{trial,subscription_id}')::uuid from hab437_comunidad)
  ),
  '43700000-0000-4000-8000-000000000002'::uuid,
  'commercial term records the self-service actor'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','43700000-0000-4000-8000-000000000003',true);
select throws_ok(
  $$select public.create_self_service_trial_workspace_v1(
    p_organization_name := 'HAB437 Pro', p_organization_type := 'independent',
    p_condominium_name := 'HAB437 Pro Condo', p_country_code := 'VE',
    p_address_line1 := 'Av. Pro', p_city := 'Caracas', p_timezone := 'America/Caracas',
    p_primary_currency_code := 'USD', p_property_topology := 'house_community',
    p_plan_code := 'pro', p_billing_period := 'monthly',
    p_idempotency_key := '43770000-0000-4000-8000-000000000003', p_declared_unit_count := 20
  )$$,
  '23514','selected plan requires guided onboarding',
  'Pro cannot be provisioned by the self-service RPC'
);

reset role;
select is((select count(*) from public.organization_memberships where user_id='43700000-0000-4000-8000-000000000003'),0::bigint,'rejected Pro request leaves no partial workspace');

set local role authenticated;
select set_config('request.jwt.claim.sub','43700000-0000-4000-8000-000000000004',true);
select throws_ok(
  $$select public.create_self_service_trial_workspace_v1(
    p_organization_name := 'HAB437 Limit', p_organization_type := 'independent',
    p_condominium_name := 'HAB437 Limit Condo', p_country_code := 'VE',
    p_address_line1 := 'Av. Limit', p_city := 'Caracas', p_timezone := 'America/Caracas',
    p_primary_currency_code := 'USD', p_property_topology := 'house_community',
    p_plan_code := 'esencial', p_billing_period := 'monthly',
    p_idempotency_key := '43770000-0000-4000-8000-000000000004', p_declared_unit_count := 31
  )$$,
  '23514','selected plan unit limit exceeded',
  'self-service cannot knowingly provision a plan below the declared unit count'
);

reset role;
select is((select count(*) from public.organization_memberships where user_id='43700000-0000-4000-8000-000000000004'),0::bigint,'unit-limit rejection is transactional with no partial workspace');

set local role authenticated;
select set_config('request.jwt.claim.sub','43700000-0000-4000-8000-000000000005',true);
select throws_ok(
  $$select public.create_self_service_trial_workspace_v1(
    p_organization_name := 'Second Workspace', p_organization_type := 'independent',
    p_condominium_name := 'Second Condo', p_country_code := 'VE',
    p_address_line1 := 'Av. Existing', p_city := 'Caracas', p_timezone := 'America/Caracas',
    p_primary_currency_code := 'USD', p_property_topology := 'house_community',
    p_plan_code := 'esencial', p_billing_period := 'monthly',
    p_idempotency_key := '43770000-0000-4000-8000-000000000005', p_declared_unit_count := 10
  )$$,
  '23505','self-service onboarding is only available for the first workspace',
  'existing organization owners cannot use the first-workspace self-service path again'
);

reset role;
select * from finish();
rollback;
