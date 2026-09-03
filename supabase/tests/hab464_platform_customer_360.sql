begin;
select plan(17);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
('00000000-0000-4000-8000-000000004641','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hab464-admin@test.local','x',now(),now()),
('00000000-0000-4000-8000-000000004642','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hab464-platform@test.local','x',now(),now());

insert into public.platform_admins(user_id) values
('00000000-0000-4000-8000-000000004642');

insert into public.organizations(id,name,created_by,account_type) values
('46400000-0000-4000-8000-000000000001','HAB464 Customer','00000000-0000-4000-8000-000000004641','customer'),
('46400000-0000-4000-8000-000000000002','HAB464 Demo','00000000-0000-4000-8000-000000004641','demo');

insert into public.condominiums(id,organization_id,name,created_by,created_at) values
('46410000-0000-4000-8000-000000000001','46400000-0000-4000-8000-000000000001','HAB464 Torre A','00000000-0000-4000-8000-000000004641',now() - interval '2 days'),
('46410000-0000-4000-8000-000000000002','46400000-0000-4000-8000-000000000001','HAB464 Torre B','00000000-0000-4000-8000-000000004641',now() - interval '1 day'),
('46410000-0000-4000-8000-000000000003','46400000-0000-4000-8000-000000000002','HAB464 Demo Condo','00000000-0000-4000-8000-000000004641',now());

insert into public.condominium_memberships(condominium_id,user_id,role) values
('46410000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000004641','condominium_admin'),
('46410000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000004642','board_member');

insert into public.units(id,condominium_id,code,type,created_by,status) values
('46420000-0000-4000-8000-000000000001','46410000-0000-4000-8000-000000000001','A-1','apartment','00000000-0000-4000-8000-000000004641','active'),
('46420000-0000-4000-8000-000000000002','46410000-0000-4000-8000-000000000001','A-2','apartment','00000000-0000-4000-8000-000000004641','active'),
('46420000-0000-4000-8000-000000000003','46410000-0000-4000-8000-000000000001','A-3','apartment','00000000-0000-4000-8000-000000004641','inactive'),
('46420000-0000-4000-8000-000000000004','46410000-0000-4000-8000-000000000002','B-1','apartment','00000000-0000-4000-8000-000000004641','active');

insert into public.subscriptions(
  id,condominium_id,status,commercial_status,current_period_end,auto_bill_enabled,
  billing_consent_at,billing_method_ready_at,created_at,updated_at
) values (
  '46430000-0000-4000-8000-000000000001','46410000-0000-4000-8000-000000000001',
  'active','confirmed',current_date + 30,false,null,null,now(),now()
);

insert into public.subscription_terms(
  id,subscription_id,plan_code,contracted_period_amount,currency,billing_period,
  contracted_unit_limit,unlimited_units,origin,catalog_reference_amount,authorized_by,
  effective_from,effective_to,note
) values (
  '46440000-0000-4000-8000-000000000001','46430000-0000-4000-8000-000000000001',
  'esencial',29.00,'USD','monthly',50,false,'catalog',29.00,
  '00000000-0000-4000-8000-000000004642',current_date - 10,null,'HAB464 contract'
);

insert into public.subscription_adjustments(
  id,subscription_id,offer_id,source,adjustment_kind,percentage_off,fixed_amount,currency,
  reference_period_amount,effective_period_amount,effective_from,effective_to,authorized_by,note
) values (
  '46450000-0000-4000-8000-000000000001','46430000-0000-4000-8000-000000000001',null,
  'gift','free',null,null,'USD',29.00,0.00,current_date - 1,current_date + 20,
  '00000000-0000-4000-8000-000000004642','Customer success courtesy'
);

insert into public.subscription_events(
  id,subscription_id,condominium_id,event_type,from_status,to_status,from_plan,to_plan,
  actor_user_id,reason,payload,created_at
) values (
  '46460000-0000-4000-8000-000000000001','46430000-0000-4000-8000-000000000001',
  '46410000-0000-4000-8000-000000000001','activated','trialing','active','esencial','esencial',
  '00000000-0000-4000-8000-000000004642','platform_manual_activation',
  jsonb_build_object('internal_provider_token','must_not_escape'),now()
);

