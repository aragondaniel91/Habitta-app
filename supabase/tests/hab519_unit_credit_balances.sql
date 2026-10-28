begin;
select plan(17);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
('85000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin@hab519.test','x',now(),now()),
('85000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','accountant@hab519.test','x',now(),now()),
('85000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ownerx@hab519.test','x',now(),now()),
('85000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ownery@hab519.test','x',now(),now()),
('85000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','outsider@hab519.test','x',now(),now());

insert into public.organizations(id,name,created_by) values
('85100000-0000-0000-0000-000000000001','HAB519 Org A','85000000-0000-0000-0000-000000000001'),
('85100000-0000-0000-0000-000000000002','HAB519 Org B','85000000-0000-0000-0000-000000000005');
insert into public.condominiums(id,organization_id,name,created_by) values
('85200000-0000-0000-0000-000000000001','85100000-0000-0000-0000-000000000001','HAB519 Condo A','85000000-0000-0000-0000-000000000001'),
('85200000-0000-0000-0000-000000000002','85100000-0000-0000-0000-000000000002','HAB519 Condo B','85000000-0000-0000-0000-000000000005');
insert into public.condominium_memberships(condominium_id,user_id,role) values
('85200000-0000-0000-0000-000000000001','85000000-0000-0000-0000-000000000001','condominium_admin'),
('85200000-0000-0000-0000-000000000001','85000000-0000-0000-0000-000000000002','accountant'),
('85200000-0000-0000-0000-000000000001','85000000-0000-0000-0000-000000000003','owner'),
('85200000-0000-0000-0000-000000000001','85000000-0000-0000-0000-000000000004','owner'),
('85200000-0000-0000-0000-000000000002','85000000-0000-0000-0000-000000000005','condominium_admin');

insert into public.units(id,condominium_id,code,type,created_by) values
('85300000-0000-0000-0000-000000000001','85200000-0000-0000-0000-000000000001','X-1','apartment','85000000-0000-0000-0000-000000000001'),
('85300000-0000-0000-0000-000000000002','85200000-0000-0000-0000-000000000001','Y-1','apartment','85000000-0000-0000-0000-000000000001');
insert into public.people(id,condominium_id,auth_user_id,first_name,last_name,created_by) values
('85400000-0000-0000-0000-000000000003','85200000-0000-0000-0000-000000000001','85000000-0000-0000-0000-000000000003','Owner','X','85000000-0000-0000-0000-000000000001'),
('85400000-0000-0000-0000-000000000004','85200000-0000-0000-0000-000000000001','85000000-0000-0000-0000-000000000004','Owner','Y','85000000-0000-0000-0000-000000000001');
insert into public.unit_owners(unit_id,person_id,starts_at,ends_at,created_by) values
('85300000-0000-0000-0000-000000000001','85400000-0000-0000-0000-000000000003',current_date,null,'85000000-0000-0000-0000-000000000001'),
('85300000-0000-0000-0000-000000000002','85400000-0000-0000-0000-000000000004',current_date,null,'85000000-0000-0000-0000-000000000001');

insert into public.condominium_payment_methods(
  id,condominium_id,method_type,display_name,currency_code,requires_reference,requires_proof,is_active,created_by
) values
('85500000-0000-0000-0000-000000000001','85200000-0000-0000-0000-000000000001','cash','Cash USD','USD',false,false,true,'85000000-0000-0000-0000-000000000001'),
('85500000-0000-0000-0000-000000000002','85200000-0000-0000-0000-000000000001','cash','Cash VES','VES',false,false,true,'85000000-0000-0000-0000-000000000001');
insert into public.charge_concepts(id,condominium_id,code,name,category,created_by) values
('85600000-0000-0000-0000-000000000001','85200000-0000-0000-0000-000000000001','HAB519','HAB519 charge','regular_dues','85000000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub','85000000-0000-0000-0000-000000000001',true);
select has_function('public','get_unit_credit_balances',array['uuid'],'the unit credit balance RPC exists');

-- $12 USD charge on unit X, paid $17: $5 unapplied credit.
select public.create_receivable_item('85200000-0000-0000-0000-000000000001','85300000-0000-0000-0000-000000000001','85600000-0000-0000-0000-000000000001','HAB519 charge 12',12.00,'USD',current_date,null);
-- 9000 VES charge on unit X, paid 9000.50: 0.50 VES unapplied credit (rounding case).
select public.create_receivable_item('85200000-0000-0000-0000-000000000001','85300000-0000-0000-0000-000000000001','85600000-0000-0000-0000-000000000001','HAB519 charge VES',9000.00,'VES',current_date,null);

