begin;

create extension if not exists pgtap with schema extensions;
select plan(41);

select has_table('public', 'community_document_categories', 'community document categories exist');
select has_table('public', 'community_document_folders', 'community document folders exist');
select has_table('public', 'community_documents', 'logical community documents exist');
select has_table('public', 'community_document_versions', 'immutable community document versions exist');
select has_table('public', 'community_document_download_events', 'download audit exists');
select has_table('public', 'community_document_links', 'related-record links exist');
select has_type('public', 'community_document_audience', 'document audience enum exists');

insert into auth.users(id, email)
values
  ('19300000-0000-4000-8000-000000000001', 'hab193-admin@example.com'),
  ('19300000-0000-4000-8000-000000000002', 'hab193-board@example.com'),
  ('19300000-0000-4000-8000-000000000003', 'hab193-owner@example.com'),
  ('19300000-0000-4000-8000-000000000004', 'hab193-tenant@example.com'),
  ('19300000-0000-4000-8000-000000000005', 'hab193-reviewer@example.com'),
  ('19300000-0000-4000-8000-000000000006', 'hab193-outsider@example.com'),
  ('19300000-0000-4000-8000-000000000007', 'hab193-other-admin@example.com');

insert into public.organizations(id, name, created_by)
values
  ('19310000-0000-4000-8000-000000000001', 'HAB-193 Organization A', '19300000-0000-4000-8000-000000000001'),
  ('19310000-0000-4000-8000-000000000002', 'HAB-193 Organization B', '19300000-0000-4000-8000-000000000007');

insert into public.condominiums(id, organization_id, name, created_by)
values
  ('19320000-0000-4000-8000-000000000001', '19310000-0000-4000-8000-000000000001', 'HAB-193 Condominium A', '19300000-0000-4000-8000-000000000001'),
  ('19320000-0000-4000-8000-000000000002', '19310000-0000-4000-8000-000000000002', 'HAB-193 Condominium B', '19300000-0000-4000-8000-000000000007');

insert into public.organization_memberships(organization_id, user_id, role)
values
  ('19310000-0000-4000-8000-000000000001', '19300000-0000-4000-8000-000000000001', 'organization_owner'),
  ('19310000-0000-4000-8000-000000000002', '19300000-0000-4000-8000-000000000007', 'organization_owner');

insert into public.condominium_memberships(condominium_id, user_id, role)
values
  ('19320000-0000-4000-8000-000000000001', '19300000-0000-4000-8000-000000000001', 'condominium_admin'),
  ('19320000-0000-4000-8000-000000000001', '19300000-0000-4000-8000-000000000002', 'board_member'),
  ('19320000-0000-4000-8000-000000000001', '19300000-0000-4000-8000-000000000003', 'owner'),
  ('19320000-0000-4000-8000-000000000001', '19300000-0000-4000-8000-000000000004', 'tenant'),
  ('19320000-0000-4000-8000-000000000001', '19300000-0000-4000-8000-000000000005', 'payment_reviewer'),
  ('19320000-0000-4000-8000-000000000002', '19300000-0000-4000-8000-000000000007', 'condominium_admin');

-- HAB-164 requires an active tenant occupancy before a tenant membership grants
-- condominium context. Model a real resident instead of weakening that guard.
insert into public.units(id, condominium_id, code, type, status, created_by)
values ('19330000-0000-4000-8000-000000000001', '19320000-0000-4000-8000-000000000001', 'A-193', 'apartment', 'active', '19300000-0000-4000-8000-000000000001');

insert into public.people(id, condominium_id, auth_user_id, first_name, last_name, email, status, created_by)
values ('19340000-0000-4000-8000-000000000001', '19320000-0000-4000-8000-000000000001', '19300000-0000-4000-8000-000000000004', 'Tenant', 'HAB193', 'hab193-tenant@example.com', 'active', '19300000-0000-4000-8000-000000000001');

insert into public.unit_occupancies(id, unit_id, person_id, occupancy_type, is_primary_contact, starts_at, created_by)
values ('19350000-0000-4000-8000-000000000001', '19330000-0000-4000-8000-000000000001', '19340000-0000-4000-8000-000000000001', 'tenant', true, current_date - 30, '19300000-0000-4000-8000-000000000001');

