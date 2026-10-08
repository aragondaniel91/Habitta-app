begin;
select plan(20);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('50000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab500-admin@test.local', 'x', now(), now());
insert into public.organizations (id, name, created_by)
values ('50000000-0000-4000-8000-000000000010', 'HAB 500 Org', '50000000-0000-4000-8000-000000000001');
insert into public.condominiums (id, organization_id, name, created_by)
values ('50000000-0000-4000-8000-000000000020', '50000000-0000-4000-8000-000000000010', 'HAB 500 Condo', '50000000-0000-4000-8000-000000000001');
insert into public.organization_memberships (organization_id, user_id, role)
values ('50000000-0000-4000-8000-000000000010', '50000000-0000-4000-8000-000000000001', 'organization_owner');
insert into public.condominium_memberships (condominium_id, user_id, role)
values ('50000000-0000-4000-8000-000000000020', '50000000-0000-4000-8000-000000000001', 'condominium_admin');
insert into public.units (id, condominium_id, code, type, created_by) values
  ('50000000-0000-4000-8000-000000000101', '50000000-0000-4000-8000-000000000020', 'E-100', 'apartment', '50000000-0000-4000-8000-000000000001'),
  ('50000000-0000-4000-8000-000000000102', '50000000-0000-4000-8000-000000000020', 'E-101', 'apartment', '50000000-0000-4000-8000-000000000001'),
  ('50000000-0000-4000-8000-000000000103', '50000000-0000-4000-8000-000000000020', 'E-102', 'apartment', '50000000-0000-4000-8000-000000000001'),
  ('50000000-0000-4000-8000-000000000104', '50000000-0000-4000-8000-000000000020', 'E-103', 'apartment', '50000000-0000-4000-8000-000000000001');
insert into public.people (id, condominium_id, first_name, last_name, created_by) values
  ('50000000-0000-4000-8000-000000000201', '50000000-0000-4000-8000-000000000020', 'Ana', 'Uno', '50000000-0000-4000-8000-000000000001'),
  ('50000000-0000-4000-8000-000000000202', '50000000-0000-4000-8000-000000000020', 'Beto', 'Dos', '50000000-0000-4000-8000-000000000001'),
  ('50000000-0000-4000-8000-000000000203', '50000000-0000-4000-8000-000000000020', 'Cora', 'Tres', '50000000-0000-4000-8000-000000000001'),
  ('50000000-0000-4000-8000-000000000204', '50000000-0000-4000-8000-000000000020', 'Dani', 'Cuatro', '50000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000001', true);

-- New valid totals can reach exactly 100, but never cross it. Null shares are deliberately unknown.
select lives_ok($$insert into public.unit_owners(unit_id, person_id, ownership_percentage, created_by) values
  ('50000000-0000-4000-8000-000000000101', '50000000-0000-4000-8000-000000000201', 50, '50000000-0000-4000-8000-000000000001')$$, 'first known owner share is accepted');
select lives_ok($$insert into public.unit_owners(unit_id, person_id, ownership_percentage, created_by) values
  ('50000000-0000-4000-8000-000000000101', '50000000-0000-4000-8000-000000000202', 50, '50000000-0000-4000-8000-000000000001')$$, 'known owner shares can total exactly 100');
select throws_ok($$insert into public.unit_owners(unit_id, person_id, ownership_percentage, created_by) values
  ('50000000-0000-4000-8000-000000000101', '50000000-0000-4000-8000-000000000203', 1, '50000000-0000-4000-8000-000000000001')$$, 'P0001', 'unit ownership percentage total cannot exceed 100 for unit 50000000-0000-4000-8000-000000000101', 'a new active known share cannot push a valid total over 100');
select lives_ok($$insert into public.unit_owners(unit_id, person_id, ownership_percentage, created_by) values
  ('50000000-0000-4000-8000-000000000102', '50000000-0000-4000-8000-000000000201', 100, '50000000-0000-4000-8000-000000000001')$$, 'full known share is accepted');
select lives_ok($$insert into public.unit_owners(unit_id, person_id, ownership_percentage, created_by) values
  ('50000000-0000-4000-8000-000000000102', '50000000-0000-4000-8000-000000000202', null, '50000000-0000-4000-8000-000000000001')$$, 'null owner shares remain unknown and do not count');
select lives_ok($$update public.unit_owners set ends_at = current_date where unit_id = '50000000-0000-4000-8000-000000000102' and person_id = '50000000-0000-4000-8000-000000000201'$$, 'a closed owner no longer contributes to the active known total');
select lives_ok($$insert into public.unit_owners(unit_id, person_id, ownership_percentage, created_by) values
  ('50000000-0000-4000-8000-000000000102', '50000000-0000-4000-8000-000000000203', 100, '50000000-0000-4000-8000-000000000001')$$, 'a replacement owner can hold 100 after the prior owner closes');

-- Seed a pre-guard 200% legacy aggregate, then exercise the real audited RPC and AFTER trigger.
reset role;
alter table public.unit_owners disable trigger unit_owners_percentage_sum_guard;
insert into public.unit_owners(unit_id, person_id, ownership_percentage, created_by) values
  ('50000000-0000-4000-8000-000000000103', '50000000-0000-4000-8000-000000000201', 100, '50000000-0000-4000-8000-000000000001'),
  ('50000000-0000-4000-8000-000000000103', '50000000-0000-4000-8000-000000000202', 100, '50000000-0000-4000-8000-000000000001');
