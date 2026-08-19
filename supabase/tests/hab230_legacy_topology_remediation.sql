begin;
create extension if not exists pgtap with schema extensions;
select plan(45);
select has_function('public','remediate_condominium_topology',array['uuid','condominium_property_topology','integer','integer']);
select function_privs_are('public','remediate_condominium_topology',array['uuid','condominium_property_topology','integer','integer'],'anon',array[]::text[]);
select function_privs_are('public','remediate_condominium_topology',array['uuid','condominium_property_topology','integer','integer'],'authenticated',array['EXECUTE']);

insert into auth.users(id,email) values
('23000000-0000-4000-8000-000000000001','owner@hab230.test'),('23000000-0000-4000-8000-000000000002','admin@hab230.test'),('23000000-0000-4000-8000-000000000003','accountant@hab230.test'),('23000000-0000-4000-8000-000000000004','assistant@hab230.test'),('23000000-0000-4000-8000-000000000005','outsider@hab230.test'),('23000000-0000-4000-8000-000000000006','other@hab230.test');
insert into public.organizations(id,name,created_by) values
('23010000-0000-4000-8000-000000000001','HAB230 A','23000000-0000-4000-8000-000000000001'),('23010000-0000-4000-8000-000000000002','HAB230 B','23000000-0000-4000-8000-000000000006');
insert into public.organization_memberships(organization_id,user_id,role) values
('23010000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000001','organization_owner'),('23010000-0000-4000-8000-000000000002','23000000-0000-4000-8000-000000000006','organization_owner');
insert into public.condominiums(id,organization_id,name,created_by,property_topology) values
('23020000-0000-4000-8000-000000000001','23010000-0000-4000-8000-000000000001','Owner','23000000-0000-4000-8000-000000000001','unspecified'),('23020000-0000-4000-8000-000000000002','23010000-0000-4000-8000-000000000001','Admin','23000000-0000-4000-8000-000000000001','unspecified'),('23020000-0000-4000-8000-000000000003','23010000-0000-4000-8000-000000000001','House','23000000-0000-4000-8000-000000000001','unspecified'),('23020000-0000-4000-8000-000000000004','23010000-0000-4000-8000-000000000001','Single','23000000-0000-4000-8000-000000000001','unspecified'),('23020000-0000-4000-8000-000000000005','23010000-0000-4000-8000-000000000001','Multi','23000000-0000-4000-8000-000000000001','unspecified'),('23020000-0000-4000-8000-000000000006','23010000-0000-4000-8000-000000000001','Mixed','23000000-0000-4000-8000-000000000001','unspecified'),('23020000-0000-4000-8000-000000000007','23010000-0000-4000-8000-000000000001','Bad house','23000000-0000-4000-8000-000000000001','unspecified'),('23020000-0000-4000-8000-000000000008','23010000-0000-4000-8000-000000000002','Other','23000000-0000-4000-8000-000000000006','unspecified');
insert into public.condominium_memberships(condominium_id,user_id,role) values
('23020000-0000-4000-8000-000000000002','23000000-0000-4000-8000-000000000002','condominium_admin'),('23020000-0000-4000-8000-000000000002','23000000-0000-4000-8000-000000000003','accountant'),('23020000-0000-4000-8000-000000000002','23000000-0000-4000-8000-000000000004','assistant'),('23020000-0000-4000-8000-000000000008','23000000-0000-4000-8000-000000000006','condominium_admin');
insert into public.buildings(id,condominium_id,name,created_by) values ('23030000-0000-4000-8000-000000000001','23020000-0000-4000-8000-000000000007','Legacy tower','23000000-0000-4000-8000-000000000001'),('23030000-0000-4000-8000-000000000002','23020000-0000-4000-8000-000000000004','Single tower','23000000-0000-4000-8000-000000000001');
insert into public.units(id,condominium_id,building_id,code,type,status,created_by) values ('23040000-0000-4000-8000-000000000001','23020000-0000-4000-8000-000000000003',null,'H-1','house','active','23000000-0000-4000-8000-000000000001'),('23040000-0000-4000-8000-000000000002','23020000-0000-4000-8000-000000000004',null,'S-1','apartment','active','23000000-0000-4000-8000-000000000001'),('23040000-0000-4000-8000-000000000003','23020000-0000-4000-8000-000000000007','23030000-0000-4000-8000-000000000001','A-1','apartment','active','23000000-0000-4000-8000-000000000001');

