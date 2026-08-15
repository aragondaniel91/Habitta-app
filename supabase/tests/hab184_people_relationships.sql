begin;
select plan(22);

select has_type('public', 'condominium_person_relationship_type', 'condominium relationship type exists');
select has_table('public', 'condominium_person_relationships', 'condominium relationships table exists');
select has_column('public', 'condominium_person_relationships', 'relationship_type', 'relationship type is stored');
select has_column('public', 'condominium_person_relationships', 'ends_at', 'relationship history has an end date');
select is(
  (select relrowsecurity from pg_class where oid = 'public.condominium_person_relationships'::regclass),
  true,
  'condominium relationships use RLS'
);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000018401', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab184-admin@test.local', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000018402', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab184-accountant@test.local', 'x', now(), now());

insert into public.organizations (id, name, created_by) values
  ('18400000-0000-0000-0000-000000000001', 'HAB 184 Org A', '00000000-0000-0000-0000-000000018401'),
  ('18400000-0000-0000-0000-000000000002', 'HAB 184 Org B', '00000000-0000-0000-0000-000000018401');
insert into public.condominiums (id, organization_id, name, created_by) values
  ('18410000-0000-0000-0000-000000000001', '18400000-0000-0000-0000-000000000001', 'HAB 184 Condo A', '00000000-0000-0000-0000-000000018401'),
  ('18410000-0000-0000-0000-000000000002', '18400000-0000-0000-0000-000000000002', 'HAB 184 Condo B', '00000000-0000-0000-0000-000000018401');
insert into public.organization_memberships (organization_id, user_id, role) values
  ('18400000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000018401', 'organization_owner'),
  ('18400000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000018401', 'organization_owner');
insert into public.condominium_memberships (condominium_id, user_id, role) values
  ('18410000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000018401', 'condominium_admin'),
  ('18410000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000018402', 'accountant'),
  ('18410000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000018401', 'condominium_admin');
insert into public.units (id, condominium_id, code, type, created_by) values
  ('18420000-0000-0000-0000-000000000001', '18410000-0000-0000-0000-000000000001', 'A-1', 'apartment', '00000000-0000-0000-0000-000000018401'),
  ('18420000-0000-0000-0000-000000000002', '18410000-0000-0000-0000-000000000001', 'A-2', 'apartment', '00000000-0000-0000-0000-000000018401');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000018401', true);

select lives_ok(
  $$insert into public.people (id, condominium_id, first_name, last_name, document_type, document_number, email, created_by)
    values ('18430000-0000-0000-0000-000000000001', '18410000-0000-0000-0000-000000000001', 'Ana', 'Pérez', 'Cédula', 'V-12.345.678', 'ana184@test.local', '00000000-0000-0000-0000-000000018401')$$,
  'administrator creates a person with a Venezuelan identity document'
);
select throws_ok(
  $$insert into public.people (condominium_id, first_name, last_name, document_type, document_number, created_by)
    values ('18410000-0000-0000-0000-000000000001', 'Ana', 'Duplicada', 'cédula', 'v12345678', '00000000-0000-0000-0000-000000018401')$$,
  '23505',
  null,
  'normalized identity document prevents duplicate people'
);
select lives_ok(
  $$insert into public.people (id, condominium_id, first_name, last_name, created_by)
    values ('18430000-0000-0000-0000-000000000002', '18410000-0000-0000-0000-000000000001', 'Luis', 'Rojas', '00000000-0000-0000-0000-000000018401')$$,
  'administrator creates another person without requiring a Habitta account'
);

