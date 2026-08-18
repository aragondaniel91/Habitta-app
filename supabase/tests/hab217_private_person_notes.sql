begin;
select plan(13);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000021701',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'hab217-admin@test.local', 'x',
    '{"full_name":"HAB-217 Admin"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000021702',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'hab217-accountant@test.local', 'x',
    '{"full_name":"HAB-217 Accountant"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000021703',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'hab217-resident@test.local', 'x',
    '{"full_name":"HAB-217 Resident"}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021701', true);

create temporary table hab217_workspace as
select public.create_admin_workspace(
  'Habitta HAB-217 Org',
  'independent',
  'Condominio HAB-217',
  'VE',
  'Caracas',
  'America/Caracas',
  'USD',
  'VES',
  10,
  'Torre HAB-217'
) as payload;

create temporary table hab217_ids as
select (payload #>> '{condominium,id}')::uuid as condominium_id
from hab217_workspace;

reset role;

insert into public.condominium_memberships(condominium_id, user_id, role)
values (
  (select condominium_id from hab217_ids),
  '00000000-0000-0000-0000-000000021702',
  'accountant'
);

insert into public.people(
  id, condominium_id, auth_user_id, first_name, last_name, email, status, created_by
) values (
  '00000000-0000-0000-0000-000000021711',
  (select condominium_id from hab217_ids),
  '00000000-0000-0000-0000-000000021703',
  'Lucía', 'Privada', 'hab217-resident@test.local', 'active',
  '00000000-0000-0000-0000-000000021701'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021701', true);

select lives_ok(
  format(
    'insert into public.person_admin_note_revisions(condominium_id, person_id, action, content, created_by) values (%L::uuid,%L::uuid,%L,%L,%L::uuid)',
    (select condominium_id from hab217_ids),
    '00000000-0000-0000-0000-000000021711',
    'saved',
    'Contactar por la tarde. Nota exclusivamente administrativa.',
    '00000000-0000-0000-0000-000000021701'
  ),
  'People manager can append a private administrative note'
);

select is(
  (
    select count(*)
    from public.person_admin_note_revisions
    where person_id = '00000000-0000-0000-0000-000000021711'
  ),
  1::bigint,
  'authorized manager can read the private note history'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021702', true);

select is(
  (
    select count(*)
    from public.people
    where id = '00000000-0000-0000-0000-000000021711'
  ),
  1::bigint,
  'accountant keeps the existing can_read_people access to the person record'
);

select is(
  (
    select count(*)
    from public.person_admin_note_revisions
    where person_id = '00000000-0000-0000-0000-000000021711'
  ),
  0::bigint,
  'accountant cannot read private administrative notes'
);

select throws_like(
  format(
    'insert into public.person_admin_note_revisions(condominium_id, person_id, action, content, created_by) values (%L::uuid,%L::uuid,%L,%L,%L::uuid)',
    (select condominium_id from hab217_ids),
    '00000000-0000-0000-0000-000000021711',
    'saved',
    'Must not be accepted',
    '00000000-0000-0000-0000-000000021702'
  ),
  '%row-level security%',
  'accountant cannot append private administrative notes'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021703', true);

select is(
  (
    select count(*)
    from public.people
    where id = '00000000-0000-0000-0000-000000021711'
  ),
  1::bigint,
  'resident can still read their own person record'
);

select is(
  (
    select count(*)
    from public.person_admin_note_revisions
    where person_id = '00000000-0000-0000-0000-000000021711'
  ),
  0::bigint,
  'resident self-access never reveals internal administrative notes'
);

select throws_like(
  format(
    'insert into public.person_admin_note_revisions(condominium_id, person_id, action, content, created_by) values (%L::uuid,%L::uuid,%L,%L,%L::uuid)',
    (select condominium_id from hab217_ids),
    '00000000-0000-0000-0000-000000021711',
    'saved',
    'Resident must not create internal notes',
    '00000000-0000-0000-0000-000000021703'
  ),
  '%row-level security%',
  'resident cannot append an internal note to their own profile'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021701', true);

insert into public.person_admin_note_revisions(condominium_id, person_id, action, content, created_by)
values
  (
    (select condominium_id from hab217_ids),
    '00000000-0000-0000-0000-000000021711',
    'saved',
    'Segunda revisión: confirmó teléfono alterno con administración.',
    '00000000-0000-0000-0000-000000021701'
  ),
  (
    (select condominium_id from hab217_ids),
    '00000000-0000-0000-0000-000000021711',
    'cleared',
    null,
    '00000000-0000-0000-0000-000000021701'
  );

select is(
  (
    select action
    from public.person_admin_note_revisions
    where person_id = '00000000-0000-0000-0000-000000021711'
    order by id desc
    limit 1
  ),
  'cleared',
  'clearing a note appends a tombstone instead of deleting history'
);

select is(
  (
    select content
    from public.person_admin_note_revisions
    where person_id = '00000000-0000-0000-0000-000000021711'
    order by id desc
    limit 1
  ),
  null::text,
  'clear tombstone does not duplicate prior note content'
);

select is(
  (
    select count(*)
    from public.person_admin_note_revisions
    where person_id = '00000000-0000-0000-0000-000000021711'
  ),
  3::bigint,
  'all note revisions remain available to authorized administrators'
);

select ok(
  not has_table_privilege('authenticated', 'public.person_admin_note_revisions', 'UPDATE'),
  'authenticated clients cannot rewrite note history'
);

select ok(
  not has_table_privilege('authenticated', 'public.person_admin_note_revisions', 'DELETE'),
  'authenticated clients cannot delete note history'
);

select * from finish();
rollback;
