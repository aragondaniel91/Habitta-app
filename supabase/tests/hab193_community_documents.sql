begin;

create extension if not exists pgtap with schema extensions;
select plan(40);

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
  (
    '19310000-0000-4000-8000-000000000001',
    'HAB-193 Organization A',
    '19300000-0000-4000-8000-000000000001'
  ),
  (
    '19310000-0000-4000-8000-000000000002',
    'HAB-193 Organization B',
    '19300000-0000-4000-8000-000000000007'
  );

insert into public.condominiums(id, organization_id, name, created_by)
values
  (
    '19320000-0000-4000-8000-000000000001',
    '19310000-0000-4000-8000-000000000001',
    'HAB-193 Condominium A',
    '19300000-0000-4000-8000-000000000001'
  ),
  (
    '19320000-0000-4000-8000-000000000002',
    '19310000-0000-4000-8000-000000000002',
    'HAB-193 Condominium B',
    '19300000-0000-4000-8000-000000000007'
  );

insert into public.organization_memberships(organization_id, user_id, role)
values
  (
    '19310000-0000-4000-8000-000000000001',
    '19300000-0000-4000-8000-000000000001',
    'organization_owner'
  ),
  (
    '19310000-0000-4000-8000-000000000002',
    '19300000-0000-4000-8000-000000000007',
    'organization_owner'
  );

insert into public.condominium_memberships(condominium_id, user_id, role)
values
  ('19320000-0000-4000-8000-000000000001', '19300000-0000-4000-8000-000000000001', 'condominium_admin'),
  ('19320000-0000-4000-8000-000000000001', '19300000-0000-4000-8000-000000000002', 'board_member'),
  ('19320000-0000-4000-8000-000000000001', '19300000-0000-4000-8000-000000000003', 'owner'),
  ('19320000-0000-4000-8000-000000000001', '19300000-0000-4000-8000-000000000004', 'tenant'),
  ('19320000-0000-4000-8000-000000000001', '19300000-0000-4000-8000-000000000005', 'payment_reviewer'),
  ('19320000-0000-4000-8000-000000000002', '19300000-0000-4000-8000-000000000007', 'condominium_admin');

insert into public.governance_proposals(
  id,
  condominium_id,
  title,
  description,
  closes_at,
  created_by
)
values
  (
    '19390000-0000-4000-8000-000000000001',
    '19320000-0000-4000-8000-000000000001',
    'HAB-193 Proposal A',
    'Related-record target in condominium A',
    now() + interval '7 days',
    '19300000-0000-4000-8000-000000000001'
  ),
  (
    '19390000-0000-4000-8000-000000000002',
    '19320000-0000-4000-8000-000000000002',
    'HAB-193 Proposal B',
    'Cross-condominium target',
    now() + interval '7 days',
    '19300000-0000-4000-8000-000000000007'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '19300000-0000-4000-8000-000000000005',
    'role', 'authenticated',
    'email', 'hab193-reviewer@example.com'
  )::text,
  true
);
select ok(
  not public.can_manage_community_documents('19320000-0000-4000-8000-000000000001'),
  'payment reviewer is not implicitly a community document manager'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '19300000-0000-4000-8000-000000000002',
    'role', 'authenticated',
    'email', 'hab193-board@example.com'
  )::text,
  true
);
select ok(
  public.can_manage_community_documents('19320000-0000-4000-8000-000000000001'),
  'active board member can manage community documents'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '19300000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'email', 'hab193-admin@example.com'
  )::text,
  true
);

select lives_ok(
  $$select public.create_community_document_category(
    '19320000-0000-4000-8000-000000000001',
    'Actas',
    'Actas y decisiones formales',
    'owners',
    3650
  )$$,
  'manager can create a document category'
);

select lives_ok(
  $$select public.create_community_document_folder(
    '19320000-0000-4000-8000-000000000001',
    '2026',
    null,
    'Documentos del año 2026'
  )$$,
  'manager can create a root folder'
);