alter table public.unit_owners enable trigger unit_owners_percentage_sum_guard;
set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000001', true);
select throws_ok($$insert into public.unit_owners(unit_id, person_id, ownership_percentage, created_by) values
  ('50000000-0000-4000-8000-000000000103', '50000000-0000-4000-8000-000000000203', 1, '50000000-0000-4000-8000-000000000001')$$, 'P0001', 'unit ownership percentage total above 100 must be strictly reduced for unit 50000000-0000-4000-8000-000000000103', 'a legacy invalid aggregate cannot be preserved or worsened');
select lives_ok($$select public.correct_unit_owner_percentage('50000000-0000-4000-8000-000000000020', (select id from public.unit_owners where unit_id='50000000-0000-4000-8000-000000000103' and person_id='50000000-0000-4000-8000-000000000201'), 50)$$, 'audited correction permits 200 to 150 reduction');
select lives_ok($$select public.correct_unit_owner_percentage('50000000-0000-4000-8000-000000000020', (select id from public.unit_owners where unit_id='50000000-0000-4000-8000-000000000103' and person_id='50000000-0000-4000-8000-000000000202'), 50)$$, 'audited correction permits 150 to 100 reduction');
select is((select sum(ownership_percentage) from public.unit_owners where unit_id='50000000-0000-4000-8000-000000000103' and ends_at is null), 100::numeric, 'legacy aggregate is repaired incrementally to 100');
select is((select count(*) from public.person_relationship_corrections where relationship_kind='ownership'), 2::bigint, 'only successful owner corrections are audited');

-- The two other correction RPCs execute their immutable-history guards and write audit history.
insert into public.unit_occupancies(id, unit_id, person_id, occupancy_type, created_by) values
  ('50000000-0000-4000-8000-000000000301', '50000000-0000-4000-8000-000000000101', '50000000-0000-4000-8000-000000000201', 'tenant', '50000000-0000-4000-8000-000000000001');
select throws_ok($$update public.unit_occupancies set occupancy_type='owner_occupant' where id='50000000-0000-4000-8000-000000000301'$$, 'P0001', 'occupancy type requires an audited correction', 'occupancy history cannot be silently rewritten');
select lives_ok($$select public.correct_unit_occupancy_type('50000000-0000-4000-8000-000000000020', '50000000-0000-4000-8000-000000000301', 'owner_occupant')$$, 'audited occupancy correction executes');
insert into public.condominium_person_relationships(id, condominium_id, person_id, relationship_type, title, created_by) values
  ('50000000-0000-4000-8000-000000000401', '50000000-0000-4000-8000-000000000020', '50000000-0000-4000-8000-000000000201', 'board_member', 'Vocal', '50000000-0000-4000-8000-000000000001');
select throws_ok($$update public.condominium_person_relationships set title='Secretaria' where id='50000000-0000-4000-8000-000000000401'$$, 'P0001', 'relationship attributes require an audited correction', 'community relationship history cannot be silently rewritten');
select lives_ok($$select public.correct_community_person_relationship('50000000-0000-4000-8000-000000000020', '50000000-0000-4000-8000-000000000401', 'board_member', 'Secretaria')$$, 'audited community-role correction executes');

-- A transfer and revert restore an actual legacy 200% snapshot without opening a general bypass.
reset role;
alter table public.unit_owners disable trigger unit_owners_percentage_sum_guard;
insert into public.unit_owners(unit_id, person_id, ownership_percentage, created_by) values
  ('50000000-0000-4000-8000-000000000104', '50000000-0000-4000-8000-000000000201', 100, '50000000-0000-4000-8000-000000000001'),
  ('50000000-0000-4000-8000-000000000104', '50000000-0000-4000-8000-000000000202', 100, '50000000-0000-4000-8000-000000000001');
alter table public.unit_owners enable trigger unit_owners_percentage_sum_guard;
set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000001', true);
select lives_ok($$select public.transfer_unit_ownership('50000000-0000-4000-8000-000000000020', '50000000-0000-4000-8000-000000000104', current_date - 1, '[{"person_id":"50000000-0000-4000-8000-000000000203","ownership_percentage":100,"is_primary_contact":true}]'::jsonb, null, 'Transfer legacy')$$, 'transfer can move a legacy invalid aggregate to a valid owner');
select lives_ok($$select public.revert_unit_ownership_transfer('50000000-0000-4000-8000-000000000020', (select id from public.ownership_transfers where notes='Transfer legacy'), 'Restaurar registro previo')$$, 'revert restores the exact legacy snapshot through its private marker');
select is((select sum(ownership_percentage) from public.unit_owners where unit_id='50000000-0000-4000-8000-000000000104' and ends_at is null), 200::numeric, 'revert preserves the historical 200% snapshot');
select is((select count(*) from public.unit_owner_sum_guard_revert_bypasses), 0::bigint, 'the private revert marker is consumed before the RPC returns');

select * from finish();
rollback;