insert into public.governance_proposals(id, condominium_id, title, description, closes_at, created_by)
values
  ('19390000-0000-4000-8000-000000000001', '19320000-0000-4000-8000-000000000001', 'HAB-193 Proposal A', 'Same condominium', now() + interval '7 days', '19300000-0000-4000-8000-000000000001'),
  ('19390000-0000-4000-8000-000000000002', '19320000-0000-4000-8000-000000000002', 'HAB-193 Proposal B', 'Other condominium', now() + interval '7 days', '19300000-0000-4000-8000-000000000007');

insert into public.community_document_folders(id, condominium_id, name, created_by)
values ('19370000-0000-4000-8000-000000000001', '19320000-0000-4000-8000-000000000002', 'Other Condo Folder', '19300000-0000-4000-8000-000000000007');

set local role authenticated;

select set_config('request.jwt.claims', json_build_object('sub','19300000-0000-4000-8000-000000000005','role','authenticated','email','hab193-reviewer@example.com')::text, true);
select ok(not public.can_manage_community_documents('19320000-0000-4000-8000-000000000001'), 'payment reviewer is not a document manager');

select set_config('request.jwt.claims', json_build_object('sub','19300000-0000-4000-8000-000000000002','role','authenticated','email','hab193-board@example.com')::text, true);
select ok(public.can_manage_community_documents('19320000-0000-4000-8000-000000000001'), 'board member can manage documents');

select set_config('request.jwt.claims', json_build_object('sub','19300000-0000-4000-8000-000000000001','role','authenticated','email','hab193-admin@example.com')::text, true);
select lives_ok($$select public.create_community_document_category('19320000-0000-4000-8000-000000000001','Actas','Actas formales','owners',3650)$$, 'manager creates category');
select lives_ok($$select public.create_community_document_folder('19320000-0000-4000-8000-000000000001','2026',null,'Documentos 2026')$$, 'manager creates folder');
select throws_ok($$select public.create_community_document_folder('19320000-0000-4000-8000-000000000001','Cross tenant','19370000-0000-4000-8000-000000000001')$$, 'P0001', 'active parent folder required', 'folder hierarchy cannot cross condominiums');
select lives_ok($$select public.create_community_document('19320000-0000-4000-8000-000000000001','Documento de Administración','Solo administración',(select id from public.community_document_folders where name='2026'),(select id from public.community_document_categories where name='Actas'),'management',null)$$, 'manager creates management document');
select lives_ok($$select public.create_community_document('19320000-0000-4000-8000-000000000001','Documento de Propietarios','Para propietarios',(select id from public.community_document_folders where name='2026'),(select id from public.community_document_categories where name='Actas'),'owners',3650)$$, 'manager creates owner document');
select lives_ok($$select public.create_community_document('19320000-0000-4000-8000-000000000001','Documento de Residentes','Para residentes',(select id from public.community_document_folders where name='2026'),null,'residents',null)$$, 'manager creates resident document');
select throws_ok($$select public.create_community_document('19320000-0000-4000-8000-000000000001','Documento Inválido',null,'19370000-0000-4000-8000-000000000001',null,'residents',null)$$, 'P0001', 'active folder required', 'document cannot reference another condominium folder');

select set_config('hab193.owner_document_id',(select id::text from public.community_documents where title='Documento de Propietarios'),true);
select lives_ok(format($q$select public.record_community_document_version('%s','19380000-0000-4000-8000-000000000001','acta-1.pdf','application/pdf',1024,'%s','community-documents/19320000-0000-4000-8000-000000000001/%s/19380000-0000-4000-8000-000000000001','Versión inicial')$q$, current_setting('hab193.owner_document_id'), repeat('a',64), current_setting('hab193.owner_document_id')), 'manager appends first immutable version');
select is((select version_number from public.community_document_versions where id='19380000-0000-4000-8000-000000000001'),1,'first version is numbered one');
select lives_ok(format($q$select public.record_community_document_version('%s','19380000-0000-4000-8000-000000000002','acta-2.pdf','application/pdf',2048,'%s','community-documents/19320000-0000-4000-8000-000000000001/%s/19380000-0000-4000-8000-000000000002','Corrección aprobada')$q$, current_setting('hab193.owner_document_id'), repeat('b',64), current_setting('hab193.owner_document_id')), 'manager appends second immutable version');
select is((select latest_version_number from public.community_documents where id=current_setting('hab193.owner_document_id')::uuid),2,'logical document tracks latest version');
select is((select count(*)::integer from public.community_document_versions where document_id=current_setting('hab193.owner_document_id')::uuid),2,'both historical versions remain');
select ok((select storage_key from public.community_document_versions where id='19380000-0000-4000-8000-000000000001') like 'community-documents/19320000-0000-4000-8000-000000000001/%/19380000-0000-4000-8000-000000000001','version storage key is canonical and condominium scoped');
select lives_ok(format($q$select public.link_community_document('%s','proposal','19390000-0000-4000-8000-000000000001')$q$,current_setting('hab193.owner_document_id')),'manager links same-condominium proposal');
select throws_ok(format($q$select public.link_community_document('%s','proposal','19390000-0000-4000-8000-000000000002')$q$,current_setting('hab193.owner_document_id')),'P0001','related record not found in condominium','links cannot cross condominiums');

