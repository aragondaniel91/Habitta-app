begin;
select plan(10);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
values
  ('00000000-0000-0000-0000-000000004221','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hab422-owner@test.local','x',now(),now()),
  ('00000000-0000-0000-0000-000000004222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hab422-admin@test.local','x',now(),now());

insert into public.organizations(id,name,created_by,account_type) values
  ('42200000-0000-0000-0000-000000000001','HAB422 Customer','00000000-0000-0000-0000-000000004221','customer'),
  ('42200000-0000-0000-0000-000000000002','HAB422 Demo','00000000-0000-0000-0000-000000004221','demo');

insert into public.condominiums(id,organization_id,name,created_by) values
  ('42210000-0000-0000-0000-000000000001','42200000-0000-0000-0000-000000000001','Customer Condo','00000000-0000-0000-0000-000000004221'),
  ('42210000-0000-0000-0000-000000000002','42200000-0000-0000-0000-000000000002','Demo Condo','00000000-0000-0000-0000-000000004221');

insert into public.organization_memberships(organization_id,user_id,role) values
  ('42200000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000004221','organization_owner');
insert into public.condominium_memberships(condominium_id,user_id,role) values
  ('42210000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000004221','condominium_admin');

insert into public.buildings(id,condominium_id,name,created_by) values
  ('42220000-0000-0000-0000-000000000001','42210000-0000-0000-0000-000000000002','Torre A','00000000-0000-0000-0000-000000004221'),
  ('42220000-0000-0000-0000-000000000002','42210000-0000-0000-0000-000000000002','Torre B','00000000-0000-0000-0000-000000004221');

insert into public.units(id,condominium_id,building_id,code,type,status,created_by) values
  ('42230000-0000-0000-0000-000000000001','42210000-0000-0000-0000-000000000002','42220000-0000-0000-0000-000000000001','A-01','apartment','active','00000000-0000-0000-0000-000000004221'),
  ('42230000-0000-0000-0000-000000000002','42210000-0000-0000-0000-000000000002','42220000-0000-0000-0000-000000000001','A-02','apartment','active','00000000-0000-0000-0000-000000004221'),
  ('42230000-0000-0000-0000-000000000003','42210000-0000-0000-0000-000000000002','42220000-0000-0000-0000-000000000002','B-01','apartment','active','00000000-0000-0000-0000-000000004221');

insert into public.subscriptions(
  id, condominium_id, status, commercial_status, trial_starts_at, trial_ends_at, current_period_end
) values (
  '42240000-0000-0000-0000-000000000001',
  '42210000-0000-0000-0000-000000000001',
  'trialing',
  'confirmed',
  now(),
  now() + interval '30 days',
  current_date + 30
);

insert into public.subscription_terms(
  id, subscription_id, plan_code, contracted_period_amount, currency, billing_period,
  contracted_unit_limit, unlimited_units, origin, catalog_reference_amount,
  effective_from, effective_to
) values (
  '42250000-0000-0000-0000-000000000001',
  '42240000-0000-0000-0000-000000000001',
  'esencial', 29.00, 'USD', 'monthly', 30, false, 'catalog', 29.00,
  current_date, null
);

-- Tenant users can execute the RPC but receive no cross-tenant data.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000004221',true);
select is(
  (select count(*) from public.get_platform_operations_overview()),
  0::bigint,
  'ordinary tenant receives no platform operations rows'
);

-- Platform Admin gets only the deliberately shaped overview, including commercial metadata.
set local role postgres;
reset request.jwt.claim.sub;
insert into public.platform_admins(user_id) values ('00000000-0000-0000-0000-000000004222');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000004222',true);
select is(
  (select count(*) from public.get_platform_operations_overview()),
  2::bigint,
  'platform admin sees both condominiums'
);
select is(
  (select building_count from public.get_platform_operations_overview() where condominium_name = 'Demo Condo'),
  2::bigint,
  'overview reports real building count'
);
select is(
  (select active_unit_count from public.get_platform_operations_overview() where condominium_name = 'Demo Condo'),
  3::bigint,
  'overview reports real active unit count'
);
select is(
  (select account_type from public.get_platform_operations_overview() where condominium_name = 'Demo Condo'),
  'demo'::text,
  'overview exposes explicit demo classification'
);
select is(
  (select subscription_status from public.get_platform_operations_overview() where condominium_name = 'Customer Condo'),
  'trialing'::text,
  'overview exposes customer trial state'
);
select is(
  (select plan_code from public.get_platform_operations_overview() where condominium_name = 'Customer Condo'),
  'esencial'::text,
  'overview exposes the active contracted plan'
);
select ok(
  (select subscription_id is null from public.get_platform_operations_overview() where condominium_name = 'Demo Condo'),
  'demo remains visibly non-subscribed'
);
select throws_ok(
  $$select count(*) from public.subscriptions$$,
  '42501', null,
  'platform admin still cannot read raw subscription rows directly'
);
select throws_ok(
  $$insert into public.buildings(condominium_id,name,created_by) values ('42210000-0000-0000-0000-000000000001','forbidden','00000000-0000-0000-0000-000000004222')$$,
  '42501', null,
  'platform admin remains unable to write tenant structures'
);

select * from finish();
rollback;
