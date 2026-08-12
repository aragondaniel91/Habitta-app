begin;
select plan(19);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-0000000003a1',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'hab133-admin@test.local', 'x',
    '{"full_name":"HAB-133 Admin"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-0000000003a2',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'hab133-assistant@test.local', 'x',
    '{"full_name":"HAB-133 Assistant"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-0000000003a3',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'hab133-outsider@test.local', 'x',
    '{}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000003a1', true);

create temporary table hab133_workspace as
select public.create_admin_workspace(
  'Habitta HAB-133',
  'independent',
  'Condominio HAB-133',
  'VE',
  'Caracas',
  'America/Caracas',
  'USD',
  'VES',
  10,
  'Torre HAB-133'
) as payload;

reset role;

insert into public.condominium_memberships (condominium_id, user_id, role)
values (
  (select (payload #>> '{condominium,id}')::uuid from hab133_workspace),
  '00000000-0000-0000-0000-0000000003a2',
  'assistant'
);

insert into public.vendors (id, condominium_id, name, created_by)
values (
  '00000000-0000-0000-0000-0000000003b1',
  (select (payload #>> '{condominium,id}')::uuid from hab133_workspace),
  'Servicios Técnicos HAB-133',
  '00000000-0000-0000-0000-0000000003a1'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000003a1', true);

create temporary table hab133_order as
select public.create_maintenance_work_order(
  (select (payload #>> '{condominium,id}')::uuid from hab133_workspace),
  null,
  null,
  '00000000-0000-0000-0000-0000000003b1',
  null,
  'corrective',
  'high',
  'Reparar bomba de agua',
  'Diagnosticar la falla, cotizar la reparación y documentar el cierre.',
  now() + interval '1 day',
  current_date + 2
) as work_order;

create temporary table hab133_quote_one as
select public.create_maintenance_quote(
  (select (payload #>> '{condominium,id}')::uuid from hab133_workspace),
  (select (work_order).id from hab133_order),
  '00000000-0000-0000-0000-0000000003b1',
  850,
  'usd',
  'Q-001',
  current_date + 10,
  'Incluye repuestos y mano de obra.'
) as quote;

select is(
  (select (quote).status from hab133_quote_one),
  'submitted'::text,
  'maintenance quote starts submitted'
);
select is(
  (select count(*) from public.maintenance_events where metadata->>'change' = 'quote_submitted'),
  1::bigint,
  'quote submission is audited on the work order'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000003a2', true);

create temporary table hab133_quote_two as
select public.create_maintenance_quote(
  (select (payload #>> '{condominium,id}')::uuid from hab133_workspace),
  (select (work_order).id from hab133_order),
  '00000000-0000-0000-0000-0000000003b1',
  900,
  'USD',
  'Q-002',
  current_date + 12,
  'Alternativa preparada por el asistente.'
) as quote;

select is(
  (select count(*) from public.maintenance_quotes),
  2::bigint,
  'assistant can collect maintenance quotes'
);
select throws_like(
  format(
    'select public.decide_maintenance_quote(%L::uuid,%L::uuid,%L,null)',
    (select payload #>> '{condominium,id}' from hab133_workspace),
    (select (quote).id::text from hab133_quote_two),
    'approve'
  ),
  '%maintenance approval denied%',
  'assistant cannot approve a maintenance quote'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000003a1', true);

create temporary table hab133_quote_approved as
select public.decide_maintenance_quote(
  (select (payload #>> '{condominium,id}')::uuid from hab133_workspace),
  (select (quote).id from hab133_quote_one),
  'approve',
  'Aprobada por costo y alcance.'
) as quote;

select is(
  (select (quote).status from hab133_quote_approved),
  'approved'::text,
  'administrator approves the selected quote'
);
select is(
  (
    select q.status
    from public.maintenance_quotes q
    where q.id = (select (quote).id from hab133_quote_two)
  ),
  'superseded'::text,
  'other submitted quotes are superseded after approval'
);
select is(
  (select count(*) from public.maintenance_events where metadata->>'change' = 'quote_approved'),
  1::bigint,
  'quote approval is audited'
);

create temporary table hab133_quote_attachment as
select public.record_maintenance_attachment(
  (select (payload #>> '{condominium,id}')::uuid from hab133_workspace),
  (select (work_order).id from hab133_order),
  (select (quote).id from hab133_quote_approved),
  '00000000-0000-0000-0000-0000000003c1',
  'quote',
  'maintenance/00000000-0000-0000-0000-0000000003c1',
  'cotizacion-q001.pdf',
  'application/pdf',
  2048,
  repeat('a', 64)
) as attachment;

select is(
  (select (attachment).document_type from hab133_quote_attachment),
  'quote'::text,
  'quote document metadata is recorded privately'
);

create temporary table hab133_completion_attachment as
select public.record_maintenance_attachment(
  (select (payload #>> '{condominium,id}')::uuid from hab133_workspace),
  (select (work_order).id from hab133_order),
  null,
  '00000000-0000-0000-0000-0000000003c2',
  'completion_photo',
  'maintenance/00000000-0000-0000-0000-0000000003c2',
  'bomba-reparada.jpg',
  'image/jpeg',
  4096,
  repeat('b', 64)
) as attachment;

select is(
  (select (attachment).document_type from hab133_completion_attachment),
  'completion_photo'::text,
  'completion evidence metadata is recorded'
);
select ok(
  public.maintenance_work_order_has_completion_evidence(
    (select (payload #>> '{condominium,id}')::uuid from hab133_workspace),
    (select (work_order).id from hab133_order)
  ),
  'work order reports that completion evidence exists'
);

reset role;
select throws_like(
  format(
    'update public.maintenance_attachments set original_filename = %L where id = %L::uuid',
    'alterado.jpg',
    '00000000-0000-0000-0000-0000000003c2'
  ),
  '%maintenance_attachments records are immutable%',
  'maintenance evidence metadata is append-only'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000003a1', true);

create temporary table hab133_expense as
select public.create_expense(
  (select (payload #>> '{condominium,id}')::uuid from hab133_workspace),
  (
    select id from public.expense_categories
    where condominium_id = (select (payload #>> '{condominium,id}')::uuid from hab133_workspace)
      and code = 'maintenance'
  ),
  '00000000-0000-0000-0000-0000000003b1',
  'Reparación de bomba de agua',
  'INV-HAB133-01',
  current_date,
  current_date + 5,
  850,
  'USD',
  null,
  null,
  null,
  'Gasto originado por la orden de mantenimiento.'
) as expense;

create temporary table hab133_expense_link as
select public.link_maintenance_expense(
  (select (payload #>> '{condominium,id}')::uuid from hab133_workspace),
  (select (work_order).id from hab133_order),
  (select (expense).id from hab133_expense),
  (select (quote).id from hab133_quote_approved)
) as link;

select is(
  (select count(*) from public.maintenance_work_order_expenses),
  1::bigint,
  'work order links to the existing expense ledger record'
);
select is(
  (select (expense).amount from hab133_expense),
  850.00::numeric,
  'maintenance link does not duplicate or rewrite expense money'
);

select public.link_maintenance_expense(
  (select (payload #>> '{condominium,id}')::uuid from hab133_workspace),
  (select (work_order).id from hab133_order),
  (select (expense).id from hab133_expense),
  (select (quote).id from hab133_quote_approved)
);

select is(
  (select count(*) from public.maintenance_work_order_expenses),
  1::bigint,
  'repeated maintenance expense link is idempotent'
);

reset role;
select throws_like(
  format(
    'delete from public.maintenance_work_order_expenses where id = %L::uuid',
    (select (link).id::text from hab133_expense_link)
  ),
  '%maintenance_work_order_expenses records are immutable%',
  'maintenance financial links are append-only'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000003a3', true);

select is(
  (select count(*) from public.maintenance_quotes),
  0::bigint,
  'outsider cannot read maintenance quotes'
);
select is(
  (select count(*) from public.maintenance_attachments),
  0::bigint,
  'outsider cannot read maintenance evidence'
);
select is(
  (select count(*) from public.maintenance_work_order_expenses),
  0::bigint,
  'outsider cannot read maintenance financial links'
);
select throws_like(
  format(
    'select public.maintenance_work_order_has_completion_evidence(%L::uuid,%L::uuid)',
    (select payload #>> '{condominium,id}' from hab133_workspace),
    (select (work_order).id::text from hab133_order)
  ),
  '%maintenance reader required%',
  'outsider cannot probe completion evidence'
);

select * from finish();
rollback;
