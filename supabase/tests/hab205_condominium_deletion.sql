begin;

create extension if not exists pgtap with schema extensions;
select plan(30);

insert into auth.users(id, email)
values
  ('20500000-0000-4000-8000-000000000001', 'hab205-owner-a@example.com'),
  ('20500000-0000-4000-8000-000000000002', 'hab205-admin-a@example.com'),
  ('20500000-0000-4000-8000-000000000003', 'hab205-owner-b@example.com');

insert into public.organizations(id, name, created_by)
values
  ('20510000-0000-4000-8000-000000000001', 'HAB-205 Organization A', '20500000-0000-4000-8000-000000000001'),
  ('20510000-0000-4000-8000-000000000002', 'HAB-205 Organization B', '20500000-0000-4000-8000-000000000003');

insert into public.condominiums(id, organization_id, name, created_by)
values
  ('20520000-0000-4000-8000-000000000001', '20510000-0000-4000-8000-000000000001', 'Residencia HAB 205 A', '20500000-0000-4000-8000-000000000001'),
  ('20520000-0000-4000-8000-000000000002', '20510000-0000-4000-8000-000000000002', 'Residencia HAB 205 B', '20500000-0000-4000-8000-000000000003');

insert into public.organization_memberships(organization_id, user_id, role)
values
  ('20510000-0000-4000-8000-000000000001', '20500000-0000-4000-8000-000000000001', 'organization_owner'),
  ('20510000-0000-4000-8000-000000000002', '20500000-0000-4000-8000-000000000003', 'organization_owner');

insert into public.condominium_memberships(condominium_id, user_id, role)
values
  ('20520000-0000-4000-8000-000000000001', '20500000-0000-4000-8000-000000000001', 'condominium_admin'),
  ('20520000-0000-4000-8000-000000000001', '20500000-0000-4000-8000-000000000002', 'condominium_admin'),
  ('20520000-0000-4000-8000-000000000002', '20500000-0000-4000-8000-000000000003', 'condominium_admin');

-- HAB-413: a realistic condominium, not an empty one.
--
-- This test used to delete a condominium that had no buildings, no units, no people and no money.
-- It passed and told us nothing: the shape it exercised does not occur in production, where
-- recording who owns a unit is most of what the product does. The purge could not delete any
-- condominium holding a `unit_owners` row, and no gate noticed.
--
-- Everything below exists so the deletion under test has to survive a tenant that looks like a
-- real one: structure, people, ownership, occupancy, money, treasury, and the commercial rows
-- HAB-410 now attaches to every condominium.

insert into public.buildings(id, condominium_id, name, created_by)
values ('20530000-0000-4000-8000-000000000001', '20520000-0000-4000-8000-000000000001', 'Torre A', '20500000-0000-4000-8000-000000000001');

insert into public.units(id, condominium_id, building_id, code, type, status, created_by)
values
  ('20540000-0000-4000-8000-000000000001', '20520000-0000-4000-8000-000000000001', '20530000-0000-4000-8000-000000000001', '1A', 'apartment', 'active', '20500000-0000-4000-8000-000000000001'),
  ('20540000-0000-4000-8000-000000000002', '20520000-0000-4000-8000-000000000001', '20530000-0000-4000-8000-000000000001', '1B', 'apartment', 'active', '20500000-0000-4000-8000-000000000001');

insert into public.people(id, condominium_id, first_name, last_name, status, created_by)
values
  ('20550000-0000-4000-8000-000000000001', '20520000-0000-4000-8000-000000000001', 'Ana', 'Duarte', 'active', '20500000-0000-4000-8000-000000000001'),
  ('20550000-0000-4000-8000-000000000002', '20520000-0000-4000-8000-000000000001', 'Luis', 'Marcano', 'active', '20500000-0000-4000-8000-000000000001');

-- The two tables the purge could not reach. `unit_owners` is append-only guarded, so removing it
-- depends on the purge authorization the RPC registers -- which is the machinery that already
-- existed and had nothing calling it.
insert into public.unit_owners(unit_id, person_id, is_primary_contact, created_by)
values ('20540000-0000-4000-8000-000000000001', '20550000-0000-4000-8000-000000000001', true, '20500000-0000-4000-8000-000000000001');

