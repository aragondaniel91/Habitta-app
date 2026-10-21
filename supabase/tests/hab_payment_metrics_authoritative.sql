begin;
select plan(15);

-- Separate condominium fixtures. All changes are rolled back.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
 ('98610000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','metrics_admin_a@test.invalid','x',now(),now()),
 ('98610000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','metrics_resident_a@test.invalid','x',now(),now()),
 ('98610000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','metrics_admin_b@test.invalid','x',now(),now()),
 ('98610000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','metrics_unknown@test.invalid','x',now(),now());

insert into public.organizations (id,name,created_by) values
 ('98600000-0000-0000-0000-000000000001','Metrics Org A','98610000-0000-0000-0000-000000000001'),
 ('98600000-0000-0000-0000-000000000002','Metrics Org B','98610000-0000-0000-0000-000000000003');
insert into public.condominiums (id,organization_id,name,created_by) values
 ('98620000-0000-0000-0000-000000000001','98600000-0000-0000-0000-000000000001','Metrics Condo A','98610000-0000-0000-0000-000000000001'),
 ('98620000-0000-0000-0000-000000000002','98600000-0000-0000-0000-000000000002','Metrics Condo B','98610000-0000-0000-0000-000000000003');
insert into public.condominium_memberships(condominium_id,user_id,role) values
 ('98620000-0000-0000-0000-000000000001','98610000-0000-0000-0000-000000000001','condominium_admin'),
 ('98620000-0000-0000-0000-000000000002','98610000-0000-0000-0000-000000000003','condominium_admin');
insert into public.units(id,condominium_id,code,type,created_by) values
 ('98630000-0000-0000-0000-000000000001','98620000-0000-0000-0000-000000000001','A-01','apartment','98610000-0000-0000-0000-000000000001'),
 ('98630000-0000-0000-0000-000000000002','98620000-0000-0000-0000-000000000002','B-01','apartment','98610000-0000-0000-0000-000000000003');
insert into public.people(id,condominium_id,auth_user_id,first_name,last_name,created_by) values
 ('98640000-0000-0000-0000-000000000001','98620000-0000-0000-0000-000000000001','98610000-0000-0000-0000-000000000002','Resident','A','98610000-0000-0000-0000-000000000001');
insert into public.unit_owners(unit_id,person_id,created_by) values
 ('98630000-0000-0000-0000-000000000001','98640000-0000-0000-0000-000000000001','98610000-0000-0000-0000-000000000001');
insert into public.condominium_payment_methods(id,condominium_id,method_type,display_name,currency_code,created_by) values
 ('98650000-0000-0000-0000-000000000001','98620000-0000-0000-0000-000000000001','bank_transfer','Metrics USD','USD','98610000-0000-0000-0000-000000000001'),
 ('98650000-0000-0000-0000-000000000002','98620000-0000-0000-0000-000000000001','bank_transfer','Metrics VES','VES','98610000-0000-0000-0000-000000000001'),
 ('98650000-0000-0000-0000-000000000003','98620000-0000-0000-0000-000000000002','bank_transfer','Metrics B USD','USD','98610000-0000-0000-0000-000000000003');

