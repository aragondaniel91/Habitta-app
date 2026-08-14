begin;
select plan(17);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('16900000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab169-admin-a@test.local', 'x', now(), now()),
  ('16900000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab169-admin-b@test.local', 'x', now(), now()),
  ('16900000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab169-owner-1@test.local', 'x', now(), now()),
  ('16900000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab169-owner-2@test.local', 'x', now(), now()),
  ('16900000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab169-owner-3@test.local', 'x', now(), now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '16900000-0000-0000-0000-000000000001', true);
create temporary table hab169_workspace_a as
select public.create_admin_workspace(
  'HAB-169 Org A', 'independent', 'HAB-169 Condo A', 'VE', 'Caracas',
  'America/Caracas', 'USD', 'VES', 3, 'Torre A'
) as payload;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '16900000-0000-0000-0000-000000000002', true);
create temporary table hab169_workspace_b as
select public.create_admin_workspace(
  'HAB-169 Org B', 'independent', 'HAB-169 Condo B', 'VE', 'Valencia',
  'America/Caracas', 'USD', 'VES', 1, 'Torre B'
) as payload;
reset role;

insert into public.units (id, condominium_id, building_id, code, type, status, created_by)
select unit_id,
  (select (payload #>> '{condominium,id}')::uuid from hab169_workspace_a),
  (select (payload #>> '{building,id}')::uuid from hab169_workspace_a),
  code,
  'apartment',
  'active',
  '16900000-0000-0000-0000-000000000001'
from (
  values
    ('16900000-0000-0000-0000-000000000021'::uuid, 'A-01'),
    ('16900000-0000-0000-0000-000000000022'::uuid, 'A-02')
) as seed(unit_id, code);

insert into public.people (
  id, condominium_id, auth_user_id, first_name, last_name, email, status, created_by
)
select person_id,
  (select (payload #>> '{condominium,id}')::uuid from hab169_workspace_a),
  user_id,
  'Owner',
  surname,
  email,
  'active',
  '16900000-0000-0000-0000-000000000001'
from (
  values
    ('16900000-0000-0000-0000-000000000031'::uuid, '16900000-0000-0000-0000-000000000011'::uuid, 'One', 'hab169-owner-1@test.local'),
    ('16900000-0000-0000-0000-000000000032'::uuid, '16900000-0000-0000-0000-000000000012'::uuid, 'Two', 'hab169-owner-2@test.local')
) as seed(person_id, user_id, surname, email);

insert into public.unit_owners (
  unit_id, person_id, ownership_percentage, is_primary_contact, created_by
)
values
  ('16900000-0000-0000-0000-000000000021', '16900000-0000-0000-0000-000000000031', 100, true, '16900000-0000-0000-0000-000000000001'),
  ('16900000-0000-0000-0000-000000000022', '16900000-0000-0000-0000-000000000032', 100, true, '16900000-0000-0000-0000-000000000001');

insert into public.condominium_memberships (condominium_id, user_id, role)
select (payload #>> '{condominium,id}')::uuid, '16900000-0000-0000-0000-000000000011', 'owner'
from hab169_workspace_a;

set local role authenticated;
select set_config('request.jwt.claim.sub', '16900000-0000-0000-0000-000000000001', true);

create temporary table hab169_assembly as
select (
  public.create_assembly(
    (select (payload #>> '{condominium,id}')::uuid from hab169_workspace_a),
    'Asamblea ordinaria HAB-169',
    'Validación de lifecycle y snapshots',
    now() + interval '1 day',
    'Salón principal',
    'one_per_unit',
    50
  )
).id as id;

select is(
  (select status::text from public.assemblies where id = (select id from hab169_assembly)),
  'draft',
  'assembly starts as a draft'
);

select lives_ok(
  $$select public.add_assembly_agenda_item(
    (select (payload #>> '{condominium,id}')::uuid from hab169_workspace_a),
    (select id from hab169_assembly),
    'Informe financiero',
    'Revisión del período',
    null,
    0
  )$$,
  'authorized manager can add agenda while assembly is draft'
);

select is(
  (public.transition_assembly(
    (select (payload #>> '{condominium,id}')::uuid from hab169_workspace_a),
    (select id from hab169_assembly),
    'schedule',
    1
  )).status::text,
  'scheduled',
  'draft assembly can be scheduled through lifecycle function'
);

select is(
  (public.transition_assembly(
    (select (payload #>> '{condominium,id}')::uuid from hab169_workspace_a),
    (select id from hab169_assembly),
    'start',
    2
  )).status::text,
  'in_progress',
  'scheduled assembly can start and captures eligibility'
);

select is(
  (select eligibility_count from public.assemblies where id = (select id from hab169_assembly)),
  2,
  'start snapshots the two eligible active units'
);

reset role;

-- Add a new eligible owner/unit after the meeting started. The immutable snapshot must not expand.
insert into public.units (id, condominium_id, building_id, code, type, status, created_by)
select
  '16900000-0000-0000-0000-000000000023',
  (payload #>> '{condominium,id}')::uuid,
  (payload #>> '{building,id}')::uuid,
  'A-03',
  'apartment',
  'active',
  '16900000-0000-0000-0000-000000000001'
from hab169_workspace_a;

insert into public.people (
  id, condominium_id, auth_user_id, first_name, last_name, email, status, created_by
)
select
  '16900000-0000-0000-0000-000000000033',
  (payload #>> '{condominium,id}')::uuid,
  '16900000-0000-0000-0000-000000000013',
  'Owner', 'Three', 'hab169-owner-3@test.local', 'active',
  '16900000-0000-0000-0000-000000000001'
from hab169_workspace_a;

insert into public.unit_owners (
  unit_id, person_id, ownership_percentage, is_primary_contact, created_by
)
values (
  '16900000-0000-0000-0000-000000000023',
  '16900000-0000-0000-0000-000000000033',
  100,
  true,
  '16900000-0000-0000-0000-000000000001'
);

select is(
  (select count(*)::integer from public.assembly_eligibility_snapshots where assembly_id = (select id from hab169_assembly)),
  2,
  'eligibility snapshot does not change when ownership changes after start'
);

select throws_ok(
  $$update public.assembly_eligibility_snapshots
    set label = 'tampered'
    where assembly_id = (select id from hab169_assembly)$$,
  'P0001',
  'assembly eligibility snapshot is immutable',
  'eligibility snapshot rows cannot be edited retroactively'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '16900000-0000-0000-0000-000000000002', true);

select throws_ok(
  $$select public.transition_assembly(
    (select (payload #>> '{condominium,id}')::uuid from hab169_workspace_a),
    (select id from hab169_assembly),
    'complete',
    3
  )$$,
  'P0001',
  'not authorized to manage assemblies',
  'administrator from another condominium cannot transition the assembly'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '16900000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$select public.record_assembly_attendance(
    (select (payload #>> '{condominium,id}')::uuid from hab169_workspace_a),
    (select id from hab169_assembly),
    (select id from public.assembly_eligibility_snapshots where assembly_id = (select id from hab169_assembly) order by label limit 1),
    '16900000-0000-0000-0000-000000000031',
    'in_person'
  )$$,
  'attendance can be recorded only against captured eligibility'
);

select is(
  public.get_assembly_quorum(
    (select (payload #>> '{condominium,id}')::uuid from hab169_workspace_a),
    (select id from hab169_assembly)
  ) ->> 'quorumMet',
  'true',
  'one of two eligible units meets the configured 50 percent quorum'
);

select is(
  (public.save_assembly_minutes(
    (select (payload #>> '{condominium,id}')::uuid from hab169_workspace_a),
    (select id from hab169_assembly),
    'Se verificó quórum y se revisó el informe financiero.',
    3
  )).version,
  4,
  'draft minutes are saved with optimistic version increment'
);

create temporary table hab169_resolution as
select (
  public.create_assembly_resolution(
    (select (payload #>> '{condominium,id}')::uuid from hab169_workspace_a),
    (select id from hab169_assembly),
    'Aprobación del informe',
    'Se aprueba el informe financiero presentado.'
  )
).id as id;

select is(
  (public.transition_assembly(
    (select (payload #>> '{condominium,id}')::uuid from hab169_workspace_a),
    (select id from hab169_assembly),
    'complete',
    4
  )).status::text,
  'completed',
  'in-progress assembly can be completed'
);

select is(
  (public.publish_assembly_minutes(
    (select (payload #>> '{condominium,id}')::uuid from hab169_workspace_a),
    (select id from hab169_assembly),
    5
  )).version,
  6,
  'completed assembly minutes can be published once'
);

select throws_ok(
  $$select public.save_assembly_minutes(
    (select (payload #>> '{condominium,id}')::uuid from hab169_workspace_a),
    (select id from hab169_assembly),
    'Intento de cambiar acta publicada',
    6
  )$$,
  'P0001',
  'published assembly minutes are immutable',
  'published minutes cannot be edited'
);

select lives_ok(
  $$select public.publish_assembly_resolution(
    (select (payload #>> '{condominium,id}')::uuid from hab169_workspace_a),
    (select id from hab169_assembly),
    (select id from hab169_resolution)
  )$$,
  'resolution can be published after assembly completion'
);

reset role;

select throws_ok(
  $$update public.assembly_resolutions
    set resolution_text = 'tampered'
    where id = (select id from hab169_resolution)$$,
  'P0001',
  'published assembly resolution is immutable',
  'published resolution cannot be modified even by a direct privileged update'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '16900000-0000-0000-0000-000000000001', true);

select throws_ok(
  $$select public.add_assembly_agenda_item(
    (select (payload #>> '{condominium,id}')::uuid from hab169_workspace_a),
    (select id from hab169_assembly),
    'Tema tardío',
    null,
    null,
    1
  )$$,
  'P0001',
  'assembly agenda is frozen after the meeting starts',
  'agenda cannot be changed after assembly starts'
);

select * from finish();
rollback;