insert into public.unit_occupancies(unit_id, person_id, occupancy_type, created_by)
values ('20540000-0000-4000-8000-000000000002', '20550000-0000-4000-8000-000000000002', 'tenant', '20500000-0000-4000-8000-000000000001');

insert into public.treasury_accounts(id, condominium_id, name, account_type, currency_code, created_by)
values ('20560000-0000-4000-8000-000000000001', '20520000-0000-4000-8000-000000000001', 'Cuenta operativa', 'bank', 'USD', '20500000-0000-4000-8000-000000000001');

insert into public.receivable_items(id, condominium_id, unit_id, item_type, description, issue_date, currency_code, original_amount, created_by)
values ('20570000-0000-4000-8000-000000000001', '20520000-0000-4000-8000-000000000001', '20540000-0000-4000-8000-000000000001', 'charge', 'Cuota de prueba HAB-205', current_date, 'USD', 50.00, '20500000-0000-4000-8000-000000000001');

-- The commercial rows HAB-410 attaches to every condominium. They carry `condominium_id`, so the
-- existing pass already reaches them -- asserted below rather than assumed.
insert into public.subscriptions(id, condominium_id, status, commercial_status)
values ('20590000-0000-4000-8000-000000000001', '20520000-0000-4000-8000-000000000001', 'active', 'not_yet_confirmed');

insert into public.subscription_terms(subscription_id, plan_code, contracted_period_amount, billing_period, origin, catalog_reference_amount, effective_from)
values ('20590000-0000-4000-8000-000000000001', 'esencial', 29.00, 'monthly', 'grandfathered', 29.00, current_date);

insert into public.subscription_events(subscription_id, condominium_id, event_type, to_status, to_plan, reason)
values ('20590000-0000-4000-8000-000000000001', '20520000-0000-4000-8000-000000000001', 'migrated', 'active', 'esencial', 'HAB-205 fixture');

select has_table('public', 'condominium_deletion_jobs', 'deletion jobs persist only the cleanup tombstone');
select has_function('public', 'request_condominium_deletion', array['uuid','text'], 'owner-only deletion RPC exists');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','20500000-0000-4000-8000-000000000001','role','authenticated','email','hab205-owner-a@example.com')::text, true);

select lives_ok(
  $$select public.create_community_document('20520000-0000-4000-8000-000000000001','Archivo de prueba HAB-205',null,null,null,'management',null)$$,
  'owner creates tenant data before destructive reset'
);

select set_config(
  'hab205.document_id',
  (select id::text from public.community_documents where condominium_id='20520000-0000-4000-8000-000000000001' and title='Archivo de prueba HAB-205'),
  true
);

select lives_ok(
  format(
    $q$select public.record_community_document_version('%s','20580000-0000-4000-8000-000000000001','hab205.pdf','application/pdf',128,'%s','community-documents/20520000-0000-4000-8000-000000000001/%s/20580000-0000-4000-8000-000000000001','Prueba de limpieza')$q$,
    current_setting('hab205.document_id'),
    repeat('a',64),
    current_setting('hab205.document_id')
  ),
  'tenant file metadata exists before reset'
);

select set_config('request.jwt.claims', json_build_object('sub','20500000-0000-4000-8000-000000000002','role','authenticated','email','hab205-admin-a@example.com')::text, true);
select throws_ok(
  $$select public.request_condominium_deletion('20520000-0000-4000-8000-000000000001','ELIMINAR Residencia HAB 205 A')$$,
  '42501',
  'Organization owner required',
  'condominium admin cannot delete the residence'
);

select set_config('request.jwt.claims', json_build_object('sub','20500000-0000-4000-8000-000000000003','role','authenticated','email','hab205-owner-b@example.com')::text, true);
select throws_ok(
  $$select public.request_condominium_deletion('20520000-0000-4000-8000-000000000001','ELIMINAR Residencia HAB 205 A')$$,
  '42501',
  'Organization owner required',
  'owner of another tenant cannot delete this residence'
);

select set_config('request.jwt.claims', json_build_object('sub','20500000-0000-4000-8000-000000000001','role','authenticated','email','hab205-owner-a@example.com')::text, true);
select throws_ok(
  $$select public.request_condominium_deletion('20520000-0000-4000-8000-000000000001','Residencia HAB 205 A')$$,
  '22023',
  'Confirmation does not match condominium name',
  'exact destructive confirmation is mandatory'
);

