begin;
select plan(18);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-0000000000f1',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'documents-admin@test.local', 'x',
    '{"full_name":"Documents Admin"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-0000000000f2',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'documents-outsider@test.local', 'x',
    '{}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);

create temporary table private_documents_workspace as
select public.create_admin_workspace(
  'Habitta Private Documents Test',
  'independent',
  'Condominio Documentos',
  'VE',
  'Caracas',
  'America/Caracas',
  'USD',
  'VES',
  10,
  'Torre Documentos'
) as payload;

create temporary table private_documents_expense as
select public.create_expense(
  (select (payload #>> '{condominium,id}')::uuid from private_documents_workspace),
  (
    select id from public.expense_categories
    where condominium_id = (select (payload #>> '{condominium,id}')::uuid from private_documents_workspace)
    order by code limit 1
  ),
  null,
  'Factura privada',
  'DOC-001',
  current_date,
  null,
  25.00,
  'USD',
  null,
  null,
  null,
  null
) as expense;

create temporary table private_documents_proposal as
select public.create_governance_proposal(
  (select (payload #>> '{condominium,id}')::uuid from private_documents_workspace),
  'Propuesta con cotización privada',
  'Documento privado',
  'Prueba de almacenamiento privado.',
  'budget',
  'one_per_unit',
  50,
  100,
  'USD',
  null,
  now() + interval '7 days',
  '[{"label":"Aprobar"},{"label":"Rechazar"}]'::jsonb,
  '[]'::jsonb
) as proposal;

create temporary table private_documents_request as
select public.create_service_request(
  (select (payload #>> '{condominium,id}')::uuid from private_documents_workspace),
  null,
  (
    select id from public.service_request_categories
    where condominium_id = (select (payload #>> '{condominium,id}')::uuid from private_documents_workspace)
    order by sort_order, name limit 1
  ),
  'Solicitud con fotografía',
  'Solicitud para probar un archivo privado.',
  'normal',
  null
) as request;

create temporary table private_documents_announcement as
select public.create_announcement(
  (select (payload #>> '{condominium,id}')::uuid from private_documents_workspace),
  'Anuncio con documento',
  'Resumen del anuncio privado',
  'Contenido del anuncio para pruebas de almacenamiento privado.',
  'normal',
  'everyone',
  null,
  null,
  false,
  null
) as announcement;

select lives_ok(
  format(
    'select public.record_expense_attachment(%L::uuid,%L::uuid,%L::uuid,%L,%L,%L,%L,%s,%L)',
    (select payload #>> '{condominium,id}' from private_documents_workspace),
    (select (expense).id::text from private_documents_expense),
    '00000000-0000-0000-0000-0000000000f3',
    'invoice',
    'expenses/00000000-0000-0000-0000-0000000000f3',
    'factura.pdf',
    'application/pdf',
    100,
    repeat('a', 64)
  ),
  'expense document metadata is recorded'
);
select is(
  (select count(*) from public.expense_events where metadata ->> 'change' = 'attachment_added'),
  1::bigint,
  'expense document creates an audit event'
);
select lives_ok(
  $test$
  do $block$
  begin
    begin
      update public.expense_attachments
      set original_filename = 'changed.pdf'
      where id = '00000000-0000-0000-0000-0000000000f3';
    exception when others then
      null;
    end;

    if (
      select original_filename
      from public.expense_attachments
      where id = '00000000-0000-0000-0000-0000000000f3'
    ) is distinct from 'factura.pdf' then
      raise exception 'expense attachment mutated';
    end if;
  end
  $block$
  $test$,
  'expense documents remain append-only'
);

select lives_ok(
  format(
    'select public.record_governance_attachment(%L::uuid,%L::uuid,%L::uuid,%L,%L,%L,%L,%s,%L)',
    (select payload #>> '{condominium,id}' from private_documents_workspace),
    (select (proposal).id::text from private_documents_proposal),
    '00000000-0000-0000-0000-0000000000f4',
    'quote',
    'governance/00000000-0000-0000-0000-0000000000f4',
    'cotizacion.pdf',
    'application/pdf',
    101,
    repeat('b', 64)
  ),
  'governance document metadata is recorded'
);
select is(
  (select url from public.governance_attachments where id = '00000000-0000-0000-0000-0000000000f4'),
  null,
  'private governance documents do not store a public URL'
);
select lives_ok(
  $test$
  do $block$
  begin
    begin
      update public.governance_attachments
      set file_name = 'changed.pdf'
      where id = '00000000-0000-0000-0000-0000000000f4';
    exception when others then
      null;
    end;

    if (
      select file_name
      from public.governance_attachments
      where id = '00000000-0000-0000-0000-0000000000f4'
    ) is distinct from 'cotizacion.pdf' then
      raise exception 'governance attachment mutated';
    end if;
  end
  $block$
  $test$,
  'governance documents remain append-only'
);

select lives_ok(
  format(
    'select public.record_service_request_attachment(%L::uuid,%L::uuid,null,%L::uuid,%L,%L,%L,%s,%L,%L::public.service_request_visibility)',
    (select payload #>> '{condominium,id}' from private_documents_workspace),
    (select (request).id::text from private_documents_request),
    '00000000-0000-0000-0000-0000000000f5',
    'requests/00000000-0000-0000-0000-0000000000f5',
    'foto.jpg',
    'image/jpeg',
    102,
    repeat('c', 64),
    'public'
  ),
  'service request document metadata is recorded'
);
select is(
  (select count(*) from public.service_request_events where event_type = 'attachment_added'),
  1::bigint,
  'service request document creates an audit event'
);
select lives_ok(
  $test$
  do $block$
  begin
    begin
      update public.service_request_attachments
      set original_filename = 'changed.jpg'
      where id = '00000000-0000-0000-0000-0000000000f5';
    exception when others then
      null;
    end;

    if (
      select original_filename
      from public.service_request_attachments
      where id = '00000000-0000-0000-0000-0000000000f5'
    ) is distinct from 'foto.jpg' then
      raise exception 'service request attachment mutated';
    end if;
  end
  $block$
  $test$,
  'service request documents remain append-only'
);

select lives_ok(
  format(
    'select public.record_announcement_attachment(%L::uuid,%L::uuid,%L::uuid,%L,%L,%L,%s,%L)',
    (select payload #>> '{condominium,id}' from private_documents_workspace),
    (select (announcement).id::text from private_documents_announcement),
    '00000000-0000-0000-0000-0000000000f6',
    'announcements/00000000-0000-0000-0000-0000000000f6',
    'circular.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    103,
    repeat('d', 64)
  ),
  'announcement document metadata is recorded'
);
select is(
  (select count(*) from public.announcement_events where metadata ->> 'change' = 'attachment_added'),
  1::bigint,
  'announcement document creates an audit event'
);
select lives_ok(
  $test$
  do $block$
  begin
    begin
      update public.announcement_attachments
      set original_filename = 'changed.docx'
      where id = '00000000-0000-0000-0000-0000000000f6';
    exception when others then
      null;
    end;

    if (
      select original_filename
      from public.announcement_attachments
      where id = '00000000-0000-0000-0000-0000000000f6'
    ) is distinct from 'circular.docx' then
      raise exception 'announcement attachment mutated';
    end if;
  end
  $block$
  $test$,
  'announcement documents remain append-only'
);

select throws_ok(
  format(
    'select public.record_expense_attachment(%L::uuid,%L::uuid,%L::uuid,%L,%L,%L,%L,%s,%L)',
    (select payload #>> '{condominium,id}' from private_documents_workspace),
    (select (expense).id::text from private_documents_expense),
    '00000000-0000-0000-0000-0000000000f7',
    'invoice',
    'wrong/00000000-0000-0000-0000-0000000000f7',
    'invalid.pdf',
    'application/pdf',
    100,
    repeat('e', 64)
  ),
  'P0001',
  'invalid expense attachment metadata',
  'storage keys must match the authorized namespace'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', true);
select is((select count(*) from public.expense_attachments), 0::bigint, 'outsider cannot read expense documents');
select is((select count(*) from public.governance_attachments), 0::bigint, 'outsider cannot read governance documents');
select is((select count(*) from public.service_request_attachments), 0::bigint, 'outsider cannot read request documents');
select is((select count(*) from public.announcement_attachments), 0::bigint, 'outsider cannot read announcement documents');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);
select is(
  (select count(*) from public.expense_attachments)
  + (select count(*) from public.governance_attachments where storage_key is not null)
  + (select count(*) from public.service_request_attachments)
  + (select count(*) from public.announcement_attachments),
  4::bigint,
  'authorized administrator can read all private document metadata'
);

select * from finish();
rollback;
