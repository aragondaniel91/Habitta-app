begin;
select plan(27);

select has_function(
  'public',
  'update_community_document_category',
  array['uuid','uuid','text','text','public.community_document_audience','integer','boolean'],
  'document category correction RPC exists'
);
select has_function(
  'public',
  'update_community_document_folder',
  array['uuid','uuid','text','uuid','text','boolean'],
  'document folder correction RPC exists'
);
select is(
  (select count(*) from pg_policies where schemaname='public' and tablename='community_document_folders' and cmd='UPDATE'),
  0::bigint,
  'no row level policy lets a client update folders outside the RPC'
);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000036301', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab360d-admin@test.local', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000036302', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab360d-owner@test.local', 'x', now(), now());

insert into public.organizations (id, name, created_by)
values ('36300000-0000-4000-8000-000000000001', 'HAB 360D Org', '00000000-0000-0000-0000-000000036301');

insert into public.condominiums (id, organization_id, name, created_by)
values ('36310000-0000-4000-8000-000000000001', '36300000-0000-4000-8000-000000000001', 'HAB 360D Condo', '00000000-0000-0000-0000-000000036301');

insert into public.organization_memberships (organization_id, user_id, role)
values ('36300000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000036301', 'organization_owner');

insert into public.condominium_memberships (condominium_id, user_id, role)
values
  ('36310000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000036301', 'condominium_admin'),
  ('36310000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000036302', 'owner');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000036301', true);

select lives_ok(
  $$select public.create_community_document_category('36310000-0000-4000-8000-000000000001','Actas','Actas de asamblea','management',null)$$,
  'administrator creates a category'
);
select lives_ok(
  $$select public.create_community_document_folder('36310000-0000-4000-8000-000000000001','Raiz',null,'Carpeta raiz')$$,
  'administrator creates the root folder'
);
select lives_ok(
  $$select public.create_community_document_folder('36310000-0000-4000-8000-000000000001','Hija',(select id from public.community_document_folders where name='Raiz'),'Subcarpeta')$$,
  'administrator creates a child folder'
);
select lives_ok(
  $$select public.create_community_document_folder('36310000-0000-4000-8000-000000000001','Nieta',(select id from public.community_document_folders where name='Hija'),'Sub-subcarpeta')$$,
  'administrator creates a grandchild folder'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000036302', true);
select throws_ok(
  $$select public.update_community_document_category('36310000-0000-4000-8000-000000000001',(select id from public.community_document_categories where name='Actas'),'Intento propietario')$$,
  'P0001',
  'community document manager required',
  'a resident cannot edit the document catalog'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000036301', true);

select lives_ok(
  $$select public.update_community_document_category('36310000-0000-4000-8000-000000000001',(select id from public.community_document_categories where name='Actas'),'Actas de asamblea','Documento oficial de cada asamblea','owners',365)$$,
  'the category is corrected'
);
select is(
  (select default_retention_days from public.community_document_categories where name='Actas de asamblea'),
  365,
  'the retention default is corrected'
);
select is(
  (select default_audience from public.community_document_categories where name='Actas de asamblea'),
  'owners'::public.community_document_audience,
  'the default audience is corrected'
);
select throws_ok(
  $$select public.update_community_document_category('36310000-0000-4000-8000-000000000001',(select id from public.community_document_categories where name='Actas de asamblea'),'  ')$$,
  'P0001',
  'invalid category name',
  'a blank category name is rejected'
);

-- Reparenting must never detach a subtree from the condominium root.
select throws_ok(
  $$select public.update_community_document_folder('36310000-0000-4000-8000-000000000001',(select id from public.community_document_folders where name='Raiz'),'Raiz',(select id from public.community_document_folders where name='Raiz'))$$,
  'P0001',
  'folder cannot contain itself',
  'a folder cannot be its own parent'
);
select throws_ok(
  $$select public.update_community_document_folder('36310000-0000-4000-8000-000000000001',(select id from public.community_document_folders where name='Raiz'),'Raiz',(select id from public.community_document_folders where name='Nieta'))$$,
  'P0001',
  'folder cannot contain itself',
  'a folder cannot be reparented under its own descendant'
);
select lives_ok(
  $$select public.update_community_document_folder('36310000-0000-4000-8000-000000000001',(select id from public.community_document_folders where name='Nieta'),'Nieta movida',(select id from public.community_document_folders where name='Raiz'))$$,
  'a folder can be reparented upwards'
);
select is(
  (select parent_folder_id from public.community_document_folders where name='Nieta movida'),
  (select id from public.community_document_folders where name='Raiz'),
  'the new parent is stored'
);

select throws_ok(
  $$select public.update_community_document_folder('36310000-0000-4000-8000-000000000001',(select id from public.community_document_folders where name='Raiz'),'Raiz',null,null,false)$$,
  'P0001',
  'document folder still in use',
  'a folder with active children cannot be archived'
);
select lives_ok(
  $$select public.update_community_document_folder('36310000-0000-4000-8000-000000000001',(select id from public.community_document_folders where name='Hija'),'Hija',(select id from public.community_document_folders where name='Raiz'),null,false)$$,
  'an empty folder can be archived instead of deleted'
);
select is(
  (select is_active from public.community_document_folders where name='Hija'),
  false,
  'archiving deactivates rather than deletes'
);
select is(
  (select count(*) from public.community_document_folders where condominium_id='36310000-0000-4000-8000-000000000001'),
  3::bigint,
  'no folder is ever removed from the catalog'
);

select throws_ok(
  $$update public.community_document_folders set name='bypass' where name='Raiz'$$,
  '42501',
  'permission denied for table community_document_folders',
  'authenticated clients cannot bypass the RPC with a direct folder update'
);

-- Guards the API translates for the administrator but that nothing exercised at runtime.

select throws_ok(
  $$select public.update_community_document_category('36310000-0000-4000-8000-000000000001','36399999-0000-4000-8000-000000000999','Nombre','desc','management',null,null)$$,
  'P0001',
  'document category unavailable',
  'a category id outside this condominium is refused by name'
);
select throws_ok(
  $$select public.update_community_document_folder('36310000-0000-4000-8000-000000000001','36399999-0000-4000-8000-000000000998','Nombre',null,'desc',null)$$,
  'P0001',
  'document folder unavailable',
  'a folder id outside this condominium is refused by name'
);
select throws_ok(
  $$select public.update_community_document_folder('36310000-0000-4000-8000-000000000001',(select id from public.community_document_folders where name='Raiz'),'   ',null,'desc',null)$$,
  'P0001',
  'invalid folder name',
  'a folder cannot be renamed to blank'
);
select throws_ok(
  $$select public.update_community_document_category('36310000-0000-4000-8000-000000000001',(select id from public.community_document_categories where name='Actas de asamblea'),'Actas de asamblea','desc','management',-5,null)$$,
  'P0001',
  'invalid retention days',
  'retention cannot be negative'
);

-- Archiving a category that still classifies live documents would orphan them silently.
select lives_ok(
  $$select public.create_community_document('36310000-0000-4000-8000-000000000001','Acta viva','Documento activo',(select id from public.community_document_folders where name='Nieta movida'),(select id from public.community_document_categories where name='Actas de asamblea'),'management',null)$$,
  'a live document is filed under the category'
);
select throws_ok(
  $$select public.update_community_document_category('36310000-0000-4000-8000-000000000001',(select id from public.community_document_categories where name='Actas de asamblea'),'Actas de asamblea','desc','management',null,false)$$,
  'P0001',
  'document category still in use',
  'a category classifying live documents cannot be archived'
);

select * from finish();
rollback;