create temporary table hab205_deletion as
select *
from public.request_condominium_deletion(
  '20520000-0000-4000-8000-000000000001',
  'ELIMINAR Residencia HAB 205 A'
);

select is((select count(*)::integer from hab205_deletion), 1, 'owner receives one deletion cleanup job');
select is((select storage_object_count from hab205_deletion), 1, 'R2 manifest includes the tenant private object');

reset role;
select is((select count(*)::integer from public.condominiums where id='20520000-0000-4000-8000-000000000001'), 0, 'target condominium is removed');
select is((select count(*)::integer from public.organizations where id='20510000-0000-4000-8000-000000000001'), 1, 'organization survives so onboarding can start over');
select is((select count(*)::integer from auth.users where id='20500000-0000-4000-8000-000000000001'), 1, 'Auth user survives condominium deletion');
select is((select count(*)::integer from public.condominiums where id='20520000-0000-4000-8000-000000000002'), 1, 'other tenant remains untouched');
select is((select count(*)::integer from public.community_document_versions where condominium_id='20520000-0000-4000-8000-000000000001'), 0, 'tenant document metadata is removed');

-- HAB-413: the rows that used to make this operation impossible.
select is((select count(*)::integer from public.unit_owners where unit_id in ('20540000-0000-4000-8000-000000000001','20540000-0000-4000-8000-000000000002')), 0, 'ownership history is removed with its units');
select is((select count(*)::integer from public.unit_occupancies where unit_id in ('20540000-0000-4000-8000-000000000001','20540000-0000-4000-8000-000000000002')), 0, 'occupancy history is removed with its units');
select is((select count(*)::integer from public.units where condominium_id='20520000-0000-4000-8000-000000000001'), 0, 'units are removed');
select is((select count(*)::integer from public.buildings where condominium_id='20520000-0000-4000-8000-000000000001'), 0, 'buildings are removed');
select is((select count(*)::integer from public.people where condominium_id='20520000-0000-4000-8000-000000000001'), 0, 'people are removed');

-- Financial rows reach the condominium through NO ACTION foreign keys, so they can only disappear
-- by being deleted in dependency order, never by a cascade nobody asked for.
select is((select count(*)::integer from public.receivable_items where condominium_id='20520000-0000-4000-8000-000000000001'), 0, 'receivables are removed');
select is((select count(*)::integer from public.treasury_accounts where condominium_id='20520000-0000-4000-8000-000000000001'), 0, 'treasury accounts are removed');

-- The commercial foundation goes with the tenant, contracted terms included through their cascade.
select is((select count(*)::integer from public.subscriptions where condominium_id='20520000-0000-4000-8000-000000000001'), 0, 'the subscription is removed');
select is((select count(*)::integer from public.subscription_terms where subscription_id='20590000-0000-4000-8000-000000000001'), 0, 'contracted terms are removed with the subscription');
select is((select count(*)::integer from public.subscription_events where condominium_id='20520000-0000-4000-8000-000000000001'), 0, 'subscription events are removed');

-- What must survive: the catalogue is infrastructure, not tenant data.
select is((select count(*)::integer from public.plans), 5, 'the plan catalogue survives the purge');
select is((select count(*)::integer from public.capabilities), 22, 'the capability registry survives the purge');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','20500000-0000-4000-8000-000000000003','role','authenticated','email','hab205-owner-b@example.com')::text, true);
select is(
  public.get_condominium_deletion_storage_keys((select job_id from hab205_deletion)),
  null::text[],
  'another user cannot read the cleanup manifest'
);

select set_config('request.jwt.claims', json_build_object('sub','20500000-0000-4000-8000-000000000001','role','authenticated','email','hab205-owner-a@example.com')::text, true);
select is(
  public.get_condominium_deletion_storage_keys((select job_id from hab205_deletion)),
  array[(select storage_keys[1] from hab205_deletion)],
  'requesting owner can retry private storage cleanup'
);
select ok(
  public.finish_condominium_deletion_storage_cleanup((select job_id from hab205_deletion), true, null),
  'owner can mark successful private storage cleanup'
);

reset role;
select is(
  (select storage_cleanup_status from public.condominium_deletion_jobs where id=(select job_id from hab205_deletion)),
  'completed',
  'successful cleanup leaves a completed tombstone without tenant data'
);

select * from finish();
rollback;
