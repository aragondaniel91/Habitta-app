begin;
select plan(6);
-- Local fixtures are rolled back; no production writes.
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hab557-a@test.local','x',now(),now()),
('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hab557-b@test.local','x',now(),now());
insert into public.organizations(id,name,created_by) values
('33000000-0000-4000-8000-000000000001','HAB557 A','00000000-0000-0000-0000-0000000000c1'),
('44000000-0000-4000-8000-000000000002','HAB557 B','00000000-0000-0000-0000-0000000000d1');
insert into public.condominiums(id,organization_id,name,created_by) values
('33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000001','HAB557 A Condo','00000000-0000-0000-0000-0000000000c1'),
('44000000-0000-4000-8000-000000000022','44000000-0000-4000-8000-000000000002','HAB557 B Condo','00000000-0000-0000-0000-0000000000d1');
insert into public.condominium_memberships(condominium_id,user_id,role) values
('33000000-0000-4000-8000-000000000011','00000000-0000-0000-0000-0000000000c1','condominium_admin'),
('44000000-0000-4000-8000-000000000022','00000000-0000-0000-0000-0000000000d1','condominium_admin');
insert into public.buildings(id,condominium_id,name,created_by) values
('33000000-0000-4000-8000-000000000101','33000000-0000-4000-8000-000000000011','A Torre','00000000-0000-0000-0000-0000000000c1'),
('44000000-0000-4000-8000-000000000202','44000000-0000-4000-8000-000000000022','B Torre','00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c1',true);
select is((select count(*) from public.buildings where condominium_id='33000000-0000-4000-8000-000000000011'),1::bigint,'A can read own physical building');
select is((select count(*) from public.buildings where condominium_id='44000000-0000-4000-8000-000000000022'),0::bigint,'A cannot read B physical building');
with denied_write as (
  update public.buildings set name = 'Cross-tenant overwrite attempt'
  where id = '44000000-0000-4000-8000-000000000202'
  returning id
)
select is((select count(*) from denied_write),0::bigint,'A cannot update B physical building');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1',true);
select is((select count(*) from public.buildings where condominium_id='44000000-0000-4000-8000-000000000022'),1::bigint,'B can read own physical building');
select is((select name from public.buildings where id='44000000-0000-4000-8000-000000000202'),'B Torre'::text,'B building unchanged after A cross-tenant update attempt');
select is((select count(*) from public.buildings where condominium_id='33000000-0000-4000-8000-000000000011'),0::bigint,'B cannot read A physical building');
reset role;
select * from finish();
rollback;
