begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users(id, email)
values
  ('42000000-0000-4000-8000-000000000001', 'hab420-owner-a@example.com'),
  ('42000000-0000-4000-8000-000000000002', 'hab420-owner-b@example.com');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub','42000000-0000-4000-8000-000000000001',
    'role','authenticated',
    'email','hab420-owner-a@example.com'
  )::text,
  true
);

create temporary table hab420_workspace_a as
select public.create_admin_workspace(
  'Habitta HAB-420 Org A',
  'independent',
  'Condominio HAB-420 A',
  'VE',
  'Caracas',
  'America/Caracas',
  'USD',
  'VES',
  1,
  'Torre HAB-420 A'
) as payload;

create temporary table hab420_ids_a as
select
  (payload #>> '{condominium,id}')::uuid as condominium_id,
  (payload #>> '{building,id}')::uuid as building_id
from hab420_workspace_a;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub','42000000-0000-4000-8000-000000000002',
    'role','authenticated',
    'email','hab420-owner-b@example.com'
  )::text,
  true
);

create temporary table hab420_workspace_b as
select public.create_admin_workspace(
  'Habitta HAB-420 Org B',
  'independent',
  'Condominio HAB-420 B',
  'VE',
  'Caracas',
  'America/Caracas',
  'USD',
  'VES',
  1,
  'Torre HAB-420 B'
) as payload;

create temporary table hab420_ids_b as
select (payload #>> '{condominium,id}')::uuid as condominium_id
from hab420_workspace_b;

reset role;

-- Keep the HAB-419 production topology in the same regression fixture: the condominium being
-- deleted is a single-building residence, and that building must outlive its unit during purge.
update public.condominiums
set property_topology = 'single_building',
    declared_unit_count = 1,
    declared_building_count = 1
where id = (select condominium_id from hab420_ids_a);

insert into public.units(id, condominium_id, building_id, code, type, status, created_by)
values (
  '42040000-0000-4000-8000-000000000001',
  (select condominium_id from hab420_ids_a),
  (select building_id from hab420_ids_a),
  'A-420',
  'apartment',
  'active',
  '42000000-0000-4000-8000-000000000001'
);

insert into public.people(
  id, condominium_id, first_name, last_name, email, status, created_by
) values (
  '42050000-0000-4000-8000-000000000001',
  (select condominium_id from hab420_ids_a),
  'HAB',
  'Resident 420',
  'hab420-resident@example.com',
  'active',
  '42000000-0000-4000-8000-000000000001'
);

insert into public.unit_owners(unit_id, person_id, is_primary_contact, created_by)
values (
  '42040000-0000-4000-8000-000000000001',
  '42050000-0000-4000-8000-000000000001',
  true,
  '42000000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub','42000000-0000-4000-8000-000000000001',
    'role','authenticated',
    'email','hab420-owner-a@example.com'
  )::text,
  true
);

create temporary table hab420_invitation as
select public.create_resident_invitation(
  (select condominium_id from hab420_ids_a),
  '42050000-0000-4000-8000-000000000001',
  '42040000-0000-4000-8000-000000000001',
  'owner',
  null
) as payload;

select lives_ok(
  format(
    'select public.record_resident_invitation_delivery(%L::uuid,%L,%L,%L,null,%L)',
    (select payload #>> '{invitation,id}' from hab420_invitation),
    'sent',
    'zeptomail',
    'live',
    'provider-hab420'
  ),
  'fixture contains a resident invitation delivery audit row before purge'
);

reset role;

select throws_ok(
  format(
    'delete from public.resident_invitation_delivery_events where condominium_id = %L::uuid',
    (select condominium_id from hab420_ids_a)
  ),
  'P0001',
  'resident invitation delivery events are immutable',
  'ordinary delete cannot bypass resident invitation delivery immutability'
);

select throws_ok(
  format(
    'update public.resident_invitation_delivery_events set provider = %L where condominium_id = %L::uuid',
    'tampered-provider',
    (select condominium_id from hab420_ids_a)
  ),
  'P0001',
  'resident invitation delivery events are immutable',
  'ordinary update remains immutable'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub','42000000-0000-4000-8000-000000000001',
    'role','authenticated',
    'email','hab420-owner-a@example.com'
  )::text,
  true
);

select lives_ok(
  format(
    'select * from public.request_condominium_deletion(%L::uuid,%L)',
    (select condominium_id from hab420_ids_a),
    'ELIMINAR Condominio HAB-420 A'
  ),
  'authorized owner purge can delete a tenant containing resident invitation delivery audit rows'
);

reset role;

select is(
  (select count(*)::integer from public.condominiums where id = (select condominium_id from hab420_ids_a)),
  0,
  'target condominium is removed'
);

select is(
  (select count(*)::integer from public.resident_invitation_delivery_events where condominium_id = (select condominium_id from hab420_ids_a)),
  0,
  'resident invitation delivery audit rows leave with the deleted tenant'
);

select is(
  (select count(*)::integer from public.condominiums where id = (select condominium_id from hab420_ids_b)),
  1,
  'unrelated tenant remains untouched'
);

select is(
  (
    select count(*)::integer
    from public.condominium_deletion_jobs
    where condominium_name = 'Condominio HAB-420 A'
      and database_deleted_at is not null
  ),
  1,
  'deletion tombstone is recorded after the authorized purge'
);

select ok(
  not public.has_condominium_purge_authorization(),
  'transaction-scoped purge authorization is not reusable after the RPC'
);

select * from finish();
rollback;
