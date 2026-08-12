begin;
select plan(13);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, created_at, updated_at
) values
  ('a5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab165-admin@test.local', 'x', now(), now()),
  ('a5000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab165-owner@test.local', 'x', now(), now()),
  ('a5000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab165-assistant@test.local', 'x', now(), now());

insert into public.organizations (id, name, created_by)
values ('a5100000-0000-0000-0000-000000000001', 'HAB-165 Org', 'a5000000-0000-0000-0000-000000000001');

insert into public.condominiums (id, organization_id, name, created_by)
values (
  'a5110000-0000-0000-0000-000000000001',
  'a5100000-0000-0000-0000-000000000001',
  'Condominio HAB-165',
  'a5000000-0000-0000-0000-000000000001'
);

insert into public.condominium_memberships (condominium_id, user_id, role) values
  ('a5110000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'condominium_admin'),
  ('a5110000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000002', 'owner'),
  ('a5110000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000003', 'assistant');

insert into public.units (id, condominium_id, code, type, created_by)
values (
  'a5111000-0000-0000-0000-000000000001',
  'a5110000-0000-0000-0000-000000000001',
  'H165-1', 'apartment', 'a5000000-0000-0000-0000-000000000001'
);

insert into public.people (
  id, condominium_id, auth_user_id, first_name, last_name, email, created_by
) values (
  'a5112000-0000-0000-0000-000000000001',
  'a5110000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000002',
  'Residente', 'HAB165', 'hab165-owner@test.local',
  'a5000000-0000-0000-0000-000000000001'
);

insert into public.unit_owners (unit_id, person_id, is_primary_contact, created_by)
values (
  'a5111000-0000-0000-0000-000000000001',
  'a5112000-0000-0000-0000-000000000001', true,
  'a5000000-0000-0000-0000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a5000000-0000-0000-0000-000000000002', true);

create temporary table hab165_request as
select public.create_service_request(
  'a5110000-0000-0000-0000-000000000001',
  'a5111000-0000-0000-0000-000000000001',
  (select id from public.service_request_categories
   where condominium_id = 'a5110000-0000-0000-0000-000000000001' and code = 'maintenance'),
  'Fuga en baño principal',
  'La tubería pierde agua y requiere revisión de administración.',
  'high',
  'a5112000-0000-0000-0000-000000000001'
) as request_row;

reset role;

select is(
  (select count(*) from public.notification_events where event_type = 'service_request_submitted'),
  1::bigint,
  'request submission creates exactly one notification event'
);
select is(
  (select count(*) from public.notifications where notification_type = 'service_request_submitted'),
  2::bigint,
  'submission notifies admin and assistant operations recipients'
);
select is(
  (select count(*) from public.notifications
   where notification_type = 'service_request_submitted'
     and recipient_user_id = 'a5000000-0000-0000-0000-000000000002'),
  0::bigint,
  'request submitter is not notified about their own submission'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a5000000-0000-0000-0000-000000000001', true);

select public.update_service_request(
  'a5110000-0000-0000-0000-000000000001',
  (select (request_row).id from hab165_request),
  'acknowledged', null, null, null, false, null, false, null, 1
);
select public.update_service_request(
  'a5110000-0000-0000-0000-000000000001',
  (select (request_row).id from hab165_request),
  'in_progress', null, null, 'a5000000-0000-0000-0000-000000000003', false,
  null, false, null, 2
);

select is(
  (select count(*) from public.notifications
   where notification_type = 'service_request_assigned'
     and recipient_user_id = 'a5000000-0000-0000-0000-000000000003'),
  1::bigint,
  'new assignee receives the assignment notification'
);

select public.add_service_request_comment(
  'a5110000-0000-0000-0000-000000000001',
  (select (request_row).id from hab165_request),
  'INTERNAL-HAB165-SECRET: proveedor pendiente de confirmación.',
  'internal'
);

select is(
  (select count(*) from public.notification_events
   where event_type = 'service_request_resident_attention'),
  0::bigint,
  'internal comment never creates a resident notification event'
);

select public.add_service_request_comment(
  'a5110000-0000-0000-0000-000000000001',
  (select (request_row).id from hab165_request),
  'Necesitamos acceso a la unidad mañana por la mañana.',
  'public'
);

select is(
  (select count(*) from public.notifications
   where notification_type = 'service_request_resident_attention'
     and recipient_user_id = 'a5000000-0000-0000-0000-000000000002'),
  1::bigint,
  'public administration comment notifies the resident'
);

select ok(
  not exists (
    select 1 from public.notification_events
    where payload::text like '%INTERNAL-HAB165-SECRET%'
  ),
  'internal comment text never enters notification payloads'
);

select public.update_service_request(
  'a5110000-0000-0000-0000-000000000001',
  (select (request_row).id from hab165_request),
  'waiting_resident'
);

select is(
  (select count(*) from public.notifications
   where notification_type = 'service_request_resident_attention'
     and recipient_user_id = 'a5000000-0000-0000-0000-000000000002'),
  2::bigint,
  'waiting_resident transition creates a second actionable resident notification'
);

select public.update_service_request(
  'a5110000-0000-0000-0000-000000000001',
  (select (request_row).id from hab165_request),
  'in_progress'
);
select public.update_service_request(
  'a5110000-0000-0000-0000-000000000001',
  (select (request_row).id from hab165_request),
  'resolved', null, null, null, false, null, false,
  'La fuga fue reparada y se verificó el cierre de la válvula.'
);

select is(
  (select count(*) from public.notification_events where event_type = 'service_request_resolved'),
  1::bigint,
  'resolved request emits exactly one resolved notification event'
);
select is(
  (select count(*) from public.notifications
   where notification_type = 'service_request_resolved'
     and recipient_user_id = 'a5000000-0000-0000-0000-000000000002'),
  1::bigint,
  'resident receives the resolved notification'
);

reset role;

select is(
  (select count(*) from public.notification_events
   where aggregate_type = 'service_request'
     and aggregate_id = (select (request_row).id from hab165_request)),
  (select count(distinct deduplication_key) from public.notification_events
   where aggregate_type = 'service_request'
     and aggregate_id = (select (request_row).id from hab165_request)),
  'service request notification events remain deduplicated by timeline event'
);

select ok(
  not exists (
    select 1
    from public.notification_deliveries d
    join public.notification_events e on e.id = d.event_id
    where e.aggregate_type = 'service_request'
      and d.status <> 'skipped'
  ),
  'HAB-130 keeps service-request email deliveries fail-closed'
);

select ok(
  not exists (
    select 1
    from public.notifications n
    join public.notification_events e on e.id = n.event_id
    where e.aggregate_type = 'service_request'
      and n.condominium_id <> 'a5110000-0000-0000-0000-000000000001'
  ),
  'service-request notifications remain condominium scoped'
);

select * from finish();
rollback;
