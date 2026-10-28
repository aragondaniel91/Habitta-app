begin;
select plan(18);

select has_table('public', 'structure_events', 'structure events audit table exists');
select has_column('public', 'structure_events', 'previous_status', 'audit row records the prior status');
select has_column('public', 'structure_events', 'new_status', 'audit row records the resulting status');
select is(
  (select relrowsecurity from pg_class where oid = 'public.structure_events'::regclass),
  true,
  'structure events use RLS'
);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000051801', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab518-admin-a@test.local', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000051802', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab518-admin-b@test.local', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000051803', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab518-resident-a@test.local', 'x', now(), now());

insert into public.organizations (id, name, created_by) values
  ('51800000-0000-0000-0000-000000000001', 'HAB 518 Org A', '00000000-0000-0000-0000-000000051801'),
  ('51800000-0000-0000-0000-000000000002', 'HAB 518 Org B', '00000000-0000-0000-0000-000000051802');
insert into public.condominiums (id, organization_id, name, created_by) values
  ('51810000-0000-0000-0000-000000000001', '51800000-0000-0000-0000-000000000001', 'HAB 518 Condo A', '00000000-0000-0000-0000-000000051801'),
  ('51810000-0000-0000-0000-000000000002', '51800000-0000-0000-0000-000000000002', 'HAB 518 Condo B', '00000000-0000-0000-0000-000000051802');
insert into public.organization_memberships (organization_id, user_id, role) values
  ('51800000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000051801', 'organization_owner'),
  ('51800000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000051802', 'organization_owner');
insert into public.condominium_memberships (condominium_id, user_id, role) values
  ('51810000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000051801', 'condominium_admin'),
  ('51810000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000051802', 'condominium_admin'),
  ('51810000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000051803', 'owner');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000051801', true);

select lives_ok(
  $$insert into public.units (id, condominium_id, code, type, created_by)
    values ('51820000-0000-0000-0000-000000000001', '51810000-0000-0000-0000-000000000001', 'A-1', 'apartment', '00000000-0000-0000-0000-000000051801')$$,
  'condominium admin creates a unit'
);
select is(
  (select count(*) from public.structure_events
    where entity_id = '51820000-0000-0000-0000-000000000001' and event_type = 'created'),
  1::bigint,
  'unit creation is recorded in the audit trail'
);

select lives_ok(
  $$update public.units set status = 'inactive' where id = '51820000-0000-0000-0000-000000000001'$$,
  'condominium admin archives the unit'
);
select is(
  (select row(previous_status, new_status)::text from public.structure_events
    where entity_id = '51820000-0000-0000-0000-000000000001' and event_type = 'archived'),
  row('active', 'inactive')::text,
  'archival transition is captured with the previous and resulting status'
);

select lives_ok(
  $$update public.units set status = 'active' where id = '51820000-0000-0000-0000-000000000001'$$,
  'condominium admin reactivates the unit'
);
select is(
  (select count(*) from public.structure_events
    where entity_id = '51820000-0000-0000-0000-000000000001' and event_type = 'reactivated'),
  1::bigint,
  'reactivation transition is also captured'
);

select lives_ok(
  $$update public.units set floor = '3' where id = '51820000-0000-0000-0000-000000000001'$$,
  'editing a non-status field does not error'
);
select is(
  (select count(*) from public.structure_events where entity_id = '51820000-0000-0000-0000-000000000001'),
  3::bigint,
  'a plain field edit does not add a redundant audit row'
);

select ok(
  not has_table_privilege('authenticated', 'public.structure_events', 'INSERT'),
  'authenticated role has no direct insert grant; writes only happen through the audit trigger'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000051802', true);
select is(
  (select count(*) from public.structure_events where entity_id = '51820000-0000-0000-0000-000000000001'),
  0::bigint,
  'an admin from a different organization cannot read another condominium''s archival audit trail'
);
select throws_ok(
  $$query$select * from public.list_admin_audit_events('51810000-0000-0000-0000-000000000001', 'structure')$query$$,
  'P0001',
  'not authorized to read administrator audit log',
  'the unified audit feed also fails closed for an admin outside the condominium'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000051803', true);
select is(
  (select count(*) from public.structure_events where condominium_id = '51810000-0000-0000-0000-000000000001'),
  0::bigint,
  'resident of same condominium cannot directly query private archival audit rows'
);
select throws_ok(
  $select * from public.list_admin_audit_events('51810000-0000-0000-0000-000000000001', 'structure')$,
  'P0001',
  'not authorized to read administrator audit log',
  'resident of same condominium is denied unified privileged audit feed'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000051801', true);
select is(
  (select count(*) from public.list_admin_audit_events('51810000-0000-0000-0000-000000000001', 'structure')),
  3::bigint,
  'the unified audit feed surfaces the structure module for the owning condominium admin'
);
reset role;

select * from finish();
rollback;