select set_config('request.jwt.claims', json_build_object('sub','19300000-0000-4000-8000-000000000003','role','authenticated','email','hab193-owner@example.com')::text, true);
select is((select count(*)::integer from public.community_documents where condominium_id='19320000-0000-4000-8000-000000000001'),2,'owner sees owner and resident documents');
select is((select count(*)::integer from public.community_document_versions where document_id=current_setting('hab193.owner_document_id')::uuid),2,'owner reads authorized document versions');
select lives_ok(format($q$select public.record_community_document_download('%s','19380000-0000-4000-8000-000000000002')$q$,current_setting('hab193.owner_document_id')),'authorized owner records download audit');
select is((select count(*)::integer from public.community_document_download_events where actor_user_id='19300000-0000-4000-8000-000000000003'),1,'audit records authenticated owner');

select set_config('request.jwt.claims', json_build_object('sub','19300000-0000-4000-8000-000000000004','role','authenticated','email','hab193-tenant@example.com')::text, true);
select is((select count(*)::integer from public.community_documents where condominium_id='19320000-0000-4000-8000-000000000001'),1,'tenant with active occupancy sees resident documents only');
select throws_ok(format($q$select public.record_community_document_download('%s','19380000-0000-4000-8000-000000000002')$q$,current_setting('hab193.owner_document_id')),'P0001','community document access denied','tenant with known owner document id cannot download it');

select set_config('request.jwt.claims', json_build_object('sub','19300000-0000-4000-8000-000000000006','role','authenticated','email','hab193-outsider@example.com')::text, true);
select is((select count(*)::integer from public.community_documents),0,'outsider cannot discover document metadata');
select is((select count(*)::integer from public.community_document_categories),0,'outsider cannot discover categories');

select set_config('request.jwt.claims', json_build_object('sub','19300000-0000-4000-8000-000000000001','role','authenticated','email','hab193-admin@example.com')::text, true);
select lives_ok($$select public.archive_community_document((select id from public.community_documents where title='Documento de Residentes'))$$,'manager archives rather than deletes');

select set_config('request.jwt.claims', json_build_object('sub','19300000-0000-4000-8000-000000000004','role','authenticated','email','hab193-tenant@example.com')::text, true);
select is((select count(*)::integer from public.community_documents),0,'archived resident document is hidden from tenant');

select set_config('request.jwt.claims', json_build_object('sub','19300000-0000-4000-8000-000000000001','role','authenticated','email','hab193-admin@example.com')::text, true);
select is((select count(*)::integer from public.community_documents where status='archived'),1,'manager retains archived history');
select is((select count(*)::integer from public.community_document_download_events),1,'manager can inspect condominium download audit');
select throws_ok($$insert into public.community_document_categories(condominium_id,name,created_by) values ('19320000-0000-4000-8000-000000000001','Direct Write','19300000-0000-4000-8000-000000000001')$$,'42501','permission denied for table community_document_categories','authenticated user cannot bypass lifecycle RPCs');

reset role;
select throws_ok($$update public.community_document_versions set change_note='tampered' where id='19380000-0000-4000-8000-000000000001'$$,'P0001','community document history is immutable','version metadata cannot be rewritten');
select throws_ok($$delete from public.community_document_versions where id='19380000-0000-4000-8000-000000000001'$$,'P0001','community document history is immutable','version history cannot be deleted');
select throws_ok($$update public.community_document_download_events set occurred_at=now()-interval '1 day'$$,'P0001','community document history is immutable','download audit cannot be rewritten');
select throws_ok($$delete from public.community_documents where id=current_setting('hab193.owner_document_id')::uuid$$,'P0001','community documents must be archived, not deleted','logical document cannot be hard deleted');

select * from finish();
rollback;
