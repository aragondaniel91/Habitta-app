-- Synthetic tenants for rehearsing scripts/pre-launch-production-reset.sh on a disposable database.
-- Every address uses a reserved domain; nothing here describes a real person. Never load this into
-- a database that holds anything worth keeping.
--
-- Shape: a platform admin who must survive (stands in for the founder's Master Admin account), two
-- organizations with their own owners, a condominium in each, units, people, charges, approved and
-- reversed payments, notifications waiting to be mailed under live email, a pending customer
-- invitation, and an account that belongs to no tenant at all.

insert into auth.users(id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('7e570000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'master-admin@rehearsal.invalid', 'x', now(), now()),
  ('7e570000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@rehearsal.invalid', 'x', now(), now()),
  ('7e570000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'accountant-a@rehearsal.invalid', 'x', now(), now()),
  ('7e570000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'resident-a@rehearsal.invalid', 'x', now(), now()),
  ('7e570000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b@rehearsal.invalid', 'x', now(), now()),
  ('7e570000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'loose@rehearsal.invalid', 'x', now(), now());

insert into public.platform_admins(user_id) values ('7e570000-0000-0000-0000-0000000000a1');

insert into public.organizations(id, name, created_by) values
  ('7e571000-0000-0000-0000-000000000001', 'Rehearsal Org A', '7e570000-0000-0000-0000-000000000001'),
  ('7e571000-0000-0000-0000-000000000002', 'Rehearsal Org B', '7e570000-0000-0000-0000-000000000004');
insert into public.organization_memberships(organization_id, user_id, role) values
  ('7e571000-0000-0000-0000-000000000001', '7e570000-0000-0000-0000-000000000001', 'organization_owner'),
  ('7e571000-0000-0000-0000-000000000002', '7e570000-0000-0000-0000-000000000004', 'organization_owner');

insert into public.condominiums(id, organization_id, name, created_by) values
  ('7e572000-0000-0000-0000-000000000001', '7e571000-0000-0000-0000-000000000001', 'Rehearsal Condo A', '7e570000-0000-0000-0000-000000000001'),
  ('7e572000-0000-0000-0000-000000000002', '7e571000-0000-0000-0000-000000000002', 'Rehearsal Condo B', '7e570000-0000-0000-0000-000000000004');
insert into public.condominium_memberships(condominium_id, user_id, role) values
  ('7e572000-0000-0000-0000-000000000001', '7e570000-0000-0000-0000-000000000001', 'condominium_admin'),
  ('7e572000-0000-0000-0000-000000000001', '7e570000-0000-0000-0000-000000000002', 'accountant'),
  ('7e572000-0000-0000-0000-000000000001', '7e570000-0000-0000-0000-000000000003', 'owner'),
  ('7e572000-0000-0000-0000-000000000002', '7e570000-0000-0000-0000-000000000004', 'condominium_admin'),
  -- The Master Admin also holds a test-tenant role; the reset must remove it and keep the account.
  ('7e572000-0000-0000-0000-000000000002', '7e570000-0000-0000-0000-0000000000a1', 'condominium_admin');

insert into public.units(id, condominium_id, code, type, created_by) values
  ('7e573000-0000-0000-0000-000000000001', '7e572000-0000-0000-0000-000000000001', 'A-1', 'apartment', '7e570000-0000-0000-0000-000000000001'),
  ('7e573000-0000-0000-0000-000000000002', '7e572000-0000-0000-0000-000000000001', 'A-2', 'apartment', '7e570000-0000-0000-0000-000000000001'),
  ('7e573000-0000-0000-0000-000000000003', '7e572000-0000-0000-0000-000000000002', 'B-1', 'apartment', '7e570000-0000-0000-0000-000000000004');
insert into public.people(id, condominium_id, auth_user_id, first_name, last_name, created_by) values
  ('7e574000-0000-0000-0000-000000000003', '7e572000-0000-0000-0000-000000000001', '7e570000-0000-0000-0000-000000000003', 'Resident', 'A', '7e570000-0000-0000-0000-000000000001');
insert into public.unit_owners(unit_id, person_id, starts_at, ends_at, created_by) values
  ('7e573000-0000-0000-0000-000000000001', '7e574000-0000-0000-0000-000000000003', current_date, null, '7e570000-0000-0000-0000-000000000001');

insert into public.condominium_payment_methods(id, condominium_id, method_type, display_name, currency_code, requires_reference, requires_proof, is_active, created_by) values
  ('7e575000-0000-0000-0000-000000000001', '7e572000-0000-0000-0000-000000000001', 'cash', 'Cash USD', 'USD', false, false, true, '7e570000-0000-0000-0000-000000000001');
insert into public.charge_concepts(id, condominium_id, code, name, category, created_by) values
  ('7e576000-0000-0000-0000-000000000001', '7e572000-0000-0000-0000-000000000001', 'REH', 'Rehearsal dues', 'regular_dues', '7e570000-0000-0000-0000-000000000001');

-- Live email on, so the notification inventory and the silencing step have something real to act on.
update public.condominium_notification_settings set email_enabled = true, live_email_enabled = true
 where condominium_id = '7e572000-0000-0000-0000-000000000001';

-- The product's own financial flow, as the people who would do it.
set role authenticated;
select set_config('request.jwt.claim.sub', '7e570000-0000-0000-0000-000000000001', false);
select public.create_receivable_item('7e572000-0000-0000-0000-000000000001', '7e573000-0000-0000-0000-000000000001', '7e576000-0000-0000-0000-000000000001', 'Rehearsal charge', 40.00, 'USD', current_date, null);
select set_config('request.jwt.claim.sub', '7e570000-0000-0000-0000-000000000003', false);
select public.create_payment_draft('7e572000-0000-0000-0000-000000000001', '7e573000-0000-0000-0000-000000000001', '7e575000-0000-0000-0000-000000000001', null, current_date, 40.00, 'USD', 'Resident A', null, null, 'rehearsal-pay-1');
select public.submit_payment('7e572000-0000-0000-0000-000000000001', (select id from public.payments where idempotency_key = 'rehearsal-pay-1'));
select public.create_payment_draft('7e572000-0000-0000-0000-000000000001', '7e573000-0000-0000-0000-000000000001', '7e575000-0000-0000-0000-000000000001', null, current_date, 5.00, 'USD', 'Resident A', null, null, 'rehearsal-pay-2');
select public.submit_payment('7e572000-0000-0000-0000-000000000001', (select id from public.payments where idempotency_key = 'rehearsal-pay-2'));
select set_config('request.jwt.claim.sub', '7e570000-0000-0000-0000-000000000002', false);
select public.approve_payment('7e572000-0000-0000-0000-000000000001', (select id from public.payments where idempotency_key = 'rehearsal-pay-1'),
  jsonb_build_array(jsonb_build_object('receivable_item_id', (select id from public.receivable_items where description = 'Rehearsal charge'),
    'payment_amount', '40.00', 'receivable_amount', '40.00', 'payment_currency_code', 'USD', 'receivable_currency_code', 'USD')));
select public.approve_payment('7e572000-0000-0000-0000-000000000001', (select id from public.payments where idempotency_key = 'rehearsal-pay-2'), '[]'::jsonb);
select public.reverse_payment('7e572000-0000-0000-0000-000000000001', (select id from public.payments where idempotency_key = 'rehearsal-pay-2'), 'rehearsal reversal');
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- Mail waiting to go out for the live-email tenant, produced by the same service functions the
-- Worker's cron calls.
select public.process_notification_event(c.id) from public.claim_notification_events(50) as c;
