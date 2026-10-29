begin;
select plan(24);

select ok(
  (select prosecdef from pg_proc where oid = 'public.can_read_late_fee_settings(uuid)'::regprocedure),
  'late-fee settings authorization remains SECURITY DEFINER'
);
select ok(
  (select 'search_path=public' = any(proconfig) from pg_proc where oid = 'public.can_read_late_fee_settings(uuid)'::regprocedure),
  'late-fee settings authorization has a fixed public search path'
);
select ok(not has_function_privilege('anon', 'public.can_read_late_fee_settings(uuid)'::regprocedure, 'EXECUTE'), 'anon cannot execute late-fee settings authorization');
select ok(not exists (select 1 from information_schema.routine_privileges where specific_schema = 'public' and routine_name = 'can_read_late_fee_settings' and grantee = 'PUBLIC'), 'PUBLIC cannot execute late-fee settings authorization');
select ok(has_function_privilege('authenticated', 'public.can_read_late_fee_settings(uuid)'::regprocedure, 'EXECUTE'), 'authenticated can execute late-fee settings authorization');
select ok(has_function_privilege('service_role', 'public.can_read_late_fee_settings(uuid)'::regprocedure, 'EXECUTE'), 'service role can execute late-fee settings authorization');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('59700000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'org-owner@hab597.test', 'x', now(), now()),
  ('59700000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@hab597.test', 'x', now(), now()),
  ('59700000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'accountant@hab597.test', 'x', now(), now()),
  ('59700000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reviewer@hab597.test', 'x', now(), now()),
  ('59700000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'board@hab597.test', 'x', now(), now()),
  ('59700000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@hab597.test', 'x', now(), now()),
  ('59700000-0000-4000-8000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tenant@hab597.test', 'x', now(), now()),
  ('59700000-0000-4000-8000-000000000008', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'former-owner@hab597.test', 'x', now(), now()),
  ('59700000-0000-4000-8000-000000000009', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'former-tenant@hab597.test', 'x', now(), now()),
  ('59700000-0000-4000-8000-000000000010', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other-tenant@hab597.test', 'x', now(), now()),
  ('59700000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'authorized@hab597.test', 'x', now(), now()),
  ('59700000-0000-4000-8000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'family@hab597.test', 'x', now(), now());

insert into public.organizations (id, name, created_by) values
  ('59710000-0000-4000-8000-000000000001', 'HAB-597 Organization A', '59700000-0000-4000-8000-000000000001'),
  ('59710000-0000-4000-8000-000000000002', 'HAB-597 Organization B', '59700000-0000-4000-8000-000000000001');
insert into public.condominiums (id, organization_id, name, created_by) values
  ('59720000-0000-4000-8000-000000000001', '59710000-0000-4000-8000-000000000001', 'HAB-597 Condominium A', '59700000-0000-4000-8000-000000000001'),
  ('59720000-0000-4000-8000-000000000002', '59710000-0000-4000-8000-000000000002', 'HAB-597 Condominium B', '59700000-0000-4000-8000-000000000001');
insert into public.organization_memberships (organization_id, user_id, role) values
  ('59710000-0000-4000-8000-000000000001', '59700000-0000-4000-8000-000000000001', 'organization_owner');
insert into public.units (id, condominium_id, code, type, status, created_by) values
  ('59730000-0000-4000-8000-000000000001', '59720000-0000-4000-8000-000000000001', 'A-597', 'apartment', 'active', '59700000-0000-4000-8000-000000000001'),
  ('59730000-0000-4000-8000-000000000002', '59720000-0000-4000-8000-000000000002', 'B-597', 'apartment', 'active', '59700000-0000-4000-8000-000000000001');
insert into public.people (id, condominium_id, auth_user_id, first_name, last_name, status, created_by) values
  ('59740000-0000-4000-8000-000000000001', '59720000-0000-4000-8000-000000000001', '59700000-0000-4000-8000-000000000006', 'Active', 'Owner', 'active', '59700000-0000-4000-8000-000000000001'),
  ('59740000-0000-4000-8000-000000000002', '59720000-0000-4000-8000-000000000001', '59700000-0000-4000-8000-000000000007', 'Active', 'Tenant', 'active', '59700000-0000-4000-8000-000000000001'),
  ('59740000-0000-4000-8000-000000000003', '59720000-0000-4000-8000-000000000001', '59700000-0000-4000-8000-000000000008', 'Former', 'Owner', 'active', '59700000-0000-4000-8000-000000000001'),
  ('59740000-0000-4000-8000-000000000004', '59720000-0000-4000-8000-000000000001', '59700000-0000-4000-8000-000000000009', 'Former', 'Tenant', 'active', '59700000-0000-4000-8000-000000000001'),
  ('59740000-0000-4000-8000-000000000005', '59720000-0000-4000-8000-000000000002', '59700000-0000-4000-8000-000000000010', 'Other', 'Tenant', 'active', '59700000-0000-4000-8000-000000000001'),
  ('59740000-0000-4000-8000-000000000006', '59720000-0000-4000-8000-000000000001', '59700000-0000-4000-8000-000000000011', 'Authorized', 'Occupant', 'active', '59700000-0000-4000-8000-000000000001'),
  ('59740000-0000-4000-8000-000000000007', '59720000-0000-4000-8000-000000000001', '59700000-0000-4000-8000-000000000012', 'Family', 'Member', 'active', '59700000-0000-4000-8000-000000000001');
insert into public.condominium_memberships (condominium_id, user_id, role) values
  ('59720000-0000-4000-8000-000000000001', '59700000-0000-4000-8000-000000000002', 'condominium_admin'),
  ('59720000-0000-4000-8000-000000000001', '59700000-0000-4000-8000-000000000003', 'accountant'),
  ('59720000-0000-4000-8000-000000000001', '59700000-0000-4000-8000-000000000004', 'payment_reviewer'),
  ('59720000-0000-4000-8000-000000000001', '59700000-0000-4000-8000-000000000005', 'board_member'),
  ('59720000-0000-4000-8000-000000000001', '59700000-0000-4000-8000-000000000006', 'owner'),
  ('59720000-0000-4000-8000-000000000001', '59700000-0000-4000-8000-000000000007', 'tenant'),
  ('59720000-0000-4000-8000-000000000001', '59700000-0000-4000-8000-000000000008', 'owner'),
  ('59720000-0000-4000-8000-000000000001', '59700000-0000-4000-8000-000000000009', 'tenant'),
  ('59720000-0000-4000-8000-000000000001', '59700000-0000-4000-8000-000000000011', 'authorized_occupant'),
  ('59720000-0000-4000-8000-000000000001', '59700000-0000-4000-8000-000000000012', 'family_member'),
  ('59720000-0000-4000-8000-000000000002', '59700000-0000-4000-8000-000000000010', 'tenant');
insert into public.unit_owners (id, unit_id, person_id, starts_at, ends_at, created_by) values
  ('59750000-0000-4000-8000-000000000001', '59730000-0000-4000-8000-000000000001', '59740000-0000-4000-8000-000000000001', current_date - 10, null, '59700000-0000-4000-8000-000000000001'),
  ('59750000-0000-4000-8000-000000000002', '59730000-0000-4000-8000-000000000001', '59740000-0000-4000-8000-000000000003', current_date - 10, current_date - 1, '59700000-0000-4000-8000-000000000001');
insert into public.unit_occupancies (id, unit_id, person_id, occupancy_type, starts_at, ends_at, created_by) values
  ('59760000-0000-4000-8000-000000000001', '59730000-0000-4000-8000-000000000001', '59740000-0000-4000-8000-000000000002', 'tenant', current_date - 10, null, '59700000-0000-4000-8000-000000000001'),
  ('59760000-0000-4000-8000-000000000002', '59730000-0000-4000-8000-000000000001', '59740000-0000-4000-8000-000000000004', 'tenant', current_date - 10, current_date - 1, '59700000-0000-4000-8000-000000000001'),
  ('59760000-0000-4000-8000-000000000003', '59730000-0000-4000-8000-000000000002', '59740000-0000-4000-8000-000000000005', 'tenant', current_date - 10, null, '59700000-0000-4000-8000-000000000001'),
  ('59760000-0000-4000-8000-000000000004', '59730000-0000-4000-8000-000000000001', '59740000-0000-4000-8000-000000000006', 'authorized_occupant', current_date - 10, null, '59700000-0000-4000-8000-000000000001'),
  ('59760000-0000-4000-8000-000000000005', '59730000-0000-4000-8000-000000000001', '59740000-0000-4000-8000-000000000007', 'family_member', current_date - 10, null, '59700000-0000-4000-8000-000000000001');

-- A membership with a future tenancy must not grant early financial settings access.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('59700000-0000-4000-8000-000000000013', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'future-tenant@hab597.test', 'x', now(), now());
insert into public.people (id, condominium_id, auth_user_id, first_name, last_name, status, created_by) values
  ('59740000-0000-4000-8000-000000000008', '59720000-0000-4000-8000-000000000001', '59700000-0000-4000-8000-000000000013', 'Future', 'Tenant', 'active', '59700000-0000-4000-8000-000000000001');
insert into public.condominium_memberships (condominium_id, user_id, role) values
  ('59720000-0000-4000-8000-000000000001', '59700000-0000-4000-8000-000000000013', 'tenant');
insert into public.unit_occupancies (id, unit_id, person_id, occupancy_type, starts_at, ends_at, created_by) values
  ('59760000-0000-4000-8000-000000000006', '59730000-0000-4000-8000-000000000001', '59740000-0000-4000-8000-000000000008', 'tenant', current_date + 1, null, '59700000-0000-4000-8000-000000000001');

insert into public.community_documents (id, condominium_id, title, audience, status, latest_version_number, created_by) values
  ('59770000-0000-4000-8000-000000000001', '59720000-0000-4000-8000-000000000001', 'Owner document', 'owners', 'active', 1, '59700000-0000-4000-8000-000000000001');
insert into public.community_document_versions (id, document_id, condominium_id, version_number, storage_key, original_filename, content_type, size_bytes, sha256, uploaded_by) values
  ('59780000-0000-4000-8000-000000000001', '59770000-0000-4000-8000-000000000001', '59720000-0000-4000-8000-000000000001', 1, 'community-documents/597/a.pdf', 'a.pdf', 'application/pdf', 1, repeat('a', 64), '59700000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '59700000-0000-4000-8000-000000000001', true);
select ok(public.can_read_late_fee_settings('59720000-0000-4000-8000-000000000001'), 'organization owner retains late-fee settings access');
select set_config('request.jwt.claim.sub', '59700000-0000-4000-8000-000000000002', true);
select ok(public.can_read_late_fee_settings('59720000-0000-4000-8000-000000000001'), 'condominium admin retains late-fee settings access');
select set_config('request.jwt.claim.sub', '59700000-0000-4000-8000-000000000003', true);
select ok(public.can_read_late_fee_settings('59720000-0000-4000-8000-000000000001'), 'accountant retains late-fee settings access');
select set_config('request.jwt.claim.sub', '59700000-0000-4000-8000-000000000004', true);
select ok(public.can_read_late_fee_settings('59720000-0000-4000-8000-000000000001'), 'payment reviewer retains late-fee settings access');
select set_config('request.jwt.claim.sub', '59700000-0000-4000-8000-000000000005', true);
select ok(public.can_read_late_fee_settings('59720000-0000-4000-8000-000000000001'), 'board member retains late-fee settings access');
select set_config('request.jwt.claim.sub', '59700000-0000-4000-8000-000000000006', true);
select ok(public.can_read_late_fee_settings('59720000-0000-4000-8000-000000000001'), 'active owner retains late-fee settings access');
select set_config('request.jwt.claim.sub', '59700000-0000-4000-8000-000000000007', true);
select ok(public.can_read_late_fee_settings('59720000-0000-4000-8000-000000000001'), 'active tenant retains late-fee settings access');
select set_config('request.jwt.claim.sub', '59700000-0000-4000-8000-000000000008', true);
select ok(not public.can_read_late_fee_settings('59720000-0000-4000-8000-000000000001'), 'expired owner membership cannot read late-fee settings');
select is((select count(*)::integer from public.condominium_late_fee_settings where condominium_id = '59720000-0000-4000-8000-000000000001'), 0, 'expired owner is denied late-fee settings by RLS');
select is((select count(*)::integer from public.community_document_versions where document_id = '59770000-0000-4000-8000-000000000001'), 0, 'expired owner cannot download owner-document version metadata');
select throws_ok($$select public.record_community_document_download('59770000-0000-4000-8000-000000000001', '59780000-0000-4000-8000-000000000001')$$, 'P0001', 'community document access denied', 'expired owner cannot record an owner-document download');
select set_config('request.jwt.claim.sub', '59700000-0000-4000-8000-000000000009', true);
select ok(not public.can_read_late_fee_settings('59720000-0000-4000-8000-000000000001'), 'expired tenant membership cannot read late-fee settings');
select is((select count(*)::integer from public.condominium_late_fee_settings where condominium_id = '59720000-0000-4000-8000-000000000001'), 0, 'expired tenant is denied late-fee settings by RLS');
select set_config('request.jwt.claim.sub', '59700000-0000-4000-8000-000000000010', true);
select ok(not public.can_read_late_fee_settings('59720000-0000-4000-8000-000000000001'), 'active tenant of another condominium cannot read late-fee settings');
select is((select count(*)::integer from public.condominium_late_fee_settings where condominium_id = '59720000-0000-4000-8000-000000000001'), 0, 'other-condominium tenant is denied late-fee settings by RLS');
select set_config('request.jwt.claim.sub', '59700000-0000-4000-8000-000000000013', true);
select ok(not public.can_read_late_fee_settings('59720000-0000-4000-8000-000000000001'), 'future-dated tenancy is not yet an effective late-fee settings grant');
select set_config('request.jwt.claim.sub', '59700000-0000-4000-8000-000000000011', true);
select ok(not public.can_read_late_fee_settings('59720000-0000-4000-8000-000000000001'), 'authorized occupant cannot read late-fee settings');
select set_config('request.jwt.claim.sub', '59700000-0000-4000-8000-000000000012', true);
select ok(not public.can_read_late_fee_settings('59720000-0000-4000-8000-000000000001'), 'family member cannot read late-fee settings');
reset role;

select * from finish();
rollback;