select lives_ok(
  $$insert into public.condominium_person_relationships
    (id, condominium_id, person_id, relationship_type, title, created_by)
    values ('18440000-0000-0000-0000-000000000001', '18410000-0000-0000-0000-000000000001', '18430000-0000-0000-0000-000000000001', 'board_member', 'Presidenta', '00000000-0000-0000-0000-000000018401')$$,
  'administrator creates a condominium-level relationship'
);
select throws_ok(
  $$insert into public.condominium_person_relationships
    (condominium_id, person_id, relationship_type, created_by)
    values ('18410000-0000-0000-0000-000000000001', '18430000-0000-0000-0000-000000000001', 'board_member', '00000000-0000-0000-0000-000000018401')$$,
  '23505',
  null,
  'duplicate active condominium relationship is rejected'
);
select lives_ok(
  $$update public.condominium_person_relationships
    set ends_at = current_date
    where id = '18440000-0000-0000-0000-000000000001'$$,
  'relationship is closed instead of deleted'
);
select is(
  (select count(*) from public.condominium_person_relationships where id = '18440000-0000-0000-0000-000000000001' and ends_at is not null),
  1::bigint,
  'closed relationship remains in history'
);
select lives_ok(
  $$insert into public.condominium_person_relationships
    (id, condominium_id, person_id, relationship_type, title, created_by)
    values ('18440000-0000-0000-0000-000000000002', '18410000-0000-0000-0000-000000000001', '18430000-0000-0000-0000-000000000001', 'board_member', 'Tesorera', '00000000-0000-0000-0000-000000018401')$$,
  'a new relationship can start after the historical one closes'
);

reset role;
insert into public.people (id, condominium_id, first_name, last_name, created_by)
values ('18430000-0000-0000-0000-000000000003', '18410000-0000-0000-0000-000000000002', 'Persona', 'Otro Condo', '00000000-0000-0000-0000-000000018401');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000018401', true);

select throws_ok(
  $$insert into public.condominium_person_relationships
    (condominium_id, person_id, relationship_type, created_by)
    values ('18410000-0000-0000-0000-000000000001', '18430000-0000-0000-0000-000000000003', 'representative', '00000000-0000-0000-0000-000000018401')$$,
  '23503',
  null,
  'a relationship cannot cross condominium boundaries'
);
select throws_ok(
  $$update public.condominium_person_relationships
    set relationship_type = 'representative'
    where id = '18440000-0000-0000-0000-000000000002'$$,
  'P0001',
  'relationship identity and authorship are immutable',
  'relationship identity cannot be rewritten in place'
);
select ok(
  not has_table_privilege('authenticated', 'public.condominium_person_relationships', 'DELETE'),
  'authenticated users cannot delete relationship history'
);

select lives_ok(
  $$insert into public.unit_owners (unit_id, person_id, created_by)
    values ('18420000-0000-0000-0000-000000000001', '18430000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000018401')$$,
  'person can own the first unit'
);
select lives_ok(
  $$insert into public.unit_owners (unit_id, person_id, created_by)
    values ('18420000-0000-0000-0000-000000000002', '18430000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000018401')$$,
  'same person can own a second unit without duplication'
);
select is(
  (select count(*) from public.unit_owners where person_id = '18430000-0000-0000-0000-000000000001' and ends_at is null),
  2::bigint,
  'one person record carries multiple active ownerships'
);
select lives_ok(
  $$insert into public.unit_occupancies (unit_id, person_id, occupancy_type, created_by)
    values ('18420000-0000-0000-0000-000000000001', '18430000-0000-0000-0000-000000000001', 'owner_occupant', '00000000-0000-0000-0000-000000018401')$$,
  'same person can also be an owner-occupant'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000018402', true);
select is(
  (select count(*) from public.condominium_person_relationships where condominium_id = '18410000-0000-0000-0000-000000000001'),
  2::bigint,
  'accountant can read current and historical condominium relationships'
);
update public.condominium_person_relationships
set title = 'Blocked'
where id = '18440000-0000-0000-0000-000000000002';
select is(
  (select title from public.condominium_person_relationships where id = '18440000-0000-0000-0000-000000000002'),
  'Tesorera',
  'read-only accountant cannot modify condominium relationships'
);
select is(
  (select count(*) from public.people where condominium_id = '18410000-0000-0000-0000-000000000002'),
  0::bigint,
  'accountant remains isolated from people in another condominium'
);

select * from finish();
rollback;
