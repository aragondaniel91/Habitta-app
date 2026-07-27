begin;
select plan(8);
-- Requires the local Supabase test database: supabase test db.
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@test.local','x',now(),now()),
       ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b@test.local','x',now(),now());
insert into public.organizations(id,name,created_by) values ('10000000-0000-0000-0000-000000000001','A','00000000-0000-0000-0000-0000000000a1'),('20000000-0000-0000-0000-000000000002','B','00000000-0000-0000-0000-0000000000b1');
insert into public.condominiums(id,organization_id,name,created_by) values ('11000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','A1','00000000-0000-0000-0000-0000000000a1'),('22000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','B1','00000000-0000-0000-0000-0000000000b1');
insert into public.organization_memberships(organization_id,user_id,role) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','organization_owner');
insert into public.condominium_memberships(condominium_id,user_id,role) values ('11000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','condominium_admin'),('22000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000b1','owner');
set local role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',true);
select is((select count(*) from public.organizations),1::bigint,'A reads organization A only');
select is((select count(*) from public.condominiums),1::bigint,'A reads condominium A only');
select throws_ok($$insert into public.buildings(condominium_id,name,created_by) values ('22000000-0000-0000-0000-000000000002','x','00000000-0000-0000-0000-0000000000a1')$$,'42501',null,'A cannot create building in B');
select lives_ok($$insert into public.buildings(id,condominium_id,name,created_by) values ('11110000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','Tower','00000000-0000-0000-0000-0000000000a1')$$,'admin creates building');
select lives_ok($$insert into public.units(condominium_id,building_id,code,type,created_by) values ('11000000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000001','1','apartment','00000000-0000-0000-0000-0000000000a1')$$,'admin creates unit');
select throws_ok($$insert into public.units(condominium_id,building_id,code,type,created_by) values ('22000000-0000-0000-0000-000000000002','11110000-0000-0000-0000-000000000001','X','apartment','00000000-0000-0000-0000-0000000000a1')$$,null,null,'cross-condominium building is rejected');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',true);
select is((select count(*) from public.condominiums),1::bigint,'owner reads authorized condominium');
select throws_ok($$insert into public.buildings(condominium_id,name,created_by) values ('22000000-0000-0000-0000-000000000002','No','00000000-0000-0000-0000-0000000000b1')$$,'42501',null,'owner cannot manage structure');
select * from finish(); rollback;
