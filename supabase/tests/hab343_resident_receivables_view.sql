begin;
select plan(8);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
('73430000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin@hab343.test','x',now(),now()),
('73430000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner@hab343.test','x',now(),now()),
('73430000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','tenant@hab343.test','x',now(),now());

insert into public.organizations(id,name,created_by) values
('73431000-0000-0000-0000-000000000001','HAB343 Org','73430000-0000-0000-0000-000000000001');
insert into public.condominiums(id,organization_id,name,created_by) values
('73432000-0000-0000-0000-000000000001','73431000-0000-0000-0000-000000000001','HAB343 Condo','73430000-0000-0000-0000-000000000001');
insert into public.condominium_memberships(condominium_id,user_id,role) values
('73432000-0000-0000-0000-000000000001','73430000-0000-0000-0000-000000000001','condominium_admin'),
('73432000-0000-0000-0000-000000000001','73430000-0000-0000-0000-000000000002','owner'),
('73432000-0000-0000-0000-000000000001','73430000-0000-0000-0000-000000000003','tenant');
insert into public.units(id,condominium_id,code,type,created_by) values
('73433000-0000-0000-0000-000000000001','73432000-0000-0000-0000-000000000001','A-1','apartment','73430000-0000-0000-0000-000000000001'),
('73433000-0000-0000-0000-000000000002','73432000-0000-0000-0000-000000000001','A-2','apartment','73430000-0000-0000-0000-000000000001');
insert into public.people(id,condominium_id,auth_user_id,first_name,last_name,created_by) values
('73434000-0000-0000-0000-000000000002','73432000-0000-0000-0000-000000000001','73430000-0000-0000-0000-000000000002','Own','Er','73430000-0000-0000-0000-000000000001'),
('73434000-0000-0000-0000-000000000003','73432000-0000-0000-0000-000000000001','73430000-0000-0000-0000-000000000003','Ten','Ant','73430000-0000-0000-0000-000000000001');
insert into public.unit_owners(unit_id,person_id,created_by) values
('73433000-0000-0000-0000-000000000001','73434000-0000-0000-0000-000000000002','73430000-0000-0000-0000-000000000001');
insert into public.unit_occupancies(unit_id,person_id,occupancy_type,created_by) values
('73433000-0000-0000-0000-000000000002','73434000-0000-0000-0000-000000000003','tenant','73430000-0000-0000-0000-000000000001');
insert into public.charge_concepts(id,condominium_id,code,name,category,created_by) values
('73435000-0000-0000-0000-000000000001','73432000-0000-0000-0000-000000000001','DUES','Cuota ordinaria','regular_dues','73430000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','73430000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.create_receivable_item('73432000-0000-0000-0000-000000000001','73433000-0000-0000-0000-000000000001','73435000-0000-0000-0000-000000000001','Owner debt',100.00,'USD',current_date-40,current_date-35)$$,'admin creates owner debt');
select lives_ok($$select public.create_receivable_item('73432000-0000-0000-0000-000000000001','73433000-0000-0000-0000-000000000002','73435000-0000-0000-0000-000000000001','Tenant debt',50.00,'VES',current_date-10,current_date-5)$$,'admin creates tenant debt');

select set_config('request.jwt.claim.sub','73430000-0000-0000-0000-000000000002',true);
select is((select net_outstanding from public.get_receivables_summary('73432000-0000-0000-0000-000000000001') where currency_code='USD'),'100.00','owner summary includes own debt');
select is((select count(*) from public.get_receivables_summary('73432000-0000-0000-0000-000000000001') where currency_code='VES'),0::bigint,'owner summary excludes tenant unit');
select is((select days_31_60 from public.get_receivables_aging('73432000-0000-0000-0000-000000000001') where currency_code='USD'),'100.00','owner aging reflects own overdue debt');
select is((select count(*) from public.charge_concepts where condominium_id='73432000-0000-0000-0000-000000000001'),1::bigint,'owner can read charge concept names');

select set_config('request.jwt.claim.sub','73430000-0000-0000-0000-000000000003',true);
select is((select net_outstanding from public.get_receivables_summary('73432000-0000-0000-0000-000000000001') where currency_code='VES'),'50.00','tenant summary includes occupied unit debt');
select is((select count(*) from public.get_receivables_summary('73432000-0000-0000-0000-000000000001') where currency_code='USD'),0::bigint,'tenant summary excludes owner unit');

select * from finish();
rollback;