select has_function('public','get_platform_customer_360',array['uuid'],'Customer 360 read RPC exists');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000004641',true);
select throws_ok(
  $$select public.get_platform_customer_360('46400000-0000-4000-8000-000000000001')$$,
  '42501','platform admin required',
  'condominium administrator cannot read Platform Admin Customer 360'
);

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000004642',true);
select lives_ok(
  $$select public.get_platform_customer_360('46400000-0000-4000-8000-000000000001')$$,
  'platform admin can read Customer 360'
);
select is(
  public.get_platform_customer_360('46400000-0000-4000-8000-000000000001') #>> '{organization,name}',
  'HAB464 Customer',
  'organization identity is returned'
);
select is(
  public.get_platform_customer_360('46400000-0000-4000-8000-000000000001') #>> '{organization,account_type}',
  'customer',
  'account type is explicit'
);
select is(
  (public.get_platform_customer_360('46400000-0000-4000-8000-000000000001') #>> '{organization,billable}')::boolean,
  true,
  'customer organization is billable'
);
select is(
  jsonb_array_length(public.get_platform_customer_360('46400000-0000-4000-8000-000000000001')->'condominiums'),
  2,
  'all condominiums for the organization are returned'
);
select is(
  (public.get_platform_customer_360('46400000-0000-4000-8000-000000000001') #>> '{condominiums,0,active_unit_count}')::integer,
  2,
  'usage exposes active-unit count only'
);
select is(
  (public.get_platform_customer_360('46400000-0000-4000-8000-000000000001') #>> '{condominiums,0,membership_count}')::integer,
  2,
  'usage exposes aggregate membership count only'
);
select is(
  public.get_platform_customer_360('46400000-0000-4000-8000-000000000001') #>> '{condominiums,0,terms,plan_code}',
  'esencial',
  'current authoritative plan is returned'
);
select is(
  (public.get_platform_customer_360('46400000-0000-4000-8000-000000000001') #>> '{condominiums,0,effective_period_amount}')::numeric,
  0.00::numeric,
  'current gifted period is reflected without rewriting the contract amount'
);
select is(
  public.get_platform_customer_360('46400000-0000-4000-8000-000000000001') #>> '{condominiums,0,current_adjustment,source}',
  'gift',
  'current adjustment source is explicit'
);
select is(
  (public.get_platform_customer_360('46400000-0000-4000-8000-000000000001') #>> '{condominiums,1,attention,missing_subscription}')::boolean,
  true,
  'customer condominium without subscription is an authoritative attention item'
);
select is(
  public.get_platform_customer_360('46400000-0000-4000-8000-000000000001') #>> '{commercial_history,0,actor_user_id}',
  '00000000-0000-4000-8000-000000004642',
  'commercial history preserves audit actor UUID'
);
select ok(
  public.get_platform_customer_360('46400000-0000-4000-8000-000000000001')::text
    not like '%internal_provider_token%'
  and public.get_platform_customer_360('46400000-0000-4000-8000-000000000001')::text
    not like '%email%'
  and public.get_platform_customer_360('46400000-0000-4000-8000-000000000001')::text
    not like '%phone%'
  and public.get_platform_customer_360('46400000-0000-4000-8000-000000000001')::text
    not like '%payer_name%'
  and public.get_platform_customer_360('46400000-0000-4000-8000-000000000001')::text
    not like '%receivable%'
  and public.get_platform_customer_360('46400000-0000-4000-8000-000000000001')::text
    not like '%treasury%',
  'read model excludes event payload secrets, resident PII and condominium accounting data'
);
select is(
  (public.get_platform_customer_360('46400000-0000-4000-8000-000000000002') #>> '{organization,billable}')::boolean,
  false,
  'demo organization remains explicitly nonbillable'
);
select is(
  (public.get_platform_customer_360('46400000-0000-4000-8000-000000000002') #>> '{condominiums,0,attention,missing_subscription}')::boolean,
  false,
  'demo condominium is not treated as missing paid subscription'
);

select * from finish();
rollback;