insert into public.condominiums(id,organization_id,name,created_by,property_topology)
select format('23020000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,'23010000-0000-4000-8000-000000000001',format('Fixture %s',n),'23000000-0000-4000-8000-000000000001','unspecified'
from generate_series(9,16) n;
insert into public.buildings(id,condominium_id,name,created_by) values
('23030000-0000-4000-8000-000000000009','23020000-0000-4000-8000-000000000009','B9','23000000-0000-4000-8000-000000000001'),
('23030000-0000-4000-8000-000000000011','23020000-0000-4000-8000-000000000011','B11a','23000000-0000-4000-8000-000000000001'),('23030000-0000-4000-8000-000000000012','23020000-0000-4000-8000-000000000011','B11b','23000000-0000-4000-8000-000000000001'),
('23030000-0000-4000-8000-000000000015','23020000-0000-4000-8000-000000000015','B15a','23000000-0000-4000-8000-000000000001'),('23030000-0000-4000-8000-000000000016','23020000-0000-4000-8000-000000000015','B15b','23000000-0000-4000-8000-000000000001'),('23030000-0000-4000-8000-000000000017','23020000-0000-4000-8000-000000000015','B15c','23000000-0000-4000-8000-000000000001'),
('23030000-0000-4000-8000-000000000018','23020000-0000-4000-8000-000000000016','B16a','23000000-0000-4000-8000-000000000001'),('23030000-0000-4000-8000-000000000019','23020000-0000-4000-8000-000000000016','B16b','23000000-0000-4000-8000-000000000001');
insert into public.units(id,condominium_id,building_id,code,type,status,created_by) values
('23040000-0000-4000-8000-000000000009','23020000-0000-4000-8000-000000000009','23030000-0000-4000-8000-000000000009','U9','commercial','active','23000000-0000-4000-8000-000000000001'),
('23040000-0000-4000-8000-000000000010','23020000-0000-4000-8000-000000000010',null,'H10a','house','active','23000000-0000-4000-8000-000000000001'),('23040000-0000-4000-8000-000000000011','23020000-0000-4000-8000-000000000010',null,'H10b','house','active','23000000-0000-4000-8000-000000000001'),
('23040000-0000-4000-8000-000000000012','23020000-0000-4000-8000-000000000012',null,'H12','house','active','23000000-0000-4000-8000-000000000001'),
('23040000-0000-4000-8000-000000000013','23020000-0000-4000-8000-000000000013',null,'A13a','apartment','active','23000000-0000-4000-8000-000000000001'),('23040000-0000-4000-8000-000000000014','23020000-0000-4000-8000-000000000013',null,'A13b','apartment','active','23000000-0000-4000-8000-000000000001'),
('23040000-0000-4000-8000-000000000015','23020000-0000-4000-8000-000000000014',null,'H14','house','active','23000000-0000-4000-8000-000000000001'),
('23040000-0000-4000-8000-000000000016','23020000-0000-4000-8000-000000000016',null,'M16a','commercial','active','23000000-0000-4000-8000-000000000001'),('23040000-0000-4000-8000-000000000017','23020000-0000-4000-8000-000000000016',null,'M16b','commercial','active','23000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub','23000000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.remediate_condominium_topology('23020000-0000-4000-8000-000000000001','mixed',null,null)$$,'organization owner remediates without condominium admin membership');
select is((select property_topology::text from public.condominiums where id='23020000-0000-4000-8000-000000000001'),'mixed','owner topology updated');
select throws_ok($$select public.remediate_condominium_topology('23020000-0000-4000-8000-000000000001','house_community',1,null)$$,'P0001','property topology already resolved','second remediation is rejected');
select is((select property_topology::text from public.condominiums where id='23020000-0000-4000-8000-000000000001'),'mixed','resolved topology remains unchanged');
select lives_ok($$select public.remediate_condominium_topology('23020000-0000-4000-8000-000000000003','house_community',1,null)$$,'house remediation succeeds');
select is((select property_topology::text from public.condominiums where id='23020000-0000-4000-8000-000000000003'),'house_community','house topology persisted');
select is((select declared_building_count from public.condominiums where id='23020000-0000-4000-8000-000000000003'),null,'house has no declared buildings');
select lives_ok($$select public.remediate_condominium_topology('23020000-0000-4000-8000-000000000004','single_building',1,null)$$,'single remediation succeeds');
select is((select declared_building_count from public.condominiums where id='23020000-0000-4000-8000-000000000004'),1,'single normalizes building count');
select is((select building_id from public.units where id='23040000-0000-4000-8000-000000000002'),null,'single remediation does not reassign legacy unit');
select is((select name from public.buildings where id='23030000-0000-4000-8000-000000000002'),'Single tower','single building name preserved');
select lives_ok($$select public.remediate_condominium_topology('23020000-0000-4000-8000-000000000005','multi_building_complex',null,2)$$,'multi remediation succeeds');
select lives_ok($$select public.remediate_condominium_topology('23020000-0000-4000-8000-000000000006','mixed',null,null)$$,'mixed remediation succeeds with null counts');
select throws_ok($$select public.remediate_condominium_topology('23020000-0000-4000-8000-000000000007','house_community',1,null)$$,'P0001','existing structure is incompatible with house community','house rejects existing building and apartment');
select is((select property_topology::text from public.condominiums where id='23020000-0000-4000-8000-000000000007'),'unspecified','failed house remains legacy');
select is((select id from public.units where id='23040000-0000-4000-8000-000000000003'),'23040000-0000-4000-8000-000000000003'::uuid,'failed remediation preserves unit uuid');
select is((select code from public.units where id='23040000-0000-4000-8000-000000000003'),'A-1','failed remediation preserves unit code');
select is((select type::text from public.units where id='23040000-0000-4000-8000-000000000003'),'apartment','failed remediation preserves unit type');
select is((select building_id from public.units where id='23040000-0000-4000-8000-000000000003'),'23030000-0000-4000-8000-000000000001'::uuid,'failed remediation preserves unit building id');
select is((select id from public.buildings where id='23030000-0000-4000-8000-000000000002'),'23030000-0000-4000-8000-000000000002'::uuid,'single remediation preserves building uuid');
select throws_ok($$select public.remediate_condominium_topology('23020000-0000-4000-8000-000000000009','house_community',1,null)$$,'P0001','existing structure is incompatible with house community','house rejects building id');
select is((select property_topology::text from public.condominiums where id='23020000-0000-4000-8000-000000000009'),'unspecified','building-id failure remains legacy');
select throws_ok($$select public.remediate_condominium_topology('23020000-0000-4000-8000-000000000010','house_community',1,null)$$,'P0001','existing structure is incompatible with house community','house rejects count below existing');
select is((select property_topology::text from public.condominiums where id='23020000-0000-4000-8000-000000000010'),'unspecified','house count failure remains legacy');
select throws_ok($$select public.remediate_condominium_topology('23020000-0000-4000-8000-000000000011','single_building',1,null)$$,'P0001','existing structure is incompatible with single building','single rejects two buildings');
select is((select property_topology::text from public.condominiums where id='23020000-0000-4000-8000-000000000011'),'unspecified','single building failure remains legacy');
select throws_ok($$select public.remediate_condominium_topology('23020000-0000-4000-8000-000000000012','single_building',1,null)$$,'P0001','existing structure is incompatible with single building','single rejects house');
select is((select property_topology::text from public.condominiums where id='23020000-0000-4000-8000-000000000012'),'unspecified','single house failure remains legacy');
select throws_ok($$select public.remediate_condominium_topology('23020000-0000-4000-8000-000000000013','single_building',1,null)$$,'P0001','existing structure is incompatible with single building','single rejects count below existing');
select is((select property_topology::text from public.condominiums where id='23020000-0000-4000-8000-000000000013'),'unspecified','single count failure remains legacy');
select throws_ok($$select public.remediate_condominium_topology('23020000-0000-4000-8000-000000000014','multi_building_complex',null,2)$$,'P0001','existing structure is incompatible with multi building complex','multi rejects house');
select is((select property_topology::text from public.condominiums where id='23020000-0000-4000-8000-000000000014'),'unspecified','multi house failure remains legacy');
select throws_ok($$select public.remediate_condominium_topology('23020000-0000-4000-8000-000000000015','multi_building_complex',null,2)$$,'P0001','existing structure is incompatible with multi building complex','multi rejects count below buildings');
select is((select property_topology::text from public.condominiums where id='23020000-0000-4000-8000-000000000015'),'unspecified','multi count failure remains legacy');
select throws_ok($$select public.remediate_condominium_topology('23020000-0000-4000-8000-000000000016','mixed',1,2)$$,'P0001','declared structure cannot be smaller than existing structure','mixed rejects unit count below existing');
select throws_ok($$select public.remediate_condominium_topology('23020000-0000-4000-8000-000000000016','mixed',2,1)$$,'P0001','declared structure cannot be smaller than existing structure','mixed rejects building count below existing');
select is((select property_topology::text from public.condominiums where id='23020000-0000-4000-8000-000000000016'),'unspecified','mixed failures remain legacy');

select set_config('request.jwt.claim.sub','23000000-0000-4000-8000-000000000002',true);
select lives_ok($$select public.remediate_condominium_topology('23020000-0000-4000-8000-000000000002','mixed',null,null)$$,'condominium admin remediates');
select set_config('request.jwt.claim.sub','23000000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.remediate_condominium_topology('23020000-0000-4000-8000-000000000002','mixed',null,null)$$,'42501','permission denied','accountant denied in same condominium');
select set_config('request.jwt.claim.sub','23000000-0000-4000-8000-000000000004',true);
select throws_ok($$select public.remediate_condominium_topology('23020000-0000-4000-8000-000000000002','mixed',null,null)$$,'42501','permission denied','assistant denied in same condominium');
select set_config('request.jwt.claim.sub','23000000-0000-4000-8000-000000000005',true);
select throws_ok($$select public.remediate_condominium_topology('23020000-0000-4000-8000-000000000002','mixed',null,null)$$,'42501','permission denied','outsider denied');
select set_config('request.jwt.claim.sub','23000000-0000-4000-8000-000000000006',true);
select throws_ok($$select public.remediate_condominium_topology('23020000-0000-4000-8000-000000000002','mixed',null,null)$$,'42501','permission denied','other tenant admin denied');
select * from finish();
rollback;