select set_config('request.jwt.claim.sub','85000000-0000-0000-0000-000000000003',true);
select lives_ok($$select public.create_payment_draft('85200000-0000-0000-0000-000000000001','85300000-0000-0000-0000-000000000001','85500000-0000-0000-0000-000000000001',null,current_date,17.00,'USD','Owner X',null,null,'hab519-usd-17')$$,'owner X drafts a $17 USD payment');
select public.submit_payment('85200000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='hab519-usd-17'));
select lives_ok($$select public.create_payment_draft('85200000-0000-0000-0000-000000000001','85300000-0000-0000-0000-000000000001','85500000-0000-0000-0000-000000000002',null,current_date,9000.50,'VES','Owner X',null,null,'hab519-ves-9000.50')$$,'owner X drafts a 9000.50 VES payment');
select public.submit_payment('85200000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='hab519-ves-9000.50'));
-- A third, pure-credit USD payment: no charge allocated, entire $3 becomes unapplied credit.
select lives_ok($$select public.create_payment_draft('85200000-0000-0000-0000-000000000001','85300000-0000-0000-0000-000000000001','85500000-0000-0000-0000-000000000001',null,current_date,3.00,'USD','Owner X',null,null,'hab519-usd-3')$$,'owner X drafts a $3 USD payment with no matching charge');
select public.submit_payment('85200000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='hab519-usd-3'));

select set_config('request.jwt.claim.sub','85000000-0000-0000-0000-000000000002',true);
select lives_ok($$select public.approve_payment('85200000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='hab519-usd-17'),jsonb_build_array(jsonb_build_object('receivable_item_id',(select id from public.receivable_items where description='HAB519 charge 12'),'payment_amount','12.00','receivable_amount','12.00','payment_currency_code','USD','receivable_currency_code','USD')))$$,'accountant approves $12 of the $17 USD payment');
select lives_ok($$select public.approve_payment('85200000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='hab519-ves-9000.50'),jsonb_build_array(jsonb_build_object('receivable_item_id',(select id from public.receivable_items where description='HAB519 charge VES'),'payment_amount','9000.00','receivable_amount','9000.00','payment_currency_code','VES','receivable_currency_code','VES')))$$,'accountant approves 9000.00 of the 9000.50 VES payment');
select lives_ok($$select public.approve_payment('85200000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='hab519-usd-3'),'[]'::jsonb)$$,'accountant approves the $3 payment with no allocation at all');

select set_config('request.jwt.claim.sub','85000000-0000-0000-0000-000000000001',true);
select is(
  (select credit_balance from public.get_unit_credit_balances('85200000-0000-0000-0000-000000000001')
   where unit_id='85300000-0000-0000-0000-000000000001' and currency_code='USD'),
  '8.00',
  'admin sees $5 + $3 = $8.00 aggregated USD credit for unit X, never combined with VES');
select is(
  (select credit_entry_count from public.get_unit_credit_balances('85200000-0000-0000-0000-000000000001')
   where unit_id='85300000-0000-0000-0000-000000000001' and currency_code='USD'),
  2::bigint,
  'two separate credit-granting entries are counted');
select is(
  (select credit_balance from public.get_unit_credit_balances('85200000-0000-0000-0000-000000000001')
   where unit_id='85300000-0000-0000-0000-000000000001' and currency_code='VES'),
  '0.50',
  '9000.50 - 9000.00 = 0.50 VES credit, kept separate from the USD row');
select is(
  (select count(*) from public.get_unit_credit_balances('85200000-0000-0000-0000-000000000001')
   where unit_id='85300000-0000-0000-0000-000000000002'),
  0::bigint,
  'unit Y, which never received a payment, has no credit balance row');

-- Reverse the standalone $3 payment: its credit entry nets to zero and disappears from the
-- aggregate instead of leaving a stale row.
select public.reverse_payment('85200000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='hab519-usd-3'),'HAB519 test reversal');
select is(
  (select credit_balance from public.get_unit_credit_balances('85200000-0000-0000-0000-000000000001')
   where unit_id='85300000-0000-0000-0000-000000000001' and currency_code='USD'),
  '5.00',
  'reversing the $3 payment nets its credit back out, leaving exactly the $5 overpayment');
select is(
  (select credit_entry_count from public.get_unit_credit_balances('85200000-0000-0000-0000-000000000001')
   where unit_id='85300000-0000-0000-0000-000000000001' and currency_code='USD'),
  1::bigint,
  'the reversed entry no longer counts toward the credit-granting total');

-- Role boundary: the owner of unit Y has no relation to unit X and is not board/admin, so the
-- RPC returns nothing for them even though unit X carries a real credit balance.
select set_config('request.jwt.claim.sub','85000000-0000-0000-0000-000000000004',true);
select is(
  (select count(*) from public.get_unit_credit_balances('85200000-0000-0000-0000-000000000001')),
  0::bigint,
  'owner Y cannot see owner X unit credit balance');

-- The owner of unit X can read their own credit balance without board/admin rights.
select set_config('request.jwt.claim.sub','85000000-0000-0000-0000-000000000003',true);
select is(
  (select credit_balance from public.get_unit_credit_balances('85200000-0000-0000-0000-000000000001')
   where unit_id='85300000-0000-0000-0000-000000000001' and currency_code='USD'),
  '5.00',
  'owner X can read their own unit credit balance');

-- Tenant isolation: an admin of a completely different condominium gets nothing back for condo A.
select set_config('request.jwt.claim.sub','85000000-0000-0000-0000-000000000005',true);
select is(
  (select count(*) from public.get_unit_credit_balances('85200000-0000-0000-0000-000000000001')),
  0::bigint,
  'an admin of a different condominium sees no rows for condo A');

-- Grant hygiene: anon must never be able to call this RPC.
reset role;
set local role anon;
select throws_ok(
  $$select * from public.get_unit_credit_balances('85200000-0000-0000-0000-000000000001')$$,
  '42501',
  null,
  'anon cannot execute get_unit_credit_balances'
);
reset role;

select * from finish();
rollback;