select lives_ok(
  $$select public.create_community_document_folder(
    '19320000-0000-4000-8000-000000000001',
    'Asambleas',
    (select id from public.community_document_folders where name = '2026'),
    'Actas de asambleas'
  )$$,
  'manager can create a child folder in the same condominium'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '19300000-0000-4000-8000-000000000007',
    'role', 'authenticated',
    'email', 'hab193-other-admin@example.com'
  )::text,
  true
);
select lives_ok(
  $$select public.create_community_document_folder(
    '19320000-0000-4000-8000-000000000002',
    'Other Condo Folder'
  )$$,
  'other condominium manager can create its own folder'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '19300000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'email', 'hab193-admin@example.com'
  )::text,
  true
);
select throws_ok(
  $$select public.create_community_document_folder(
    '19320000-0000-4000-8000-000000000001',
    'Cross Condo Child',
    (select id from public.community_document_folders where name = 'Other Condo Folder')
  )$$,
  'P0001',
  'active parent folder required',
  'folder hierarchy cannot cross condominium boundaries'
);

select lives_ok(
  $$select public.create_community_document(
    '19320000-0000-4000-8000-000000000001',
    'Documento de Administración',
    'Solo administración y junta',
    (select id from public.community_document_folders where name = 'Asambleas'),
    (select id from public.community_document_categories where name = 'Actas'),
    'management',
    null
  )$$,
  'manager can create management-only document metadata'
);

select lives_ok(
  $$select public.create_community_document(
    '19320000-0000-4000-8000-000000000001',
    'Documento de Propietarios',
    'Visible para propietarios',
    (select id from public.community_document_folders where name = 'Asambleas'),
    (select id from public.community_document_categories where name = 'Actas'),
    'owners',
    3650
  )$$,
  'manager can create owner-audience document metadata'
);

select lives_ok(
  $$select public.create_community_document(
    '19320000-0000-4000-8000-000000000001',
    'Documento de Residentes',
    'Visible para residentes autorizados',
    (select id from public.community_document_folders where name = '2026'),
    null,
    'residents',
    null
  )$$,
  'manager can create resident-audience document metadata'
);

select throws_ok(
  $$select public.create_community_document(
    '19320000-0000-4000-8000-000000000001',
    'Documento Inválido',
    null,
    (select id from public.community_document_folders where name = 'Other Condo Folder'),
    null,
    'residents',
    null
  )$$,
  'P0001',
  'active folder required',
  'document metadata cannot reference another condominium folder'
);

select lives_ok(
  $$select public.record_community_document_version(
    (select id from public.community_documents where title = 'Documento de Propietarios'),
    '19380000-0000-4000-8000-000000000001',
    'acta-1.pdf',
    'application/pdf',
    1024,
    repeat('a', 64),
    format(
      'community-documents/19320000-0000-4000-8000-000000000001/%s/19380000-0000-4000-8000-000000000001',
      (select id from public.community_documents where title = 'Documento de Propietarios')
    ),
    'Versión inicial'
  )$$,
  'manager can append the first immutable binary version'
);

select is(
  (select version_number from public.community_document_versions where id = '19380000-0000-4000-8000-000000000001'),
  1,
  'first document version is numbered one'
);

select lives_ok(
  $$select public.record_community_document_version(
    (select id from public.community_documents where title = 'Documento de Propietarios'),
    '19380000-0000-4000-8000-000000000002',
    'acta-2.pdf',
    'application/pdf',
    2048,
    repeat('b', 64),
    format(
      'community-documents/19320000-0000-4000-8000-000000000001/%s/19380000-0000-4000-8000-000000000002',
      (select id from public.community_documents where title = 'Documento de Propietarios')
    ),
    'Corrección aprobada'
  )$$,
  'manager can append a second version without mutating history'
);

select is(
  (select latest_version_number from public.community_documents where title = 'Documento de Propietarios'),
  2,
  'logical document tracks its latest immutable version number'
);

select is(
  (select count(*)::integer from public.community_document_versions where document_id = (
    select id from public.community_documents where title = 'Documento de Propietarios'
  )),
  2,
  'both historical versions remain stored'
);

select like(
  (select storage_key from public.community_document_versions where id = '19380000-0000-4000-8000-000000000001'),
  'community-documents/19320000-0000-4000-8000-000000000001/%/19380000-0000-4000-8000-000000000001',
  'version storage key is canonical and condominium scoped'
);

select lives_ok(
  $$select public.link_community_document(
    (select id from public.community_documents where title = 'Documento de Propietarios'),
    'proposal',
    '19390000-0000-4000-8000-000000000001'
  )$$,
  'manager can link a document to a real same-condominium proposal'
);

