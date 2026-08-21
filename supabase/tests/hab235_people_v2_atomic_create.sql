begin;
select plan(50);

insert into auth.users(id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('23500000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@235.test', 'x', now(), now()),
  ('23500000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other@235.test', 'x', now(), now());
insert into public.organizations(id, name, created_by) values
  ('23510000-0000-0000-0000-000000000001', 'HAB235 A', '23500000-0000-0000-0000-000000000001'),
  ('23510000-0000-0000-0000-000000000002', 'HAB235 B', '23500000-0000-0000-0000-000000000002');
insert into public.condominiums(id, organization_id, name, created_by) values
  ('23520000-0000-0000-0000-000000000001', '23510000-0000-0000-0000-000000000001', 'HAB235 A', '23500000-0000-0000-0000-000000000001'),
  ('23520000-0000-0000-0000-000000000002', '23510000-0000-0000-0000-000000000002', 'HAB235 B', '23500000-0000-0000-0000-000000000002');
insert into public.condominium_memberships(condominium_id, user_id, role)
values ('23520000-0000-0000-0000-000000000001', '23500000-0000-0000-0000-000000000001', 'condominium_admin');
insert into public.units(id, condominium_id, code, type, created_by) values
  ('23530000-0000-0000-0000-000000000001', '23520000-0000-0000-0000-000000000001', 'A-1', 'apartment', '23500000-0000-0000-0000-000000000001'),
  ('23530000-0000-0000-0000-000000000002', '23520000-0000-0000-0000-000000000001', 'A-2', 'apartment', '23500000-0000-0000-0000-000000000001'),
  ('23530000-0000-0000-0000-000000000003', '23520000-0000-0000-0000-000000000002', 'B-1', 'apartment', '23500000-0000-0000-0000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub', '23500000-0000-0000-0000-000000000001', true);

select lives_ok($$select public.create_person_with_initial_context(
  '23520000-0000-0000-0000-000000000001', 'Solo', 'Activo', 'Cédula V', '23501', 'solo-activo@235.test', null, 'active'
)$$, 'person-only active is created');
select lives_ok($$select public.create_person_with_initial_context(
  '23520000-0000-0000-0000-000000000001', 'Solo', 'Inactivo', 'Cédula V', '23502', 'solo-inactivo@235.test', null, 'inactive'
)$$, 'person-only inactive is allowed');
select throws_ok($$select public.create_person_with_initial_context(
  '23520000-0000-0000-0000-000000000001', 'Inactivo', 'Owner', 'Cédula V', '23503', 'inactivo-owner@235.test', null, 'inactive', 'owner', '23530000-0000-0000-0000-000000000001'
)$$, 'P0001', 'inactive_person_initial_relationship_forbidden', 'inactive owner fails closed');
select throws_ok($$select public.create_person_with_initial_context(
  '23520000-0000-0000-0000-000000000001', 'Inactivo', 'Tenant', 'Cédula V', '23504', 'inactivo-tenant@235.test', null, 'inactive', 'tenant', '23530000-0000-0000-0000-000000000001'
)$$, 'P0001', 'inactive_person_initial_relationship_forbidden', 'inactive tenant fails closed');
select lives_ok($$select public.create_person_with_initial_context(
  '23520000-0000-0000-0000-000000000001', 'Olga', 'Owner', 'Cédula V', '23505', 'owner@235.test', null, 'active', 'owner', '23530000-0000-0000-0000-000000000001', 75
)$$, 'owner is created atomically');
select lives_ok($$select public.create_person_with_initial_context(
  '23520000-0000-0000-0000-000000000001', 'Omar', 'Owner Occupant', 'Cédula V', '23506', 'owner-occupant@235.test', null, 'active', 'owner_occupant', '23530000-0000-0000-0000-000000000001', 25
)$$, 'owner occupant is created atomically');
select lives_ok($$select public.create_person_with_initial_context(
  '23520000-0000-0000-0000-000000000001', 'Tania', 'Tenant', 'Cédula V', '23507', 'tenant@235.test', null, 'active', 'tenant', '23530000-0000-0000-0000-000000000001'
)$$, 'tenant is created atomically');
select lives_ok($$select public.create_person_with_initial_context(
  '23520000-0000-0000-0000-000000000001', 'Fabi', 'Family', 'Cédula V', '23508', 'family@235.test', null, 'active', 'family_member', '23530000-0000-0000-0000-000000000001'
)$$, 'family member is created atomically');
select lives_ok($$select public.create_person_with_initial_context(
  '23520000-0000-0000-0000-000000000001', 'Ari', 'Authorized', 'Cédula V', '23509', 'authorized@235.test', null, 'active', 'authorized_occupant', '23530000-0000-0000-0000-000000000001'
)$$, 'authorized occupant is created atomically');

select lives_ok($$select public.create_person_with_initial_context(
  '23520000-0000-0000-0000-000000000001', 'Berta', 'Board', 'Cédula V', '23510', 'board@235.test', null, 'active', 'board_member', null, null, null, 'Vocal'
)$$, 'board member is created without RBAC');
select lives_ok($$select public.create_person_with_initial_context(
  '23520000-0000-0000-0000-000000000001', 'Ana', 'Admin Contact', 'Cédula V', '23511', 'administrator@235.test', null, 'active', 'administrator_contact', null, null, null, 'Contacto'
)$$, 'administrator contact is created without RBAC');
select lives_ok($$select public.create_person_with_initial_context(
  '23520000-0000-0000-0000-000000000001', 'Rene', 'Representative', 'Cédula V', '23512', 'representative@235.test', null, 'active', 'representative', null, null, null, 'Representante'
)$$, 'representative is created without RBAC');
select lives_ok($$select public.create_person_with_initial_context(
  '23520000-0000-0000-0000-000000000001', 'Emma', 'Emergency', 'Cédula V', '23513', 'emergency@235.test', null, 'active', 'emergency_contact'
)$$, 'emergency contact is created without RBAC');
select lives_ok($$select public.create_person_with_initial_context(
  '23520000-0000-0000-0000-000000000001', 'Otto', 'Other', 'Cédula V', '23514', 'other@235.test', null, 'active', 'other'
)$$, 'other relationship is created without RBAC');

select lives_ok($$select public.create_person_with_initial_context(
  '23520000-0000-0000-0000-000000000001', 'Noop', 'Communication', 'Cédula V', '23515', 'noop@235.test', null, 'active', 'none', null, null, null, null, 'none', false
)$$, 'none plus false communication is a person-only no-op');
select throws_ok($$select public.create_person_with_initial_context(
  '23520000-0000-0000-0000-000000000001', 'Bad', 'Primary', 'Cédula V', '23516', 'bad-primary@235.test', null, 'active', 'none', null, null, null, null, 'primary', false
)$$, 'P0001', 'communication_unit_required', 'primary communication requires a unit relationship');
select throws_ok($$select public.create_person_with_initial_context(
  '23520000-0000-0000-0000-000000000001', 'Bad', 'General', 'Cédula V', '23517', 'bad-general@235.test', null, 'active', 'board_member', null, null, null, null, 'none', true
)$$, 'P0001', 'communication_unit_required', 'general communication requires a unit relationship');
select throws_ok($$select public.create_person_with_initial_context(
  '23520000-0000-0000-0000-000000000001', 'Cross', 'Tenant', 'Cédula V', '23518', 'cross@235.test', null, 'active', 'owner', '23530000-0000-0000-0000-000000000003'
)$$, 'P0001', 'initial_relationship_unit_not_found', 'cross-tenant unit fails closed');
select throws_ok($$select public.create_person_with_initial_context(
  '23520000-0000-0000-0000-000000000001', 'Bad', 'Percentage', 'Cédula V', '23519', 'percentage-101@235.test', null, 'active', 'owner', '23530000-0000-0000-0000-000000000001', 101
)$$, 'P0001', 'initial_ownership_percentage_invalid', 'ownership above 100 rolls back');
select throws_ok($$select public.create_person_with_initial_context(
  '23520000-0000-0000-0000-000000000001', 'Bad', 'Zero', 'Cédula V', '23520', 'percentage-zero@235.test', null, 'active', 'owner', '23530000-0000-0000-0000-000000000001', 0
)$$, 'P0001', 'initial_ownership_percentage_invalid', 'ownership at zero rolls back');

select lives_ok($$select public.create_person_with_initial_context(
  '23520000-0000-0000-0000-000000000001', 'Paula', 'Primary', 'Cédula V', '23521', 'primary@235.test', null, 'active', 'owner', '23530000-0000-0000-0000-000000000001', 10, null, null, 'primary', true
)$$, 'owner can be created as primary recipient');
select lives_ok($$select public.create_person_with_initial_context(
  '23520000-0000-0000-0000-000000000001', 'Bruno', 'Additional', 'Cédula V', '23522', 'additional@235.test', null, 'active', 'tenant', '23530000-0000-0000-0000-000000000001', null, null, null, 'additional', false
)$$, 'additional recipient follows an existing primary');
select throws_ok($$select public.create_person_with_initial_context(
  '23520000-0000-0000-0000-000000000001', 'Clara', 'No Primary', 'Cédula V', '23523', 'no-primary@235.test', null, 'active', 'tenant', '23530000-0000-0000-0000-000000000002', null, null, null, 'additional', false
)$$, 'P0001', 'financial_primary_required', 'additional without a primary rolls back the entire create');

reset role;
select is((select count(*) from public.people where condominium_id = '23520000-0000-0000-0000-000000000001' and email = 'solo-activo@235.test'), 1::bigint, 'person-only active creates one person');
select is((select count(*) from public.people where condominium_id = '23520000-0000-0000-0000-000000000001' and email = 'solo-inactivo@235.test' and status = 'inactive'), 1::bigint, 'person-only inactive remains inactive');
select is((select count(*) from public.unit_owners o join public.people p on p.id = o.person_id where p.email in ('solo-activo@235.test', 'solo-inactivo@235.test', 'noop@235.test')), 0::bigint, 'person-only paths create no ownerships');
select is((select count(*) from public.unit_occupancies o join public.people p on p.id = o.person_id where p.email in ('solo-activo@235.test', 'solo-inactivo@235.test', 'noop@235.test')), 0::bigint, 'person-only paths create no occupancies');
select is((select count(*) from public.condominium_person_relationships r join public.people p on p.id = r.person_id where p.email in ('solo-activo@235.test', 'solo-inactivo@235.test', 'noop@235.test')), 0::bigint, 'person-only paths create no condominium relationship');
select is((select count(*) from public.unit_communication_assignments a join public.people p on p.id = a.person_id where p.email = 'noop@235.test'), 0::bigint, 'none plus false creates no communication assignment');
select is((select count(*) from public.invitations where condominium_id = '23520000-0000-0000-0000-000000000001'), 0::bigint, 'atomic create creates no invitation');
select is((select count(*) from auth.users), 2::bigint, 'atomic create creates no auth user');
select is((select count(*) from public.people where email in ('inactivo-owner@235.test', 'inactivo-tenant@235.test', 'bad-primary@235.test', 'bad-general@235.test', 'cross@235.test', 'percentage-101@235.test', 'percentage-zero@235.test', 'no-primary@235.test')), 0::bigint, 'failed creates leave no partial person');
select is((select count(*) from public.unit_owners o join public.people p on p.id = o.person_id where p.email in ('percentage-101@235.test', 'percentage-zero@235.test', 'cross@235.test')), 0::bigint, 'failed ownership paths leave no ownership');
select is((select count(*) from public.unit_occupancies o join public.people p on p.id = o.person_id where p.email in ('no-primary@235.test', 'cross@235.test')), 0::bigint, 'failed occupancy paths leave no occupancy');
select is((select count(*) from public.condominium_person_relationships r join public.people p on p.id = r.person_id where p.email = 'bad-general@235.test'), 0::bigint, 'failed community relationship rolls back');
select is((select count(*) from public.unit_communication_assignments a join public.people p on p.id = a.person_id where p.email = 'no-primary@235.test'), 0::bigint, 'failed additional recipient leaves no assignment');
select is((select count(*) from public.unit_owners o join public.people p on p.id = o.person_id where p.email = 'owner@235.test'), 1::bigint, 'owner creates one ownership');
select is((select count(*) from public.unit_owners o join public.people p on p.id = o.person_id where p.email = 'owner-occupant@235.test' and o.unit_id = '23530000-0000-0000-0000-000000000001'), 1::bigint, 'owner occupant creates one ownership for its unit');
select is((select count(*) from public.unit_occupancies o join public.people p on p.id = o.person_id where p.email = 'owner-occupant@235.test' and o.unit_id = '23530000-0000-0000-0000-000000000001' and o.occupancy_type = 'owner_occupant'), 1::bigint, 'owner occupant creates one matching occupancy');
select ok((select o.person_id = q.person_id and o.unit_id = q.unit_id from public.unit_owners o join public.unit_occupancies q on q.person_id = o.person_id and q.unit_id = o.unit_id join public.people p on p.id = o.person_id where p.email = 'owner-occupant@235.test'), 'owner occupant rows share person and unit identity');
select is((select count(*) from public.unit_occupancies o join public.people p on p.id = o.person_id where p.email in ('tenant@235.test', 'family@235.test', 'authorized@235.test')), 3::bigint, 'tenant, family, and authorized occupant each create an occupancy');
select is((select count(*) from public.condominium_person_relationships where condominium_id = '23520000-0000-0000-0000-000000000001' and relationship_type in ('board_member', 'administrator_contact', 'representative', 'emergency_contact', 'other')), 5::bigint, 'all condominium-level relationship types are persisted');
select is((select count(*) from public.condominium_memberships), 1::bigint, 'community relationships grant no condominium RBAC membership');
select is((select count(*) from public.organization_memberships), 0::bigint, 'community relationships grant no organization RBAC membership');
select is((select financial_role::text from public.unit_communication_assignments a join public.people p on p.id = a.person_id where p.email = 'primary@235.test' and a.effective_to is null), 'primary', 'primary communication is created');
select ok((select general_recipient from public.unit_communication_assignments a join public.people p on p.id = a.person_id where p.email = 'primary@235.test' and a.effective_to is null), 'primary communication preserves general recipient');
select is((select financial_role::text from public.unit_communication_assignments a join public.people p on p.id = a.person_id where p.email = 'additional@235.test' and a.effective_to is null), 'additional', 'additional communication is created');
select is((select count(*) from public.receivable_items), 0::bigint, 'atomic person creation leaves receivables unchanged');
select is((select count(*) from public.receivable_ledger_entries), 0::bigint, 'atomic person creation leaves ledger unchanged');
select is((select count(*) from public.payments), 0::bigint, 'atomic person creation leaves payments unchanged');

select * from finish();
rollback;
