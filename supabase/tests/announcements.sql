begin;
select plan(51);
select ok(not has_function_privilege('authenticated', 'public.is_current_announcement_recipient(uuid,uuid)'::regprocedure, 'EXECUTE'), 'authenticated users cannot probe a different user announcement eligibility');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@announcements.test', 'x', now(), now()),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@announcements.test', 'x', now(), now()),
  ('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tenant@announcements.test', 'x', now(), now()),
  ('a0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'assistant@announcements.test', 'x', now(), now()),
  ('a0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'board@announcements.test', 'x', now(), now()),
  ('a0000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other@announcements.test', 'x', now(), now()),
  ('a0000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'authorized@announcements.test', 'x', now(), now()),
  ('a0000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'former@announcements.test', 'x', now(), now()),
  ('a0000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stale@announcements.test', 'x', now(), now());

insert into public.organizations (id, name, created_by) values
  ('a1000000-0000-0000-0000-000000000001', 'Announcements A', 'a0000000-0000-0000-0000-000000000001'),
  ('a2000000-0000-0000-0000-000000000002', 'Announcements B', 'a0000000-0000-0000-0000-000000000006');
insert into public.condominiums (id, organization_id, name, created_by) values
  ('a1100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Condo Announcements A', 'a0000000-0000-0000-0000-000000000001'),
  ('a2200000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000002', 'Condo Announcements B', 'a0000000-0000-0000-0000-000000000006');
insert into public.condominium_memberships (condominium_id, user_id, role) values
  ('a1100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'condominium_admin'),
  ('a1100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'owner'),
  ('a1100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'tenant'),
  ('a1100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'assistant'),
  ('a1100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005', 'board_member'),
  ('a1100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000007', 'authorized_occupant'),
  ('a1100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000008', 'owner'),
  ('a1100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000009', 'tenant'),
  ('a2200000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000006', 'condominium_admin');
insert into public.buildings (id, condominium_id, name, created_by) values
  ('a1110000-0000-0000-0000-000000000001', 'a1100000-0000-0000-0000-000000000001', 'Torre Norte', 'a0000000-0000-0000-0000-000000000001');
insert into public.units (id, condominium_id, building_id, code, type, created_by) values
  ('a1120000-0000-0000-0000-000000000001', 'a1100000-0000-0000-0000-000000000001', 'a1110000-0000-0000-0000-000000000001', 'A-1', 'apartment', 'a0000000-0000-0000-0000-000000000001');
insert into public.people (id, condominium_id, auth_user_id, first_name, last_name, email, created_by) values
  ('a1130000-0000-0000-0000-000000000001', 'a1100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'Olivia', 'Owner', 'owner@announcements.test', 'a0000000-0000-0000-0000-000000000001'),
  ('a1130000-0000-0000-0000-000000000002', 'a1100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'Tomás', 'Tenant', 'tenant@announcements.test', 'a0000000-0000-0000-0000-000000000001'),
  ('a1130000-0000-0000-0000-000000000003', 'a1100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000007', 'Ari', 'Authorized', 'authorized@announcements.test', 'a0000000-0000-0000-0000-000000000001'),
  ('a1130000-0000-0000-0000-000000000004', 'a1100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000008', 'Fran', 'Former', 'former@announcements.test', 'a0000000-0000-0000-0000-000000000001'),
  ('a1130000-0000-0000-0000-000000000005', 'a1100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000009', 'Sam', 'Stale', 'stale@announcements.test', 'a0000000-0000-0000-0000-000000000001');
insert into public.unit_owners (unit_id, person_id, is_primary_contact, starts_at, created_by) values
  ('a1120000-0000-0000-0000-000000000001', 'a1130000-0000-0000-0000-000000000001', true, current_date - 5, 'a0000000-0000-0000-0000-000000000001'),
  ('a1120000-0000-0000-0000-000000000001', 'a1130000-0000-0000-0000-000000000004', false, current_date - 5, 'a0000000-0000-0000-0000-000000000001');
insert into public.unit_occupancies (unit_id, person_id, occupancy_type, is_primary_contact, created_by) values
  ('a1120000-0000-0000-0000-000000000001', 'a1130000-0000-0000-0000-000000000002', 'tenant', true, 'a0000000-0000-0000-0000-000000000001'),
  ('a1120000-0000-0000-0000-000000000001', 'a1130000-0000-0000-0000-000000000003', 'authorized_occupant', false, 'a0000000-0000-0000-0000-000000000001');
insert into public.unit_occupancies (unit_id, person_id, occupancy_type, is_primary_contact, starts_at, ends_at, created_by) values
  ('a1120000-0000-0000-0000-000000000001', 'a1130000-0000-0000-0000-000000000005', 'tenant', false, current_date - 2, current_date - 1, 'a0000000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.create_announcement(
    'a1100000-0000-0000-0000-000000000001',
    'Mantenimiento de ascensores',
    'El ascensor norte estará fuera de servicio.',
    'El proveedor realizará mantenimiento preventivo durante la mañana.',
    'important', 'everyone', null, null, true, now() + interval '10 days'
  )$$,
  'administrator creates an announcement draft'
);
select is((select status::text from public.announcements where title='Mantenimiento de ascensores'), 'draft', 'announcement starts as draft');
select is((select count(*) from public.announcement_events where event_type='created'), 1::bigint, 'creation is audited');
select lives_ok(
  $$select public.schedule_announcement(
    'a1100000-0000-0000-0000-000000000001',
    (select id from public.announcements where title='Mantenimiento de ascensores'),
    now() + interval '1 day', 1
  )$$,
  'administrator schedules a draft'
);
select is((select status::text from public.announcements where title='Mantenimiento de ascensores'), 'scheduled', 'schedule changes status');
select is((select count(*) from public.announcement_events where event_type='scheduled'), 1::bigint, 'schedule is audited');
select lives_ok(
  $$select public.unschedule_announcement(
    'a1100000-0000-0000-0000-000000000001',
    (select id from public.announcements where title='Mantenimiento de ascensores'), 2
  )$$,
  'administrator returns a scheduled announcement to draft'
);
select is((select status::text from public.announcements where title='Mantenimiento de ascensores'), 'draft', 'unschedule restores draft');
select lives_ok(
  $$select public.update_announcement(
    'a1100000-0000-0000-0000-000000000001',
    (select id from public.announcements where title='Mantenimiento de ascensores'),
    null, 'Interrupción temporal del ascensor norte.', null, 'urgent', null,
    null, null, true, null, false, 3
  )$$,
  'administrator updates a versioned draft'
);
select is((select version from public.announcements where title='Mantenimiento de ascensores'), 4, 'announcement version increments');
select lives_ok(
  $$select public.publish_announcement(
    'a1100000-0000-0000-0000-000000000001',
    (select id from public.announcements where title='Mantenimiento de ascensores'), 4
  )$$,
  'administrator publishes an announcement'
);
select is((select status::text from public.announcements where title='Mantenimiento de ascensores'), 'published', 'publication changes status');
reset role;
select is((select count(*) from public.announcement_recipients where announcement_id=(select id from public.announcements where title='Mantenimiento de ascensores')), 7::bigint, 'publication snapshots only current relationship and staff recipients');
select is((select count(*) from public.notifications where notification_type='announcement_published'), 7::bigint, 'publication creates in-app notifications');
select is((select count(*) from public.notification_deliveries where template_key='announcement_published'), 7::bigint, 'publication creates email deliveries');
select is((select count(*) from public.announcement_events where event_type='published'), 1::bigint, 'publication is audited');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$update public.announcements set priority='normal' where title='Mantenimiento de ascensores'$$,
  null,
  'permission denied for table announcements',
  'authenticated users cannot directly update announcements'
);
select lives_ok(
  $$select public.create_announcement(
    'a1100000-0000-0000-0000-000000000001',
    'Borrador interno', 'Todavía no se publica.', 'Contenido en preparación.',
    'normal', 'everyone', null, null, false, null
  )$$,
  'administrator can keep another announcement as draft'
);

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', true);
select is((select count(*) from public.announcements where title='Mantenimiento de ascensores'), 1::bigint, 'owner reads a published announcement addressed to them');
select is((select count(*) from public.announcements where title='Borrador interno'), 0::bigint, 'owner cannot read drafts');
select lives_ok(
  $$select public.mark_announcement_read(
    'a1100000-0000-0000-0000-000000000001',
    (select id from public.announcements where title='Mantenimiento de ascensores')
  )$$,
  'recipient marks an announcement as read'
);
select ok((select read_at is not null from public.announcement_recipients where user_id='a0000000-0000-0000-0000-000000000002' and announcement_id=(select id from public.announcements where title='Mantenimiento de ascensores')), 'read timestamp is preserved');
select lives_ok(
  $$select public.acknowledge_announcement(
    'a1100000-0000-0000-0000-000000000001',
    (select id from public.announcements where title='Mantenimiento de ascensores')
  )$$,
  'recipient acknowledges a required announcement'
);
select ok((select acknowledged_at is not null from public.announcement_recipients where user_id='a0000000-0000-0000-0000-000000000002' and announcement_id=(select id from public.announcements where title='Mantenimiento de ascensores')), 'acknowledgement timestamp is preserved');

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', true);
select is((select count(*) from public.announcements where title='Mantenimiento de ascensores'), 1::bigint, 'tenant reads an everyone announcement');

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000007', true);
select is((select count(*) from public.announcements where title='Mantenimiento de ascensores'), 1::bigint, 'authorized occupant with an active relationship reads an everyone announcement');
select is((select count(*) from public.announcement_recipients where user_id='a0000000-0000-0000-0000-000000000009'), 0::bigint, 'expired tenant relationship is excluded at publication despite its membership row');

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000005', true);
select cmp_ok((select count(*) from public.announcement_events where announcement_id=(select id from public.announcements where title='Mantenimiento de ascensores')), '>=', 6::bigint, 'board member reads the full audit timeline');
select throws_ok(
  $$select public.create_announcement(
    'a1100000-0000-0000-0000-000000000001',
    'Board draft', 'Board cannot publish.', 'The board has read-only review access.',
    'normal', 'everyone', null, null, false, null
  )$$,
  null,
  'announcement management denied',
  'board member cannot create announcements'
);

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000004', true);
select lives_ok(
  $$select public.create_announcement(
    'a1100000-0000-0000-0000-000000000001',
    'Asistente prepara aviso', 'Borrador creado por asistencia.', 'Contenido pendiente de revisión administrativa.',
    'normal', 'owners', null, null, false, null
  )$$,
  'assistant can create announcement drafts'
);

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000006', true);
select is((select count(*) from public.announcements where title='Mantenimiento de ascensores'), 0::bigint, 'tenant isolation hides announcements from another condominium');

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
select is((select count(*) from public.announcement_events where event_type='acknowledged'), 1::bigint, 'acknowledgement is audited once');
select lives_ok(
  $$select public.archive_announcement(
    'a1100000-0000-0000-0000-000000000001',
    (select id from public.announcements where title='Mantenimiento de ascensores'), 5
  )$$,
  'administrator archives a published announcement'
);
select is((select status::text from public.announcements where title='Mantenimiento de ascensores'), 'archived', 'archive changes status');
select throws_ok(
  $$select public.update_announcement(
    'a1100000-0000-0000-0000-000000000001',
    (select id from public.announcements where title='Mantenimiento de ascensores'),
    'Changed after publication'
  )$$,
  null,
  'published announcements are immutable',
  'published and archived content is immutable'
);
select lives_ok(
  $$select public.create_announcement(
    'a1100000-0000-0000-0000-000000000001',
    'Publicación automática', 'Este anuncio se publicará automáticamente.', 'Contenido programado para una ejecución futura.',
    'normal', 'owners', null, null, false, now() + interval '3 days'
  )$$,
  'administrator creates a draft for automatic publication'
);
select lives_ok(
  $$select public.schedule_announcement(
    'a1100000-0000-0000-0000-000000000001',
    (select id from public.announcements where title='Publicación automática'),
    now() + interval '1 hour', 1
  )$$,
  'administrator schedules automatic publication'
);

reset role;
select throws_ok(
  $$update public.announcement_events set metadata='{}'::jsonb$$,
  null,
  'announcement_events records are immutable',
  'announcement events are append-only'
);
insert into public.announcement_attachments (
  announcement_id, condominium_id, storage_key, original_filename, content_type,
  size_bytes, sha256, uploaded_by
) values (
  (select id from public.announcements where title='Mantenimiento de ascensores'),
  'a1100000-0000-0000-0000-000000000001',
  'announcements/manual.pdf', 'manual.pdf', 'application/pdf', 1024,
  repeat('a', 64), 'a0000000-0000-0000-0000-000000000001'
);
select throws_ok(
  $$update public.announcement_attachments set original_filename='changed.pdf'$$,
  null,
  'announcement_attachments records are immutable',
  'announcement attachments are append-only'
);

update public.unit_owners
set ends_at = current_date - 1
where person_id = 'a1130000-0000-0000-0000-000000000004';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000008', true);
select is((select count(*) from public.announcements where title='Mantenimiento de ascensores'), 0::bigint, 'former owner loses announcement access when the relationship expires');
select is((select count(*) from public.announcement_recipients where announcement_id=(select id from public.announcements where title='Mantenimiento de ascensores')), 0::bigint, 'former recipient cannot read their historical recipient row');
select is((select count(*) from public.announcement_attachments where announcement_id=(select id from public.announcements where title='Mantenimiento de ascensores')), 0::bigint, 'former recipient cannot pass attachment metadata RLS used by the download route');
select throws_ok(
  $$select public.mark_announcement_read('a1100000-0000-0000-0000-000000000001', (select id from public.announcements where title='Mantenimiento de ascensores'))$$,
  null, 'announcement unavailable', 'former recipient cannot create a read receipt'
);
select throws_ok(
  $$select public.acknowledge_announcement('a1100000-0000-0000-0000-000000000001', (select id from public.announcements where title='Mantenimiento de ascensores'))$$,
  null, 'announcement unavailable', 'former recipient cannot acknowledge a historical announcement'
);

reset role;
select is((select count(*) from public.announcement_recipients where user_id='a0000000-0000-0000-0000-000000000008' and announcement_id=(select id from public.announcements where title='Mantenimiento de ascensores')), 1::bigint, 'historical recipient row is retained for audit after relationship expiry');
select is((select count(*) from public.announcement_recipients where user_id='a0000000-0000-0000-0000-000000000008' and announcement_id=(select id from public.announcements where title='Mantenimiento de ascensores') and read_at is null and acknowledged_at is null), 1::bigint, 'denied former recipient receipt fields remain unchanged');
insert into public.condominium_memberships (condominium_id, user_id, role) values
  ('a1100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'assistant');
update public.unit_owners set ends_at = current_date - 1 where person_id = 'a1130000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', true);
select is((select count(*) from public.announcements where title='Mantenimiento de ascensores'), 1::bigint, 'valid staff role overlap retains announcement access after owner relationship expiry');
select is((select count(*) from public.announcement_attachments where announcement_id=(select id from public.announcements where title='Mantenimiento de ascensores')), 1::bigint, 'valid staff role overlap retains attachment download metadata access');
reset role;
select is(public.publish_due_announcements(now() + interval '2 hours'), 1, 'scheduler publishes one due announcement');
select is((select status::text from public.announcements where title='Publicación automática'), 'published', 'scheduled announcement is published by the scheduler');

select * from finish();
rollback;
