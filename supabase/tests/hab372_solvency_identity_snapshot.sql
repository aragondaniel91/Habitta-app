begin;
select plan(9);

select has_column('public','solvency_certificates','condominium_name_snapshot',
  'the certificate freezes the condominium name');
select has_column('public','solvency_certificates','unit_code_snapshot',
  'the certificate freezes the unit code');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
('37200000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hab372@test.local','x',now(),now());
insert into public.organizations(id,name,created_by) values
('37210000-0000-4000-8000-000000000001','HAB372 Org','37200000-0000-0000-0000-000000000001');
insert into public.condominiums(id,organization_id,name,created_by) values
('37220000-0000-4000-8000-000000000001','37210000-0000-4000-8000-000000000001','Residencias Los Pinos','37200000-0000-0000-0000-000000000001');
insert into public.organization_memberships(organization_id,user_id,role) values
('37210000-0000-4000-8000-000000000001','37200000-0000-0000-0000-000000000001','organization_owner');
insert into public.condominium_memberships(condominium_id,user_id,role) values
('37220000-0000-4000-8000-000000000001','37200000-0000-0000-0000-000000000001','condominium_admin');
insert into public.buildings(id,condominium_id,name,created_by) values
('37230000-0000-4000-8000-000000000001','37220000-0000-4000-8000-000000000001','Torre A','37200000-0000-0000-0000-000000000001');
insert into public.units(id,condominium_id,building_id,code,type,ownership_percentage,created_by) values
('37240000-0000-4000-8000-000000000001','37220000-0000-4000-8000-000000000001','37230000-0000-4000-8000-000000000001','A-1','apartment',100,'37200000-0000-0000-0000-000000000001');
insert into public.condominium_solvency_policies(condominium_id,updated_by) values
('37220000-0000-4000-8000-000000000001','37200000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','37200000-0000-0000-0000-000000000001',true);

select lives_ok(
  $$select public.issue_solvency_certificate('37220000-0000-4000-8000-000000000001','37240000-0000-4000-8000-000000000001',current_date)$$,
  'a certificate is issued for a solvent unit'
);
select set_config('hab372.vid',(select verification_id::text from public.solvency_certificates limit 1),true);

select is(
  (select public.verify_solvency_certificate(current_setting('hab372.vid')::uuid) ->> 'condominium_name'),
  'Residencias Los Pinos',
  'verification names the condominium the certificate was issued for'
);
select is(
  (select public.verify_solvency_certificate(current_setting('hab372.vid')::uuid) ->> 'unit_code'),
  'A-1',
  'verification names the unit the certificate was issued for'
);

-- The defect: renaming the condominium and recoding the unit used to rewrite the identity on every
-- certificate already in a resident's hands, because verification read both live.
select lives_ok(
  $$select public.update_condominium_profile('37220000-0000-4000-8000-000000000001','Conjunto Residencial El Bosque','VE','Av. Principal','Caracas','America/Caracas','USD')$$,
  'the administrator renames the condominium'
);
update public.units set code = '101' where id = '37240000-0000-4000-8000-000000000001';

select is(
  (select public.verify_solvency_certificate(current_setting('hab372.vid')::uuid) ->> 'condominium_name'),
  'Residencias Los Pinos',
  'the issued certificate still verifies under the name printed on it'
);
select is(
  (select public.verify_solvency_certificate(current_setting('hab372.vid')::uuid) ->> 'unit_code'),
  'A-1',
  'the issued certificate still verifies under the unit code printed on it'
);

-- The frozen identity must be as immutable as the rest of the row.
select throws_ok(
  $$update public.solvency_certificates set condominium_name_snapshot='Otro nombre'$$,
  '42501',
  'permission denied for table solvency_certificates',
  'a client cannot rewrite the identity a certificate was issued under'
);

select * from finish();
rollback;