select throws_ok(
  $$select public.link_community_document(
    (select id from public.community_documents where title = 'Documento de Propietarios'),
    'proposal',
    '19390000-0000-4000-8000-000000000002'
  )$$,
  'P0001',
  'related record not found in condominium',
  'related-record links cannot cross condominium boundaries'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '19300000-0000-4000-8000-000000000003',
    'role', 'authenticated',
    'email', 'hab193-owner@example.com'
  )::text,
  true
);
select is(
  (select count(*)::integer from public.community_documents where condominium_id = '19320000-0000-4000-8000-000000000001'),
  2,
  'owner sees owner and resident documents but not management-only documents'
);
select is(
  (select count(*)::integer from public.community_document_versions where document_id = (
    select id from public.community_documents where title = 'Documento de Propietarios'
  )),
  2,
  'owner can read all versions of an authorized document'
);
select lives_ok(
  $$select public.record_community_document_download(
    (select id from public.community_documents where title = 'Documento de Propietarios'),
    '19380000-0000-4000-8000-000000000002'
  )$$,
  'authorized owner can create a download audit event'
);
select is(
  (select count(*)::integer from public.community_document_download_events where actor_user_id = '19300000-0000-4000-8000-000000000003'),
  1,
  'download audit records the authenticated actor'
);
select is(
  (select count(*)::integer from public.community_document_download_events),
  1,
  'actor can read their own download history'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '19300000-0000-4000-8000-000000000004',
    'role', 'authenticated',
    'email', 'hab193-tenant@example.com'
  )::text,
  true
);
select is(
  (select count(*)::integer from public.community_documents where condominium_id = '19320000-0000-4000-8000-000000000001'),
  1,
  'tenant sees resident-audience documents only'
);
select throws_ok(
  $$select public.record_community_document_download(
    (select id from public.community_documents where title = 'Documento de Propietarios'),
    '19380000-0000-4000-8000-000000000002'
  )$$,
  'P0001',
  'community document access denied',
  'tenant cannot download an owner-audience document'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '19300000-0000-4000-8000-000000000006',
    'role', 'authenticated',
    'email', 'hab193-outsider@example.com'
  )::text,
  true
);
select is(
  (select count(*)::integer from public.community_documents),
  0,
  'outsider cannot discover community document metadata'
);
select is(
  (select count(*)::integer from public.community_document_categories),
  0,
  'outsider cannot discover document categories from another condominium'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '19300000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'email', 'hab193-admin@example.com'
  )::text,
  true
);
select lives_ok(
  $$select public.archive_community_document(
    (select id from public.community_documents where title = 'Documento de Residentes')
  )$$,
  'manager archives instead of deleting a document'
);
select is(
  (select status::text from public.community_documents where title = 'Documento de Residentes'),
  'archived',
  'archived document keeps explicit lifecycle state'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '19300000-0000-4000-8000-000000000004',
    'role', 'authenticated',
    'email', 'hab193-tenant@example.com'
  )::text,
  true
);
select is(
  (select count(*)::integer from public.community_documents),
  0,
  'archived resident document is no longer visible to a tenant'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '19300000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'email', 'hab193-admin@example.com'
  )::text,
  true
);
select is(
  (select count(*)::integer from public.community_documents where status = 'archived'),
  1,
  'manager retains visibility of archived document history'
);
select is(
  (select count(*)::integer from public.community_document_download_events),
  1,
  'manager can inspect condominium download audit history'
);
select throws_ok(
  $$insert into public.community_document_categories(
    condominium_id, name, created_by
  ) values (
    '19320000-0000-4000-8000-000000000001',
    'Direct Write',
    '19300000-0000-4000-8000-000000000001'
  )$$,
  '42501',
  'permission denied for table community_document_categories',
  'authenticated users cannot bypass lifecycle RPCs with direct inserts'
);

reset role;
select throws_ok(
  $$update public.community_document_versions
    set change_note = 'tampered'
    where id = '19380000-0000-4000-8000-000000000001'$$,
  'P0001',
  'community document history is immutable',
  'document version metadata cannot be rewritten even by privileged SQL'
);
select throws_ok(
  $$delete from public.community_document_versions
    where id = '19380000-0000-4000-8000-000000000001'$$,
  'P0001',
  'community document history is immutable',
  'document version history cannot be deleted'
);
select throws_ok(
  $$update public.community_document_download_events
    set occurred_at = now() - interval '1 day'$$,
  'P0001',
  'community document history is immutable',
  'download audit cannot be rewritten'
);
select throws_ok(
  $$delete from public.community_documents
    where title = 'Documento de Propietarios'$$,
  'P0001',
  'community documents must be archived, not deleted',
  'logical documents cannot be hard deleted'
);

select * from finish();
rollback;