insert into public.payments(id,condominium_id,unit_id,submitted_by_user_id,payment_method_id,status,payment_date,original_amount,original_currency_code,payer_name,idempotency_key) values
 ('98660000-0000-0000-0000-000000000001','98620000-0000-0000-0000-000000000001','98630000-0000-0000-0000-000000000001','98610000-0000-0000-0000-000000000002','98650000-0000-0000-0000-000000000001','approved',current_date,12.34,'USD','Resident A','metrics-a-approved'),
 ('98660000-0000-0000-0000-000000000002','98620000-0000-0000-0000-000000000001','98630000-0000-0000-0000-000000000001','98610000-0000-0000-0000-000000000002','98650000-0000-0000-0000-000000000001','reversed',current_date,3.01,'USD','Resident A','metrics-a-reversed'),
 ('98660000-0000-0000-0000-000000000003','98620000-0000-0000-0000-000000000001','98630000-0000-0000-0000-000000000001','98610000-0000-0000-0000-000000000002','98650000-0000-0000-0000-000000000001','submitted',current_date,4.00,'USD','Resident A','metrics-a-submitted'),
 ('98660000-0000-0000-0000-000000000004','98620000-0000-0000-0000-000000000001','98630000-0000-0000-0000-000000000001','98610000-0000-0000-0000-000000000002','98650000-0000-0000-0000-000000000001','draft',current_date,6.00,'USD','Resident A','metrics-a-resident-draft'),
 ('98660000-0000-0000-0000-000000000005','98620000-0000-0000-0000-000000000001','98630000-0000-0000-0000-000000000001','98610000-0000-0000-0000-000000000001','98650000-0000-0000-0000-000000000001','draft',current_date,8.00,'USD','Admin A','metrics-a-staff-draft'),
 ('98660000-0000-0000-0000-000000000006','98620000-0000-0000-0000-000000000001','98630000-0000-0000-0000-000000000001','98610000-0000-0000-0000-000000000001','98650000-0000-0000-0000-000000000002','approved',current_date,100.00,'VES','Admin A','metrics-a-ves-approved'),
 ('98660000-0000-0000-0000-000000000007','98620000-0000-0000-0000-000000000002','98630000-0000-0000-0000-000000000002','98610000-0000-0000-0000-000000000003','98650000-0000-0000-0000-000000000003','approved',current_date,999.00,'USD','Admin B','metrics-b-approved');

select ok(not has_function_privilege('anon','public.get_payment_metrics(uuid)','EXECUTE'),'anonymous user cannot execute payment metrics');
select ok(has_function_privilege('authenticated','public.get_payment_metrics(uuid)','EXECUTE'),'authenticated user can invoke metrics under RLS');
select ok(not (select prosecdef from pg_proc where oid='public.get_payment_metrics(uuid)'::regprocedure),'metrics execute as invoker, not privileged definer');
select ok((select relrowsecurity from pg_class where oid='public.payments'::regclass),'source payments table maintains RLS');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','98610000-0000-0000-0000-000000000001',true);
select is((select approved_amount from public.get_payment_metrics('98620000-0000-0000-0000-000000000001') where currency_code='USD'),'12.34','admin sees complete approved USD amount');
select is((select reversed_amount from public.get_payment_metrics('98620000-0000-0000-0000-000000000001') where currency_code='USD'),'3.01','admin sees complete reversed USD amount');
select is((select pending_review_count from public.get_payment_metrics('98620000-0000-0000-0000-000000000001') where currency_code='USD'),1::bigint,'reviewer pending count is server-complete');
select is((select own_attention_count from public.get_payment_metrics('98620000-0000-0000-0000-000000000001') where currency_code='USD'),1::bigint,'admin sees only own staff draft');
select is((select approved_amount from public.get_payment_metrics('98620000-0000-0000-0000-000000000001') where currency_code='VES'),'100.00','currency isolation: VES remains separate from USD');
select is((select count(*) from public.get_payment_metrics('98620000-0000-0000-0000-000000000002')),0::bigint,'admin A cannot read cross-tenant metrics');

select set_config('request.jwt.claim.sub','98610000-0000-0000-0000-000000000002',true);
select is((select own_attention_count from public.get_payment_metrics('98620000-0000-0000-0000-000000000001') where currency_code='USD'),1::bigint,'resident counts only own private draft');
select is((select approved_amount from public.get_payment_metrics('98620000-0000-0000-0000-000000000001') where currency_code='USD'),'12.34','resident can see own unit approved payment only');
select is((select count(*) from public.get_payment_metrics('98620000-0000-0000-0000-000000000002')),0::bigint,'resident cannot enumerate foreign condominium');

select set_config('request.jwt.claim.sub','98610000-0000-0000-0000-000000000004',true);
select is((select count(*) from public.get_payment_metrics('98620000-0000-0000-0000-000000000001')),0::bigint,'unaffiliated user obtains no payment metrics');
select is((select count(*) from public.get_payment_metrics('98620000-0000-0000-0000-000000000002')),0::bigint,'unaffiliated user obtains no cross-tenant metrics');

select * from finish();
rollback;
