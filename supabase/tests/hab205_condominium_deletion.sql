begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users(id, email)
values
  ('20500000-0000-4000-8000-000000000001', 'hab205-owner-a@example.com'),
  ('20500000-0000-4000-8000-000000000002', 'hab205-admin-a@example.com'),
  ('20500000-0000-4000-8000-000000000003', 'hab205-owner-b@example.com');

insert into public.organizations(id, name, created_by)
values
  ('20510000-0000-4000-8000-000000000001', 'HAB-205 Organization A', '20500000-0000-4000-8000-000000000001'),
  ('20510000-0000-4000-8000-000000000002', 'HAB-205 Organization B', '20500000-0000-4000-8000-000000000003');

insert into public.condominiums(id, organization_id, name, created_by)
values
  ('20520000-0000-4000-8000-000000000001', '20510000-0000-4000-8000-000000000001', 'Residencia HAB 205 A', '20500000-0000-4000-8000-000000000001'),
  ('20520000-0000-4000-8000-000000000002', '20510000-0000-4000-8000-000000000002', 'Residencia HAB 205 B', '20500000-0000-4000-8000-000000000003');

insert into public.organization_memberships(organization_id, user_id, role)
values
  ('20510000-0000-4000-8000-000000000001', '20500000-0000-4000-8000-000000000001', 'organization_owner'),
  ('20510000-0000-4000-8000-000000000002', '20500000-0000-4000-8000-000000000003', 'organization_owner');

insert into public.condominium_memberships(condominium_id, user_id, role)
values
  ('20520000-0000-4000-8000-000000000001', '20500000-0000-4000-8000-000000000001', 'condominium_admin'),
  ('20520000-0000-4000-8000-000000000001', '20500000-0000-4000-8000-000000000002', 'condominium_admin'),
  ('20520000-0000-4000-8000-000000000002', '20500000-0000-4000-8000-000000000003', 'condominium_admin');

select has_table('public', 'condominium_deletion_jobs', 'deletion jobs persist only the cleanup tombstone');
select has_function('public', 'request_condominium_deletion', array['uuid','text'], 'owner-only deletion RPC exists');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','20500000-0000-4000-8000-000000000001','role','authenticated','email','hab205-owner-a@example.com')::text, true);

select lives_ok(
  $$select public.create_community_document('20520000-0000-4000-8000-000000000001','Archivo de prueba HAB-205',null,null,null,'management',null)$$,
  'owner creates tenant data before destructive reset'
);

select set_config(
  'hab205.document_id',
  (select id::text from public.community_documents where condominium_id='20520000-0000-4000-8000-000000000001' and title='Archivo de prueba HAB-205'),
  true
);

select lives_ok(
  format(
    $q$select public.record_community_document_version('%s','20580000-0000-4000-8000-000000000001','hab205.pdf','application/pdf',128,'%s','community-documents/20520000-0000-4000-8000-000000000001/%s/20580000-0000-4000-8000-000000000001','Prueba de limpieza')$q$,
    current_setting('hab205.document_id'),
    repeat('a',64),
    current_setting('hab205.document_id')
  ),
  'tenant file metadata exists before reset'
);

select set_config('request.jwt.claims', json_build_object('sub','20500000-0000-4000-8000-000000000002','role','authenticated','email','hab205-admin-a@example.com')::text, true);
select throws_ok(
  $$select public.request_condominium_deletion('20520000-0000-4000-8000-000000000001','ELIMINAR Residencia HAB 205 A')$$,
  '42501',
  'Organization owner required',
  'condominium admin cannot delete the residence'
);

select set_config('request.jwt.claims', json_build_object('sub','20500000-0000-4000-8000-000000000003','role','authenticated','email','hab205-owner-b@example.com')::text, true);
select throws_ok(
  $$select public.request_condominium_deletion('20520000-0000-4000-8000-000000000001','ELIMINAR Residencia HAB 205 A')$$,
  '42501',
  'Organization owner required',
  'owner of another tenant cannot delete this residence'
);

select set_config('request.jwt.claims', json_build_object('sub','20500000-0000-4000-8000-000000000001','role','authenticated','email','hab205-owner-a@example.com')::text, true);
select throws_ok(
  $$select public.request_condominium_deletion('20520000-0000-4000-8000-000000000001','Residencia HAB 205 A')$$,
  '22023',
  'Confirmation does not match condominium name',
  'exact destructive confirmation is mandatory'
);

create temporary table hab205_deletion as
select *
from public.request_condominium_deletion(
  '20520000-0000-4000-8000-000000000001',
  'ELIMINAR Residencia HAB 205 A'
);

select is((select count(*)::integer from hab205_deletion), 1, 'owner receives one deletion cleanup job');
select is((select storage_object_count from hab205_deletion), 1, 'R2 manifest includes the tenant private object');

reset role;
select is((select count(*)::integer from public.condominiums where id='20520000-0000-4000-8000-000000000001'), 0, 'target condominium is removed');
select is((select count(*)::integer from public.organizations where id='20510000-0000-4000-8000-000000000001'), 1, 'organization survives so onboarding can start over');
select is((select count(*)::integer from auth.users where id='20500000-0000-4000-8000-000000000001'), 1, 'Auth user survives condominium deletion');
select is((select count(*)::integer from public.condominiums where id='20520000-0000-4000-8000-000000000002'), 1, 'other tenant remains untouched');
select is((select count(*)::integer from public.community_document_versions where condominium_id='20520000-0000-4000-8000-000000000001'), 0, 'tenant document metadata is removed');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','20500000-0000-4000-8000-000000000003','role','authenticated','email','hab205-owner-b@example.com')::text, true);
select is(
  public.get_condominium_deletion_storage_keys((select job_id from hab205_deletion)),
  null::text[],
  'another user cannot read the cleanup manifest'
);

select set_config('request.jwt.claims', json_build_object('sub','20500000-0000-4000-8000-000000000001','role','authenticated','email','hab205-owner-a@example.com')::text, true);
select is(
  public.get_condominium_deletion_storage_keys((select job_id from hab205_deletion)),
  array[(select storage_keys[1] from hab205_deletion)],
  'requesting owner can retry private storage cleanup'
);
select ok(
  public.finish_condominium_deletion_storage_cleanup((select job_id from hab205_deletion), true, null),
  'owner can mark successful private storage cleanup'
);

reset role;
select is(
  (select storage_cleanup_status from public.condominium_deletion_jobs where id=(select job_id from hab205_deletion)),
  'completed',
  'successful cleanup leaves a completed tombstone without tenant data'
);

select * from finish();
rollback;
