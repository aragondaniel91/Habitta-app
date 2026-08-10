begin;
select plan(7);
-- Requires the local Supabase test database: supabase test db.
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
values ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','c@test.local','x',now(),now()),
       ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','d@test.local','x',now(),now());
insert into public.organizations(id,name,created_by) values
  ('30000000-0000-0000-0000-000000000001','C org','00000000-0000-0000-0000-0000000000c1'),
  ('40000000-0000-0000-0000-000000000002','D org','00000000-0000-0000-0000-0000000000d1');
insert into public.condominiums(id,organization_id,name,created_by) values
  ('31000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','C1','00000000-0000-0000-0000-0000000000c1'),
  ('41000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000002','D1','00000000-0000-0000-0000-0000000000d1');
insert into public.organization_memberships(organization_id,user_id,role) values
  ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1','organization_owner');

-- C is an ordinary organization owner: sees only their own organization/condominium, and the
-- platform-wide overview returns nothing for them (they hold no platform_admins grant).
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c1',true);
select is((select count(*) from public.organizations),1::bigint,'ordinary owner reads only their own organization');
select is((select count(*) from public.condominiums),1::bigint,'ordinary owner reads only their own condominium');
select is((select count(*) from public.get_platform_condominium_overview()),0::bigint,'non-admin gets nothing from the platform overview');

-- Grant D the platform_admin role.
set local role postgres; reset request.jwt.claim.sub;
insert into public.platform_admins(user_id) values ('00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1',true);
select is((select count(*) from public.organizations),2::bigint,'platform admin reads every organization');
select is((select count(*) from public.condominiums),2::bigint,'platform admin reads every condominium');
select is((select count(*) from public.get_platform_condominium_overview()),2::bigint,'platform admin sees every condominium in the overview');
select throws_ok(
  $$insert into public.buildings(condominium_id,name,created_by) values ('31000000-0000-0000-0000-000000000001','x','00000000-0000-0000-0000-0000000000d1')$$,
  '42501', null, 'platform admin can read another tenant''s condominium but still cannot write into it'
);
select * from finish(); rollback;
