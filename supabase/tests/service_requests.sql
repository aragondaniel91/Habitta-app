begin;
select plan(23);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('90000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@requests.test', 'x', now(), now()),
  ('90000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@requests.test', 'x', now(), now()),
  ('90000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'assistant@requests.test', 'x', now(), now()),
  ('90000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'board@requests.test', 'x', now(), now()),
  ('90000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other@requests.test', 'x', now(), now());

insert into public.organizations (id, name, created_by) values
  ('91000000-0000-0000-0000-000000000001', 'Requests A', '90000000-0000-0000-0000-000000000001'),
  ('92000000-0000-0000-0000-000000000002', 'Requests B', '90000000-0000-0000-0000-000000000005');
insert into public.condominiums (id, organization_id, name, created_by) values
  ('91100000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'Condo Requests A', '90000000-0000-0000-0000-000000000001'),
  ('92200000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000002', 'Condo Requests B', '90000000-0000-0000-0000-000000000005');
insert into public.condominium_memberships (condominium_id, user_id, role) values
  ('91100000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'condominium_admin'),
  ('91100000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000002', 'owner'),
  ('91100000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000003', 'assistant'),
  ('91100000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000004', 'board_member'),
  ('92200000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000005', 'condominium_admin');
insert into public.units (id, condominium_id, code, type, created_by) values
  ('91110000-0000-0000-0000-000000000001', '91100000-0000-0000-0000-000000000001', 'A-1', 'apartment', '90000000-0000-0000-0000-000000000001'),
  ('92220000-0000-0000-0000-000000000002', '92200000-0000-0000-0000-000000000002', 'B-1', 'apartment', '90000000-0000-0000-0000-000000000005');
insert into public.people (id, condominium_id, auth_user_id, first_name, last_name, email, created_by) values
  ('91120000-0000-0000-0000-000000000001', '91100000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000002', 'Olivia', 'Owner', 'owner@requests.test', '90000000-0000-0000-0000-000000000001');
insert into public.unit_owners (unit_id, person_id, is_primary_contact, created_by) values
  ('91110000-0000-0000-0000-000000000001', '91120000-0000-0000-0000-000000000001', true, '90000000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$select public.create_service_request(
    '91100000-0000-0000-0000-000000000001',
    '91110000-0000-0000-0000-000000000001',
    (select id from public.service_request_categories where condominium_id='91100000-0000-0000-0000-000000000001' and code='maintenance'),
    'Fuga en cocina',
    'La tubería debajo del fregadero pierde agua.',
    'high',
    null
  )$$,
  'owner creates a request for their unit'
);
select matches((select request_number from public.service_requests where title='Fuga en cocina'), '^SR-[0-9]{4}-[0-9]{6}$', 'request receives a human number');
select is((select count(*) from public.service_request_events where event_type='created'), 1::bigint, 'creation appends an event');
select is((select count(*) from public.service_requests where title='Fuga en cocina'), 1::bigint, 'owner reads their request');
update public.service_requests set priority='low' where title='Fuga en cocina';
select is((select priority::text from public.service_requests where title='Fuga en cocina'), 'high', 'owner cannot directly update a request');
select throws_ok(
  $$select public.create_service_request(
    '92200000-0000-0000-0000-000000000002',
    '92220000-0000-0000-0000-000000000002',
    (select id from public.service_request_categories where condominium_id='92200000-0000-0000-0000-000000000002' and code='maintenance'),
    'Cross tenant', 'Not allowed', 'normal', null
  )$$,
  null,
  'request access denied',
  'owner cannot create a request in another condominium'
);

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.update_service_request(
    '91100000-0000-0000-0000-000000000001',
    (select id from public.service_requests where title='Fuga en cocina'),
    'acknowledged', null, null, null, false, null, false, null, 1
  )$$,
  'administrator acknowledges a request with optimistic versioning'
);
select is((select version from public.service_requests where title='Fuga en cocina'), 2, 'request version increments');
select lives_ok(
  $$select public.update_service_request(
    '91100000-0000-0000-0000-000000000001',
    (select id from public.service_requests where title='Fuga en cocina'),
    'in_progress', 'urgent', null, '90000000-0000-0000-0000-000000000003', false, now() + interval '2 days', false, null, 2
  )$$,
  'administrator assigns and starts a request'
);
select throws_ok(
  $$select public.update_service_request(
    '91100000-0000-0000-0000-000000000001',
    (select id from public.service_requests where title='Fuga en cocina'),
    'closed'
  )$$,
  null,
  'invalid request transition',
  'request cannot close before resolution'
);
select lives_ok(
  $$select public.add_service_request_comment(
    '91100000-0000-0000-0000-000000000001',
    (select id from public.service_requests where title='Fuga en cocina'),
    'Proveedor contactado para inspección.',
    'internal'
  )$$,
  'administrator adds an internal comment'
);

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000002', true);
select is((select count(*) from public.service_request_comments where visibility='internal'), 0::bigint, 'owner cannot read internal comments');
select lives_ok(
  $$select public.add_service_request_comment(
    '91100000-0000-0000-0000-000000000001',
    (select id from public.service_requests where title='Fuga en cocina'),
    'Gracias, estaré pendiente.',
    'public'
  )$$,
  'owner adds a public comment'
);
select is((select count(*) from public.service_request_comments where visibility='public'), 1::bigint, 'owner reads public comments');

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000004', true);
select is((select count(*) from public.service_request_comments where visibility='internal'), 1::bigint, 'board member reads internal comments');
select throws_ok(
  $$select public.add_service_request_comment(
    '91100000-0000-0000-0000-000000000001',
    (select id from public.service_requests where title='Fuga en cocina'),
    'Board internal note',
    'internal'
  )$$,
  null,
  'internal comment denied',
  'board member cannot write internal comments'
);

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000003', true);
select lives_ok(
  $$select public.update_service_request(
    '91100000-0000-0000-0000-000000000001',
    (select id from public.service_requests where title='Fuga en cocina'),
    'waiting_vendor'
  )$$,
  'assistant manages the request lifecycle'
);

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$select public.cancel_service_request(
    '91100000-0000-0000-0000-000000000001',
    (select id from public.service_requests where title='Fuga en cocina'),
    'La reparación fue atendida directamente.'
  )$$,
  'requester can cancel their active request'
);
select is((select status::text from public.service_requests where title='Fuga en cocina'), 'cancelled', 'cancellation changes status');
select is((select count(*) from public.service_request_events where event_type='cancelled'), 1::bigint, 'cancellation is audited');
select is((select count(*) from public.service_requests where condominium_id='92200000-0000-0000-0000-000000000002'), 0::bigint, 'tenant isolation hides other condominium requests');

reset role;
select throws_ok(
  $$update public.service_request_events set metadata='{}'::jsonb$$,
  null,
  'service_request_events records are immutable',
  'events are append-only'
);
select throws_ok(
  $$delete from public.service_request_comments$$,
  null,
  'service_request_comments records are immutable',
  'comments are append-only'
);

select * from finish();
rollback;
