begin;
select plan(11);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-0000000004a1',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'hab133-notify-admin@test.local', 'x',
    '{"full_name":"HAB-133 Notify Admin"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-0000000004a2',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'hab133-notify-assistant@test.local', 'x',
    '{"full_name":"HAB-133 Notify Assistant"}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000004a1', true);

create temporary table hab133_notify_workspace as
select public.create_admin_workspace(
  'Habitta HAB-133 Notifications',
  'independent',
  'Condominio HAB-133 Notifications',
  'VE',
  'Caracas',
  'America/Caracas',
  'USD',
  'VES',
  10,
  'Torre Notifications'
) as payload;

reset role;

insert into public.condominium_memberships (condominium_id, user_id, role)
values (
  (select (payload #>> '{condominium,id}')::uuid from hab133_notify_workspace),
  '00000000-0000-0000-0000-0000000004a2',
  'assistant'
);

insert into public.vendors (id, condominium_id, name, created_by)
values (
  '00000000-0000-0000-0000-0000000004b1',
  (select (payload #>> '{condominium,id}')::uuid from hab133_notify_workspace),
  'Proveedor HAB-133 Notifications',
  '00000000-0000-0000-0000-0000000004a1'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000004a1', true);

create temporary table hab133_notify_order as
select public.create_maintenance_work_order(
  (select (payload #>> '{condominium,id}')::uuid from hab133_notify_workspace),
  null,
  null,
  '00000000-0000-0000-0000-0000000004b1',
  null,
  'corrective',
  'high',
  'Reparar sistema de bombeo',
  'Validar notificaciones operativas end-to-end para mantenimiento.',
  now() + interval '1 day',
  current_date + 2
) as work_order;

create temporary table hab133_notify_quote_one as
select public.create_maintenance_quote(
  (select (payload #>> '{condominium,id}')::uuid from hab133_notify_workspace),
  (select (work_order).id from hab133_notify_order),
  '00000000-0000-0000-0000-0000000004b1',
  850,
  'USD',
  'N-Q-001',
  current_date + 10,
  'Cotización que será aprobada.'
) as quote;

create temporary table hab133_notify_quote_two as
select public.create_maintenance_quote(
  (select (payload #>> '{condominium,id}')::uuid from hab133_notify_workspace),
  (select (work_order).id from hab133_notify_order),
  '00000000-0000-0000-0000-0000000004b1',
  900,
  'USD',
  'N-Q-002',
  current_date + 10,
  'Cotización alternativa.'
) as quote;

create temporary table hab133_notify_quote_rejected as
select public.create_maintenance_quote(
  (select (payload #>> '{condominium,id}')::uuid from hab133_notify_workspace),
  (select (work_order).id from hab133_notify_order),
  '00000000-0000-0000-0000-0000000004b1',
  1100,
  'USD',
  'N-Q-003',
  current_date + 10,
  'Cotización que será rechazada.'
) as quote;

select public.decide_maintenance_quote(
  (select (payload #>> '{condominium,id}')::uuid from hab133_notify_workspace),
  (select (quote).id from hab133_notify_quote_rejected),
  'reject',
  'Costo fuera del presupuesto aprobado.'
);

select public.decide_maintenance_quote(
  (select (payload #>> '{condominium,id}')::uuid from hab133_notify_workspace),
  (select (quote).id from hab133_notify_quote_one),
  'approve',
  'Cotización seleccionada para ejecución.'
);

select public.record_maintenance_attachment(
  (select (payload #>> '{condominium,id}')::uuid from hab133_notify_workspace),
  (select (work_order).id from hab133_notify_order),
  null,
  '00000000-0000-0000-0000-0000000004c1',
  'completion_photo',
  'maintenance/00000000-0000-0000-0000-0000000004c1',
  'evidencia-notificaciones.jpg',
  'image/jpeg',
  4096,
  repeat('c', 64)
);

create temporary table hab133_notify_expense as
select public.create_expense(
  (select (payload #>> '{condominium,id}')::uuid from hab133_notify_workspace),
  (
    select id from public.expense_categories
    where condominium_id = (select (payload #>> '{condominium,id}')::uuid from hab133_notify_workspace)
      and code = 'maintenance'
  ),
  '00000000-0000-0000-0000-0000000004b1',
  'Reparación sistema de bombeo',
  'INV-HAB133-NOTIFY',
  current_date,
  current_date + 5,
  850,
  'USD',
  null,
  null,
  null,
  'Gasto para validar evento maintenance_expense_linked.'
) as expense;

select public.link_maintenance_expense(
  (select (payload #>> '{condominium,id}')::uuid from hab133_notify_workspace),
  (select (work_order).id from hab133_notify_order),
  (select (expense).id from hab133_notify_expense),
  (select (quote).id from hab133_notify_quote_one)
);

select is(
  (select count(*) from public.notification_events where event_type = 'maintenance_quote_submitted'),
  3::bigint,
  'each submitted maintenance quote emits exactly one operational event'
);
select is(
  (select count(*) from public.notification_events where event_type = 'maintenance_quote_rejected'),
  1::bigint,
  'rejected maintenance quote emits its operational event'
);
select is(
  (select count(*) from public.notification_events where event_type = 'maintenance_quote_approved'),
  1::bigint,
  'approved maintenance quote emits its operational event'
);
select is(
  (select count(*) from public.notification_events where event_type = 'maintenance_evidence_added'),
  1::bigint,
  'maintenance evidence emits its operational event'
);
select is(
  (select count(*) from public.notification_events where event_type = 'maintenance_expense_linked'),
  1::bigint,
  'linked maintenance expense emits its operational event'
);

select ok(
  (select count(*) > 0 from public.notifications where notification_type = 'maintenance_quote_submitted'),
  'submitted quote event expands to in-app notifications'
);
select ok(
  (select count(*) > 0 from public.notifications where notification_type = 'maintenance_quote_rejected'),
  'rejected quote event expands to in-app notifications'
);
select ok(
  (select count(*) > 0 from public.notifications where notification_type = 'maintenance_quote_approved'),
  'approved quote event expands to in-app notifications'
);
select ok(
  (select count(*) > 0 from public.notifications where notification_type = 'maintenance_evidence_added'),
  'evidence event expands to in-app notifications'
);
select ok(
  (select count(*) > 0 from public.notifications where notification_type = 'maintenance_expense_linked'),
  'expense-link event expands to in-app notifications'
);

select ok(
  not exists (
    select 1
    from public.notification_deliveries d
    join public.notification_events e on e.id = d.event_id
    where e.event_type in (
      'maintenance_quote_submitted',
      'maintenance_quote_rejected',
      'maintenance_quote_approved',
      'maintenance_evidence_added',
      'maintenance_expense_linked'
    )
      and d.status <> 'skipped'
  ),
  'HAB-130 keeps all maintenance email deliveries fail-closed while live email is disabled'
);

select * from finish();
rollback;
