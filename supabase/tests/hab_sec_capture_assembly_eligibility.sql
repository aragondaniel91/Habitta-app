begin;
select plan(9);

/*
 * capture_assembly_eligibility freezes the voting roll of an assembly. It turns RLS off and has no
 * authorization of its own, because it is meant to run only inside transition_assembly('start'),
 * which checks that the caller manages that condominium. Its migration granted EXECUTE to
 * service_role only, but Supabase's default privileges had already granted anon and authenticated,
 * and `revoke ... from public` does not remove those. Any signed-in account of any tenant could
 * therefore freeze another condominium's roll before its assembly started.
 */

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('5ec00000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sec-cae-admin-a@test.local', 'x', now(), now()),
  ('5ec00000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sec-cae-admin-b@test.local', 'x', now(), now()),
  ('5ec00000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sec-cae-owner-1@test.local', 'x', now(), now()),
  ('5ec00000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sec-cae-owner-2@test.local', 'x', now(), now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '5ec00000-0000-0000-0000-000000000001', true);
create temporary table cae_a as
select public.create_admin_workspace('CAE Org A', 'independent', 'CAE Condo A', 'VE', 'Caracas',
  'America/Caracas', 'USD', 'VES', 2, 'Torre A') as payload;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '5ec00000-0000-0000-0000-000000000002', true);
create temporary table cae_b as
select public.create_admin_workspace('CAE Org B', 'independent', 'CAE Condo B', 'VE', 'Valencia',
  'America/Caracas', 'USD', 'VES', 1, 'Torre B') as payload;
reset role;

insert into public.units (id, condominium_id, building_id, code, type, status, created_by)
select unit_id, (select (payload #>> '{condominium,id}')::uuid from cae_a),
  (select (payload #>> '{building,id}')::uuid from cae_a), code, 'apartment', 'active',
  '5ec00000-0000-0000-0000-000000000001'
from (values ('5ec00000-0000-0000-0000-000000000021'::uuid, 'A-01'),
             ('5ec00000-0000-0000-0000-000000000022'::uuid, 'A-02')) as seed(unit_id, code);
insert into public.people (id, condominium_id, auth_user_id, first_name, last_name, email, status, created_by)
select person_id, (select (payload #>> '{condominium,id}')::uuid from cae_a), user_id, 'Owner', surname, email,
  'active', '5ec00000-0000-0000-0000-000000000001'
from (values
  ('5ec00000-0000-0000-0000-000000000031'::uuid, '5ec00000-0000-0000-0000-000000000011'::uuid, 'One', 'sec-cae-owner-1@test.local'),
  ('5ec00000-0000-0000-0000-000000000032'::uuid, '5ec00000-0000-0000-0000-000000000012'::uuid, 'Two', 'sec-cae-owner-2@test.local')
) as seed(person_id, user_id, surname, email);
insert into public.unit_owners (unit_id, person_id, ownership_percentage, is_primary_contact, created_by) values
  ('5ec00000-0000-0000-0000-000000000021', '5ec00000-0000-0000-0000-000000000031', 100, true, '5ec00000-0000-0000-0000-000000000001'),
  ('5ec00000-0000-0000-0000-000000000022', '5ec00000-0000-0000-0000-000000000032', 100, true, '5ec00000-0000-0000-0000-000000000001');

-- Condominium A schedules an assembly; its roll must stay open until the assembly starts.
set local role authenticated;
select set_config('request.jwt.claim.sub', '5ec00000-0000-0000-0000-000000000001', true);
create temporary table cae_assembly as
select (public.create_assembly((select (payload #>> '{condominium,id}')::uuid from cae_a),
  'Asamblea CAE', 'Aislamiento entre tenants', now() + interval '1 day', 'Salón', 'one_per_unit', 50)).id as id;
select public.transition_assembly((select (payload #>> '{condominium,id}')::uuid from cae_a),
  (select id from cae_assembly), 'schedule', 1);
reset role;
grant select on cae_a, cae_assembly to anon, authenticated;

-- 1. The attack: an administrator of ANOTHER condominium freezes A's roll.
set local role authenticated;
select set_config('request.jwt.claim.sub', '5ec00000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.capture_assembly_eligibility((select (payload #>> '{condominium,id}')::uuid from cae_a), (select id from cae_assembly))$$,
  '42501', null,
  'an administrator of another condominium cannot freeze this assembly''s voting roll');
reset role;

-- 2. Anonymous callers neither.
set local role anon;
select throws_ok(
  $$select public.capture_assembly_eligibility((select (payload #>> '{condominium,id}')::uuid from cae_a), (select id from cae_assembly))$$,
  '42501', null, 'an anonymous caller cannot freeze a voting roll');
reset role;

-- 3. Not even A's own administrator, directly: the roll is frozen only by starting the assembly.
set local role authenticated;
select set_config('request.jwt.claim.sub', '5ec00000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.capture_assembly_eligibility((select (payload #>> '{condominium,id}')::uuid from cae_a), (select id from cae_assembly))$$,
  '42501', null, 'the roll is never frozen outside the assembly lifecycle, even by its own administrator');
reset role;

select is((select count(*) from public.assembly_eligibility_snapshots where assembly_id = (select id from cae_assembly)),
  0::bigint, 'none of the refused calls captured anything');

-- 4. The legitimate path is unchanged: starting the assembly freezes the roll.
set local role authenticated;
select set_config('request.jwt.claim.sub', '5ec00000-0000-0000-0000-000000000001', true);
select is((public.transition_assembly((select (payload #>> '{condominium,id}')::uuid from cae_a),
  (select id from cae_assembly), 'start', 2)).status::text, 'in_progress',
  'the authorized administrator still starts the assembly');
reset role;
select is((select eligibility_count from public.assemblies where id = (select id from cae_assembly)), 2,
  'starting the assembly still captures exactly the two eligible units');

-- 5. The grants themselves, so the default-privilege mistake cannot return unnoticed.
select ok(not has_function_privilege('anon', 'public.capture_assembly_eligibility(uuid,uuid)', 'EXECUTE'), 'anon has no EXECUTE');
select ok(not has_function_privilege('authenticated', 'public.capture_assembly_eligibility(uuid,uuid)', 'EXECUTE'), 'authenticated has no EXECUTE');
select ok(has_function_privilege('service_role', 'public.capture_assembly_eligibility(uuid,uuid)', 'EXECUTE'), 'service_role keeps EXECUTE');

select * from finish();
rollback;
