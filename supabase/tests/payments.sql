begin;
select plan(170);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
('80000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin@pay.test','x',now(),now()),
('80000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','accountant@pay.test','x',now(),now()),
('80000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','reviewer@pay.test','x',now(),now()),
('80000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner@pay.test','x',now(),now()),
('80000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','tenant@pay.test','x',now(),now()),
('80000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000000','authenticated','authenticated','board@pay.test','x',now(),now()),
('80000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000000','authenticated','authenticated','assistant@pay.test','x',now(),now()),
('80000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000000','authenticated','authenticated','occupant@pay.test','x',now(),now()),
('80000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000000','authenticated','authenticated','family@pay.test','x',now(),now()),
('80000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000000','authenticated','authenticated','expired@pay.test','x',now(),now()),
('80000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated','other@pay.test','x',now(),now());

insert into public.organizations(id,name,created_by) values
('81000000-0000-0000-0000-000000000001','Payments A','80000000-0000-0000-0000-000000000001'),
('82000000-0000-0000-0000-000000000002','Payments B','80000000-0000-0000-0000-000000000011');
insert into public.condominiums(id,organization_id,name,created_by) values
('81100000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','Condo Pay A','80000000-0000-0000-0000-000000000001'),
('82200000-0000-0000-0000-000000000002','82000000-0000-0000-0000-000000000002','Condo Pay B','80000000-0000-0000-0000-000000000011');
insert into public.condominium_memberships(condominium_id,user_id,role) values
('81100000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001','condominium_admin'),
('81100000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000002','accountant'),
('81100000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000003','payment_reviewer'),
('81100000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000004','owner'),
('81100000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000005','tenant'),
('81100000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000006','board_member'),
('81100000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000007','assistant'),
('82200000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000011','condominium_admin');

insert into public.units(id,condominium_id,code,type,created_by) values
('81110000-0000-0000-0000-000000000001','81100000-0000-0000-0000-000000000001','A-1','apartment','80000000-0000-0000-0000-000000000001'),
('81110000-0000-0000-0000-000000000002','81100000-0000-0000-0000-000000000001','A-2','apartment','80000000-0000-0000-0000-000000000001'),
('82220000-0000-0000-0000-000000000001','82200000-0000-0000-0000-000000000002','B-1','apartment','80000000-0000-0000-0000-000000000011');
insert into public.people(id,condominium_id,auth_user_id,first_name,last_name,created_by) values
('81111000-0000-0000-0000-000000000004','81100000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000004','Own','Er','80000000-0000-0000-0000-000000000001'),
('81111000-0000-0000-0000-000000000005','81100000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000005','Ten','Ant','80000000-0000-0000-0000-000000000001'),
('81111000-0000-0000-0000-000000000008','81100000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000008','Auth','Occupant','80000000-0000-0000-0000-000000000001'),
('81111000-0000-0000-0000-000000000009','81100000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000009','Family','Member','80000000-0000-0000-0000-000000000001'),
('81111000-0000-0000-0000-000000000010','81100000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000010','Expired','Owner','80000000-0000-0000-0000-000000000001'),
('82222000-0000-0000-0000-000000000011','82200000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000011','Other','Person','80000000-0000-0000-0000-000000000011');
insert into public.unit_owners(unit_id,person_id,starts_at,ends_at,created_by) values
('81110000-0000-0000-0000-000000000001','81111000-0000-0000-0000-000000000004',current_date,null,'80000000-0000-0000-0000-000000000001'),
('81110000-0000-0000-0000-000000000001','81111000-0000-0000-0000-000000000010',current_date-10,current_date-1,'80000000-0000-0000-0000-000000000001');
insert into public.unit_occupancies(unit_id,person_id,occupancy_type,starts_at,created_by) values
('81110000-0000-0000-0000-000000000001','81111000-0000-0000-0000-000000000005','tenant',current_date,'80000000-0000-0000-0000-000000000001'),
('81110000-0000-0000-0000-000000000001','81111000-0000-0000-0000-000000000008','authorized_occupant',current_date,'80000000-0000-0000-0000-000000000001'),
('81110000-0000-0000-0000-000000000001','81111000-0000-0000-0000-000000000009','family_member',current_date,'80000000-0000-0000-0000-000000000001');

insert into public.condominium_payment_methods(
 id,condominium_id,method_type,display_name,currency_code,requires_reference,requires_proof,is_active,created_by
) values
('81130000-0000-0000-0000-000000000001','81100000-0000-0000-0000-000000000001','bank_transfer','Bank USD','USD',true,true,true,'80000000-0000-0000-0000-000000000001'),
('81130000-0000-0000-0000-000000000002','81100000-0000-0000-0000-000000000001','bank_transfer','Bank VES','VES',false,false,true,'80000000-0000-0000-0000-000000000001'),
('81130000-0000-0000-0000-000000000003','81100000-0000-0000-0000-000000000001','other','Inactive USD','USD',false,false,false,'80000000-0000-0000-0000-000000000001'),
('81130000-0000-0000-0000-000000000004','81100000-0000-0000-0000-000000000001','cash','Cash USD','USD',false,false,true,'80000000-0000-0000-0000-000000000001'),
('82230000-0000-0000-0000-000000000001','82200000-0000-0000-0000-000000000002','cash','Cash B','USD',false,false,true,'80000000-0000-0000-0000-000000000011');
insert into public.charge_concepts(id,condominium_id,code,name,category,created_by) values
('81140000-0000-0000-0000-000000000001','81100000-0000-0000-0000-000000000001','PAY','Payment tests','regular_dues','80000000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000001',true);
select public.create_receivable_item('81100000-0000-0000-0000-000000000001','81110000-0000-0000-0000-000000000001','81140000-0000-0000-0000-000000000001','USD due',100,'USD',current_date,null);
select public.create_receivable_item('81100000-0000-0000-0000-000000000001','81110000-0000-0000-0000-000000000001','81140000-0000-0000-0000-000000000001','VES due',4000,'VES',current_date,null);

select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000004',true);
select lives_ok($$select public.create_payment_draft('81100000-0000-0000-0000-000000000001','81110000-0000-0000-0000-000000000001','81130000-0000-0000-0000-000000000001',null,current_date,100,'USD','Owner',null,null,'owner-proof')$$,'owner creates payment for active unit');
select is((select count(*) from public.payments where idempotency_key='owner-proof'),1::bigint,'owner payment is stored once');
-- Capture the identifier while the resident can see the draft. Later assertions deliberately
-- run as roles for which the row is invisible, so looking it up at assertion time would only
-- test a NULL input instead of the protected row.
create temporary table payment_test_fixture (
  owner_draft_payment_id uuid not null
) on commit drop;
insert into payment_test_fixture(owner_draft_payment_id)
select id from public.payments where idempotency_key='owner-proof';
select ok((select owner_draft_payment_id is not null from payment_test_fixture),'resident draft fixture captures an ID before cross-role checks');
select ok(not has_function_privilege('authenticated', 'public.can_manage_payment_draft(uuid,uuid)', 'EXECUTE'),'arbitrary-owner draft helper is not executable by authenticated callers');
select ok(not has_function_privilege('authenticated', 'public.is_payment_staff_owner(uuid,uuid)', 'EXECUTE'),'arbitrary-owner staff-membership helper is not executable by authenticated callers');
select lives_ok($$select public.save_payment_allocation_intent('81100000-0000-0000-0000-000000000001',(select owner_draft_payment_id from payment_test_fixture),jsonb_build_array(jsonb_build_object('receivable_item_id',(select id from public.receivable_items where description='USD due'),'payment_amount','10.00','payment_currency_code','USD','receivable_amount','10.00','receivable_currency_code','USD','receivable_per_payment_rate','1')))$$,'resident can save a proposal on own draft');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000002',true);
select lives_ok($$select public.create_payment_draft('81100000-0000-0000-0000-000000000001','81110000-0000-0000-0000-000000000001','81130000-0000-0000-0000-000000000004',null,current_date,10,'USD','Staff path',null,null,'staff-path')$$,'accountant creates staff-owned payment draft');
select is((select count(*) from public.payments where idempotency_key='staff-path'),1::bigint,'staff-path payment is stored once');
alter table payment_test_fixture add column staff_path_payment_id uuid;
update payment_test_fixture
set staff_path_payment_id=(select id from public.payments where idempotency_key='staff-path');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000004',true);
select is((select count(*) from public.payment_events where payment_id=(select owner_draft_payment_id from payment_test_fixture)),0::bigint,'payer cannot read payment events for own draft');
select throws_ok($$select public.create_payment_draft('81100000-0000-0000-0000-000000000001','81110000-0000-0000-0000-000000000002','81130000-0000-0000-0000-000000000001',null,current_date,1,'USD','Owner',null,null,'wrong-unit')$$,null,null,'owner cannot create for another unit');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000010',true);
select throws_ok($$select public.create_payment_draft('81100000-0000-0000-0000-000000000001','81110000-0000-0000-0000-000000000001','81130000-0000-0000-0000-000000000004',null,current_date,1,'USD','Expired',null,null,'expired')$$,null,null,'expired relation cannot create payment');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000006',true);
select throws_ok($$select public.create_payment_draft('81100000-0000-0000-0000-000000000001','81110000-0000-0000-0000-000000000001','81130000-0000-0000-0000-000000000004',null,current_date,1,'USD','Board member',null,null,'board-member')$$,'42501','payment submission denied','board member cannot create a payment draft');
select throws_ok($$select public.update_payment_draft('81100000-0000-0000-0000-000000000001',(select staff_path_payment_id from payment_test_fixture),'81130000-0000-0000-0000-000000000004',current_date,10,'USD','Board member',null,null)$$,'42501','payment update denied','board member cannot update another payer payment draft');
select throws_ok($$select public.submit_payment('81100000-0000-0000-0000-000000000001',(select staff_path_payment_id from payment_test_fixture))$$,'42501','payment submission denied','board member cannot submit another payer payment draft');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000007',true);
select is((select count(*) from public.payments where id=(select staff_path_payment_id from payment_test_fixture)),1::bigint,'assistant can read a staff-owned draft through the staff workflow');
select is((select count(*) from public.payment_events where payment_id=(select staff_path_payment_id from payment_test_fixture)),0::bigint,'staff cannot read internal event metadata for a staff-owned draft');
select lives_ok($$select public.update_payment_draft('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='staff-path'),'81130000-0000-0000-0000-000000000004',current_date,10,'USD','Assistant staff path',null,null)$$,'assistant can update another payer payment draft');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000001',true);
select is((select count(*) from public.payment_events where payment_id=(select staff_path_payment_id from payment_test_fixture)),2::bigint,'admin can read events for a staff-owned draft visible through parent RLS');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000003',true);
select is((select count(*) from public.payment_events where payment_id=(select staff_path_payment_id from payment_test_fixture)),0::bigint,'reviewer cannot read staff draft events without parent payment visibility');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000002',true);
select lives_ok($$select public.update_payment_draft('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='staff-path'),'81130000-0000-0000-0000-000000000004',current_date,11,'USD','Accountant staff path',null,null)$$,'accountant can update another payer payment draft');
select lives_ok($$select public.submit_payment('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='staff-path'))$$,'accountant who can edit another payer draft can also submit it');
select is((select status::text from public.payments where idempotency_key='staff-path'),'submitted','staff submission moves the draft to submitted');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000004',true);
select lives_ok($$select public.create_payment_draft('81100000-0000-0000-0000-000000000001','81110000-0000-0000-0000-000000000001','81130000-0000-0000-0000-000000000004',null,current_date,12,'USD','Hidden pagination draft',null,null,'hidden-pagination')$$,'owner creates a newer hidden draft for audit pagination coverage');
alter table payment_test_fixture add column hidden_pagination_payment_id uuid;
update payment_test_fixture set hidden_pagination_payment_id=(select id from public.payments where idempotency_key='hidden-pagination');
reset role;
insert into public.treasury_events(id,condominium_id,entity_type,entity_id,event_type,actor_user_id,metadata,occurred_at)
values ('81160000-0000-0000-0000-000000000001','81100000-0000-0000-0000-000000000001','movement','81160000-0000-0000-0000-000000000002','movement_recorded','80000000-0000-0000-0000-000000000001','{}'::jsonb,clock_timestamp()+interval '1 hour');
set local role authenticated;
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000001',true);
select is((select count(*) from public.payments where id=(select owner_draft_payment_id from payment_test_fixture)),0::bigint,'admin cannot read the pre-captured ID of an unsubmitted resident draft');
select is((select count(*) from public.payment_events where payment_id=(select owner_draft_payment_id from payment_test_fixture)),0::bigint,'admin cannot read event metadata for an unsubmitted resident draft');
select is((select count(*) from public.payment_allocation_intents where payment_id=(select owner_draft_payment_id from payment_test_fixture)),0::bigint,'admin cannot read an unsubmitted resident allocation proposal');
select lives_ok(
  $$select * from public.list_admin_audit_events('81100000-0000-0000-0000-000000000001','payments',null,'payment',null,null,10,0,'info')$$,
  'payment audit CTE aliases support module, entity, severity filters and ordered event output'
);
select is((select count(*) from public.list_admin_audit_events('81100000-0000-0000-0000-000000000001','payments') where entity_id=(select owner_draft_payment_id from payment_test_fixture)),0::bigint,'admin audit RPC cannot read event metadata for an unsubmitted resident draft');
select is((select count(*) from public.list_admin_audit_events('81100000-0000-0000-0000-000000000001','payments',null,null,null,null,1,0)),1::bigint,'hidden newest payment event is filtered before payment-module pagination');
select is((select count(*) from public.list_admin_audit_events('81100000-0000-0000-0000-000000000001','payments',null,null,null,null,1,4)),0::bigint,'payment-module offset is applied after hidden events are removed');
select ok(
  (select count(*) = 2 and count(*) filter (where entity_id=(select hidden_pagination_payment_id from payment_test_fixture)) = 0
   from public.list_admin_audit_events('81100000-0000-0000-0000-000000000001',null,null,null,null,null,2,0)),
  'mixed-module pagination excludes the hidden payment before taking the page'
);
select throws_ok($$select public.update_payment_draft('81100000-0000-0000-0000-000000000001',(select owner_draft_payment_id from payment_test_fixture),'81130000-0000-0000-0000-000000000004',current_date,10,'USD','Admin cannot correct',null,null)$$,'42501','payment update denied','admin cannot edit the pre-captured resident draft');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000003',true);
select is((select count(*) from public.payments where id=(select owner_draft_payment_id from payment_test_fixture)),0::bigint,'payment reviewer cannot read an unsubmitted resident draft');
select is((select count(*) from public.payment_events where payment_id=(select owner_draft_payment_id from payment_test_fixture)),0::bigint,'payment reviewer cannot read event metadata for an unsubmitted resident draft');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000011',true);
select is((select count(*) from public.payments where id=(select owner_draft_payment_id from payment_test_fixture)),0::bigint,'other-condominium admin cannot read a resident draft across tenants');
select is((select count(*) from public.payment_events where payment_id=(select owner_draft_payment_id from payment_test_fixture)),0::bigint,'other-condominium admin cannot read resident draft event metadata across tenants');
select is((select count(*) from public.payment_allocation_intents where payment_id=(select owner_draft_payment_id from payment_test_fixture)),0::bigint,'other-condominium admin cannot read resident allocation proposal across tenants');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000004',true);
select is((select count(*) from public.payments where id=(select owner_draft_payment_id from payment_test_fixture)),1::bigint,'resident can still read own pre-captured draft');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000005',true);
select is((select count(*) from public.payments where id=(select owner_draft_payment_id from payment_test_fixture)),0::bigint,'tenant cannot read another resident draft in the same condominium');
select is((select count(*) from public.payment_events where payment_id=(select owner_draft_payment_id from payment_test_fixture)),0::bigint,'tenant cannot read resident payment events before submission');
select throws_ok($$select public.update_payment_draft('81100000-0000-0000-0000-000000000001',(select owner_draft_payment_id from payment_test_fixture),'81130000-0000-0000-0000-000000000004',current_date,1,'USD','Tenant cannot edit',null,null)$$,'42501','payment update denied','tenant cannot update the pre-captured resident draft');
select throws_ok($$select public.create_payment_draft('81100000-0000-0000-0000-000000000001','81110000-0000-0000-0000-000000000001','81130000-0000-0000-0000-000000000004',null,current_date,1,'USD','Tenant',null,null,'tenant')$$,null,null,'tenant-only user cannot create payment in pilot');
select throws_ok($$select public.preview_payment_allocation('81100000-0000-0000-0000-000000000001',(select owner_draft_payment_id from payment_test_fixture),'[]'::jsonb)$$,'42501','review denied','tenant cannot preview the pre-captured resident draft allocation');
select throws_ok($$select public.approve_payment('81100000-0000-0000-0000-000000000001',(select owner_draft_payment_id from payment_test_fixture),'[]'::jsonb)$$,'42501','approval denied','tenant cannot approve the pre-captured resident draft');
select throws_ok($$select public.reverse_payment('81100000-0000-0000-0000-000000000001',(select owner_draft_payment_id from payment_test_fixture),'unauthorized')$$,'42501','reversal denied','tenant cannot reverse the pre-captured resident draft');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000008',true);
select lives_ok($$select public.create_payment_draft('81100000-0000-0000-0000-000000000001','81110000-0000-0000-0000-000000000001','81130000-0000-0000-0000-000000000004',null,current_date,1,'USD','Occupant',null,null,'occupant')$$,'authorized occupant creates payment');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000009',true);
select throws_ok($$select public.create_payment_draft('81100000-0000-0000-0000-000000000001','81110000-0000-0000-0000-000000000001','81130000-0000-0000-0000-000000000004',null,current_date,1,'USD','Family',null,null,'family')$$,null,null,'family member cannot create payment');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000002',true);
select lives_ok($$select public.create_payment_draft('81100000-0000-0000-0000-000000000001','81110000-0000-0000-0000-000000000001','81130000-0000-0000-0000-000000000004','81111000-0000-0000-0000-000000000004',current_date,2,'USD','Accountant',null,null,'accountant')$$,'accountant registers resident payment');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000007',true);
select lives_ok($$select public.create_payment_draft('81100000-0000-0000-0000-000000000001','81110000-0000-0000-0000-000000000001','81130000-0000-0000-0000-000000000004','81111000-0000-0000-0000-000000000004',current_date,3,'USD','Assistant',null,null,'assistant')$$,'assistant registers resident payment');
select throws_ok($$select public.create_payment_draft('81100000-0000-0000-0000-000000000001','81110000-0000-0000-0000-000000000001','81130000-0000-0000-0000-000000000004','82222000-0000-0000-0000-000000000011',current_date,3,'USD','Wrong',null,null,'wrong-person')$$,null,null,'represented person must belong to condominium and unit');
select throws_ok($$select public.create_payment_draft('81100000-0000-0000-0000-000000000001','81110000-0000-0000-0000-000000000001','81130000-0000-0000-0000-000000000003',null,current_date,1,'USD','Inactive',null,null,'inactive')$$,null,null,'inactive method cannot be used');
select throws_ok($$select public.create_payment_draft('81100000-0000-0000-0000-000000000001','81110000-0000-0000-0000-000000000001','81130000-0000-0000-0000-000000000002',null,current_date,1,'USD','Mismatch',null,null,'currency-mismatch')$$,null,null,'payment currency must match method');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000004',true);
select lives_ok($$select public.create_payment_draft('81100000-0000-0000-0000-000000000001','81110000-0000-0000-0000-000000000001','81130000-0000-0000-0000-000000000001','81111000-0000-0000-0000-000000000004',current_date,100,'USD','Owner',null,null,'owner-proof')$$,'same idempotency payload returns payment');
select is((select count(*) from public.payments where idempotency_key='owner-proof'),1::bigint,'idempotency key never duplicates payment');
select throws_ok($$select public.submit_payment('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='owner-proof'))$$,'P0001','payment reference required','submit requires reference');
select lives_ok($$select public.update_payment_draft('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='owner-proof'),'81130000-0000-0000-0000-000000000001',current_date,100,'USD','Owner','REF-1',null)$$,'owner adds required reference');
select throws_ok($$select public.submit_payment('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='owner-proof'))$$,'P0001','payment proof required','submit requires proof');
select lives_ok($$select public.record_payment_proof('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='owner-proof'),'81150000-0000-0000-0000-000000000001','payments/81150000-0000-0000-0000-000000000001','one.pdf','application/pdf',10,'abc')$$,'first proof is recorded');
select lives_ok($$select public.record_payment_proof('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='owner-proof'),'81150000-0000-0000-0000-000000000002','payments/81150000-0000-0000-0000-000000000002','two.pdf','application/pdf',11,'def')$$,'proof can be replaced before submit');
select is((select count(*) from public.payment_proofs where superseded_at is null),1::bigint,'proof replacement leaves one active version');
select lives_ok($$select public.submit_payment('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='owner-proof'))$$,'valid payment is submitted');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000003',true);
select ok((select count(*) from public.payment_events where payment_id=(select owner_draft_payment_id from payment_test_fixture))>0,'payment reviewer can read resident payment events after submission');
select is((select count(*) from public.payment_allocation_intents where payment_id=(select owner_draft_payment_id from payment_test_fixture)),1::bigint,'payment reviewer can read resident allocation proposal after submission');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000005',true);
select is((select count(*) from public.payment_events where payment_id=(select owner_draft_payment_id from payment_test_fixture)),0::bigint,'tenant cannot read resident payment events after submission');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000004',true);
select throws_ok($$select public.record_payment_proof('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='owner-proof'),'81150000-0000-0000-0000-000000000003','payments/81150000-0000-0000-0000-000000000003','three.pdf','application/pdf',12,'ghi')$$,'P0001','proof upload denied','owner cannot replace proof once payment is submitted (detail must stay immutable until correction_requested)');
select is((select count(*) from public.payment_proofs where payment_id=(select id from public.payments where idempotency_key='owner-proof')),2::bigint,'submitted payment keeps only the two proof versions recorded before submission');
select is((select count(*) from public.receivable_ledger_entries where payment_id=(select id from public.payments where idempotency_key='owner-proof')),0::bigint,'creating and submitting payment does not change ledger');

select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000007',true);
select public.submit_payment('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='assistant'));
select throws_ok($$select public.payment_transition('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='assistant'),'under_review',null)$$,'42501','review denied','assistant cannot review');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000003',true);
select lives_ok($$select public.payment_transition('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='assistant'),'correction_requested','fix')$$,'reviewer requests correction');
select is((select count(*) from public.receivable_ledger_entries where payment_id=(select id from public.payments where idempotency_key='assistant')),0::bigint,'correction request does not change ledger');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000007',true);
select lives_ok($$select public.update_payment_draft('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='assistant'),'81130000-0000-0000-0000-000000000004',current_date,4,'USD','Assistant corrected',null,'Corrected details')$$,'submitter can save a returned payment');
select is((select status::text from public.payments where idempotency_key='assistant'),'correction_requested','saving a returned payment preserves correction status');
select is((select correction_reason from public.payments where idempotency_key='assistant'),'fix','saving a returned payment preserves the correction instruction');
select lives_ok($$select public.record_payment_proof('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='assistant'),'81150000-0000-0000-0000-000000000005','payments/81150000-0000-0000-0000-000000000005','corrected.pdf','application/pdf',9,'mno')$$,'submitter can replace proof while status is correction_requested');
select is((select count(*) from public.payment_proofs where payment_id=(select id from public.payments where idempotency_key='assistant') and superseded_at is null),1::bigint,'correction_requested proof replacement leaves exactly one active version');
select public.submit_payment('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='assistant'));
select is((select status::text from public.payments where idempotency_key='assistant'),'submitted','explicit resubmission moves the returned payment to submitted');
select is((select correction_reason from public.payments where idempotency_key='assistant'),null,'resubmission clears the active correction instruction');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000003',true);
select lives_ok($$select public.payment_transition('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='assistant'),'rejected','duplicate')$$,'reviewer rejects payment');
select is((select count(*) from public.receivable_ledger_entries where payment_id=(select id from public.payments where idempotency_key='assistant')),0::bigint,'rejection does not change ledger');
select lives_ok($$select public.payment_transition('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='owner-proof'),'under_review',null)$$,'payment reviewer starts review');

select is((select count(*) from public.payment_allocations),0::bigint,'preview starts without writes');
select is(jsonb_array_length(public.preview_payment_allocation('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='owner-proof'),jsonb_build_array(jsonb_build_object('receivable_item_id',(select id from public.receivable_items where description='USD due'),'payment_amount','60.00','receivable_amount','60.00','payment_currency_code','USD','receivable_currency_code','USD')))->'errors'),0,'same-currency preview validates one-to-one');
select ok(jsonb_array_length(public.preview_payment_allocation('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='owner-proof'),jsonb_build_array(jsonb_build_object('receivable_item_id',(select id from public.receivable_items where description='VES due'),'payment_amount','10.00','receivable_amount','400.00','payment_currency_code','USD','receivable_currency_code','VES')))->'errors')>0,'cross-currency preview requires rate');
select is(jsonb_array_length(public.preview_payment_allocation('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='owner-proof'),jsonb_build_array(jsonb_build_object('receivable_item_id',(select id from public.receivable_items where description='VES due'),'payment_amount','10.00','receivable_amount','400.00','payment_currency_code','USD','receivable_currency_code','VES','receivable_per_payment_rate','40.0000000000')))->'errors'),0,'exact rate produces correct receivable amount');
select ok(jsonb_array_length(public.preview_payment_allocation('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='owner-proof'),jsonb_build_array(jsonb_build_object('receivable_item_id',(select id from public.receivable_items where description='USD due'),'payment_amount','1.00','receivable_amount','1.00','payment_currency_code','USD','receivable_currency_code','USD'),jsonb_build_object('receivable_item_id',(select id from public.receivable_items where description='USD due'),'payment_amount','1.00','receivable_amount','1.00','payment_currency_code','USD','receivable_currency_code','USD')))->'errors')>0,'duplicate allocation is rejected');
select ok(jsonb_array_length(public.preview_payment_allocation('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='owner-proof'),jsonb_build_array(jsonb_build_object('receivable_item_id',(select id from public.receivable_items where description='USD due'),'payment_amount','101.00','receivable_amount','101.00','payment_currency_code','USD','receivable_currency_code','USD')))->'errors')>0,'outstanding cannot be over-applied');
select ok(jsonb_array_length(public.preview_payment_allocation('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='owner-proof'),jsonb_build_array(jsonb_build_object('receivable_item_id',(select id from public.receivable_items where description='VES due'),'payment_amount','101.00','receivable_amount','4040.00','payment_currency_code','USD','receivable_currency_code','VES','receivable_per_payment_rate','40.0000000000')))->'errors')>0,'allocations cannot exceed payment amount');
select is((select count(*) from public.payment_allocations),0::bigint,'preview writes no allocations');
select lives_ok($$select public.approve_payment('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='owner-proof'),jsonb_build_array(jsonb_build_object('receivable_item_id',(select id from public.receivable_items where description='USD due'),'payment_amount','60.00','receivable_amount','60.00','payment_currency_code','USD','receivable_currency_code','USD')))$$,'payment reviewer approves partial application');
select is((select sum(case direction when 'debit' then amount else -amount end) from public.receivable_ledger_entries where receivable_item_id=(select id from public.receivable_items where description='USD due')),40.00::numeric,'partial payment reduces outstanding');
select is((select amount from public.receivable_ledger_entries where payment_id=(select id from public.payments where idempotency_key='owner-proof') and receivable_item_id is null),40.00::numeric,'remainder creates unapplied credit');
select lives_ok($$select public.approve_payment('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='owner-proof'),'[]')$$,'repeated approval is idempotent');
select is((select count(*) from public.receivable_ledger_entries where payment_id=(select id from public.payments where idempotency_key='owner-proof') and entry_type='payment_credit'),2::bigint,'repeated approval does not duplicate ledger');
select is((select count(*) from public.payment_receipts where payment_id=(select id from public.payments where idempotency_key='owner-proof')),1::bigint,'receipt is unique');
select is((select count(distinct sequence_number) from public.payment_receipts),1::bigint,'receipt sequence number is unique');
select is((select snapshot->'condominium'->>'name' from public.payment_receipts limit 1),'Condo Pay A','snapshot preserves condominium');
select is((select (snapshot->'unit'->>'code')||':'||(snapshot->'method'->>'display_name') from public.payment_receipts limit 1),'A-1:Bank USD','snapshot preserves unit and method');
select is((select status::text from public.payments where idempotency_key='owner-proof'),'approved','partial payment stays approved before reversal attempts');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000004',true);
select throws_ok($$select public.record_payment_proof('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='owner-proof'),'81150000-0000-0000-0000-000000000004','payments/81150000-0000-0000-0000-000000000004','four.pdf','application/pdf',13,'jkl')$$,'P0001','proof upload denied','proof cannot be replaced after approval');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000003',true);
select is((select count(*) from public.receivable_ledger_entries e where e.payment_id=(select id from public.payments where idempotency_key='owner-proof') and e.receivable_item_id=(select id from public.receivable_items where description='USD due') and e.entry_type='payment_credit' and not exists(select 1 from public.receivable_ledger_entries r where r.reversal_of_entry_id=e.id)),1::bigint,'allocated payment credit is active before receivable reversal');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000001',true);
select throws_ok($$select public.reverse_receivable_item('81100000-0000-0000-0000-000000000001',(select id from public.receivable_items where description='USD due'),'charge correction')$$,'P0001','receivable_has_active_payment_credit','partial allocated payment blocks receivable reversal');
select is((select lifecycle_status::text from public.receivable_items where description='USD due'),'active','blocked receivable stays active');
select is((select status::text from public.payments where idempotency_key='owner-proof'),'approved','blocked receivable reversal does not change payment');
select is((select count(*) from public.receivable_ledger_entries e where e.payment_id=(select id from public.payments where idempotency_key='owner-proof') and e.receivable_item_id=(select id from public.receivable_items where description='USD due') and e.entry_type='payment_credit' and not exists(select 1 from public.receivable_ledger_entries r where r.reversal_of_entry_id=e.id)),1::bigint,'blocked receivable reversal does not reverse payment credit');
select is((select count(*) from public.receivable_ledger_entries e where e.receivable_item_id=(select id from public.receivable_items where description='USD due') and e.entry_type='reversal' and e.payment_id is null),0::bigint,'blocked receivable reversal creates no charge reversal');

reset role;
select throws_ok($$update public.payment_allocations set payment_amount=1$$,null,'payment allocations are immutable','approved allocations are immutable');
select throws_ok($$update public.payment_receipts set receipt_number='changed'$$,null,'payment receipts are immutable','receipt and snapshot are immutable');
select throws_ok($$update public.payments set original_amount=1 where idempotency_key='owner-proof'$$,null,'financial payment is immutable','approved payment is immutable');
set local role authenticated;
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000003',true);
select lives_ok($$select public.reverse_payment('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='owner-proof'),'bank reversal')$$,'approved payment reverses');
select is((select count(*) from public.receivable_ledger_entries where payment_id=(select id from public.payments where idempotency_key='owner-proof') and entry_type='reversal'),2::bigint,'reversal creates one opposite entry per credit');
select is((select count(*) from public.payment_allocations)+(select count(*) from public.payment_receipts),2::bigint,'reversal preserves allocation and receipt');
select throws_ok($$select public.reverse_payment('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='owner-proof'),'again')$$,null,null,'second reversal is rejected');
select is((select status::text from public.payments where idempotency_key='owner-proof'),'reversed','payment reverses before receivable can reverse');
select is((select count(*) from public.receivable_ledger_entries e where e.payment_id=(select id from public.payments where idempotency_key='owner-proof') and e.receivable_item_id=(select id from public.receivable_items where description='USD due') and e.entry_type='payment_credit' and (select count(*) from public.receivable_ledger_entries r where r.reversal_of_entry_id=e.id)=1),1::bigint,'allocated payment credit has exactly one reversal');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.reverse_receivable_item('81100000-0000-0000-0000-000000000001',(select id from public.receivable_items where description='USD due'),'charge correction')$$,'receivable reverses after payment reversal');
select is((select lifecycle_status::text from public.receivable_items where description='USD due'),'reversed','receivable becomes reversed after payment reversal');
select is((select count(*) from public.receivable_ledger_entries e where e.receivable_item_id=(select id from public.receivable_items where description='USD due') and e.entry_type='charge' and (select count(*) from public.receivable_ledger_entries r where r.reversal_of_entry_id=e.id)=1),1::bigint,'charge has exactly one reversal');
select ok(not exists(select reversal_of_entry_id from public.receivable_ledger_entries where reversal_of_entry_id is not null group by reversal_of_entry_id having count(*)>1),'each ledger entry has at most one reversal');

select is((select array_agg(event_type order by sequence_number)::text from public.payment_events where payment_id=(select id from public.payments where idempotency_key='owner-proof')),'{created,updated,submitted,under_review,approved,reversed}','payment trail records every transition in order');
select is((select array_agg(coalesce(previous_status::text,'-') order by sequence_number)::text from public.payment_events where payment_id=(select id from public.payments where idempotency_key='owner-proof')),'{-,draft,draft,submitted,under_review,approved}','payment trail records the previous state of each transition');
select is((select count(*) from public.payment_events where payment_id=(select id from public.payments where idempotency_key='owner-proof') and event_type='approved'),1::bigint,'idempotent approval does not duplicate the approval event');
select is((select reason from public.payment_events where payment_id=(select id from public.payments where idempotency_key='owner-proof') and event_type='reversed'),'bank reversal','reversal event keeps its reason');
select is((select actor_user_id from public.payment_events where payment_id=(select id from public.payments where idempotency_key='owner-proof') and event_type='approved'),'80000000-0000-0000-0000-000000000003'::uuid,'approval event records the reviewer who approved');
select is((select array_agg(event_type order by sequence_number)::text from public.payment_events where payment_id=(select id from public.payments where idempotency_key='assistant')),'{created,submitted,correction_requested,updated,submitted,rejected}','correction, edit, resubmission and rejection are all recorded');
select is((select reason from public.payment_events where payment_id=(select id from public.payments where idempotency_key='assistant') and event_type='correction_requested'),'fix','correction event keeps its reason');
select is((select reason from public.payment_events where payment_id=(select id from public.payments where idempotency_key='assistant') and event_type='rejected'),'duplicate','rejection event keeps its reason');

reset role;
select throws_ok($$update public.payment_events set reason='tampered'$$,null,'payment events are immutable','payment trail cannot be edited');
select throws_ok($$delete from public.payment_events$$,null,'payment events are immutable','payment trail cannot be deleted');
set local role authenticated;

select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000001',true);
select throws_ok($$delete from public.condominium_payment_methods where id='81130000-0000-0000-0000-000000000004'$$,null,null,'payment methods cannot be deleted');
select throws_ok($$select * from public.payment_receipt_sequences$$,null,null,'receipt sequences are private');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000004',true);
select is((select count(*) from public.condominium_payment_methods where condominium_id='82200000-0000-0000-0000-000000000002'),0::bigint,'Condo A user cannot read Condo B methods');
select is((select count(*) from public.payments where condominium_id='82200000-0000-0000-0000-000000000002'),0::bigint,'Condo A user cannot read Condo B payments');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000006',true);
select is((select count(*) from public.payments),0::bigint,'board member cannot read individual payments');
select is((select count(*) from public.payment_proofs),0::bigint,'board member cannot read proof metadata');
select is((select count(*) from public.payment_events),0::bigint,'board member cannot read the payment trail');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000004',true);
select is((select count(*) from public.payment_events),0::bigint,'payer cannot read internal review or audit event reasons');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000003',true);
select ok((select count(*) from public.payment_events)>0,'payment reviewer can read the payment trail');

reset role;
insert into public.condominium_payment_methods(id,condominium_id,method_type,display_name,currency_code,created_by) values
('81130000-0000-0000-0000-000000000009','81100000-0000-0000-0000-000000000001','other','Unused USD','USD','80000000-0000-0000-0000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000003',true);
select throws_ok($$select public.delete_payment_method('81100000-0000-0000-0000-000000000001','81130000-0000-0000-0000-000000000009')$$,'42501','payment method management denied','payment reviewer cannot delete payment methods');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000001',true);
select throws_ok($$select public.delete_payment_method('81100000-0000-0000-0000-000000000001','81130000-0000-0000-0000-000000000001')$$,'P0001','payment method in use','a payment method referenced by payments cannot be deleted');
select lives_ok($$select public.delete_payment_method('81100000-0000-0000-0000-000000000001','81130000-0000-0000-0000-000000000009')$$,'an unused payment method can be deleted');
select is((select count(*) from public.condominium_payment_methods where id in ('81130000-0000-0000-0000-000000000001','81130000-0000-0000-0000-000000000009')),1::bigint,'only the unused payment method was deleted');

-- HAB-FINANCIAL-TRUTH-001: deterministic pilot examples; all changes roll back.
-- Only the ledger is authoritative; drafts and submitted payments must never change it.
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000001',true);
select public.create_receivable_item('81100000-0000-0000-0000-000000000001','81110000-0000-0000-0000-000000000001','81140000-0000-0000-0000-000000000001','FT charge 12',12.00,'USD',current_date,null);
select public.create_receivable_item('81100000-0000-0000-0000-000000000001','81110000-0000-0000-0000-000000000001','81140000-0000-0000-0000-000000000001','FT charge 4.50',4.50,'USD',current_date,null);
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000004',true);
select lives_ok($$select public.create_payment_draft('81100000-0000-0000-0000-000000000001','81110000-0000-0000-0000-000000000001','81130000-0000-0000-0000-000000000004',null,current_date,5.00,'USD','Owner','FT-PARTIAL',null,'ft-partial')$$,'FT: draft $5 against $12');
select is((select sum(case direction when 'debit' then amount else -amount end) from public.receivable_ledger_entries where receivable_item_id=(select id from public.receivable_items where description='FT charge 12')),12.00::numeric,'FT: draft has not reduced $12 balance');
select is((select count(*) from public.receivable_ledger_entries where payment_id=(select id from public.payments where idempotency_key='ft-partial')),0::bigint,'FT: draft has no ledger writes');
select lives_ok($$select public.submit_payment('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='ft-partial'))$$,'FT: submit partial payment');
select is((select count(*) from public.receivable_ledger_entries where payment_id=(select id from public.payments where idempotency_key='ft-partial')),0::bigint,'FT: submitted payment has no ledger writes');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000003',true);
select lives_ok($$select public.approve_payment('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='ft-partial'),jsonb_build_array(jsonb_build_object('receivable_item_id',(select id from public.receivable_items where description='FT charge 12'),'payment_amount','5.00','receivable_amount','5.00','payment_currency_code','USD','receivable_currency_code','USD')))$$,'FT: apply approved $5 to charge $12');
select is((select sum(case direction when 'debit' then amount else -amount end) from public.receivable_ledger_entries where receivable_item_id=(select id from public.receivable_items where description='FT charge 12')),7.00::numeric,'FT: $12 - $5 = $7 authoritative outstanding');
select is((select original_amount from public.receivable_items where description='FT charge 12'),12.00::numeric,'FT: original charge stays $12');
select is((select outstanding_amount from public.receivable_balances where description='FT charge 12'),'7.00','FT: RLS-scoped receivables view agrees with ledger on $7');
select is((select status from public.receivable_balances where description='FT charge 12'),'partially_settled','FT: receivable read model shows partial settlement');
select is((select count(*) from public.get_unit_statement('81100000-0000-0000-0000-000000000001','81110000-0000-0000-0000-000000000001') where entry_type='payment_credit' and credit='5.00'),1::bigint,'FT: unit statement exposes approved $5 credit once');
select is((select count(*) from public.receivable_ledger_entries where payment_id=(select id from public.payments where idempotency_key='ft-partial') and receivable_item_id is null),0::bigint,'FT: partial payment creates no phantom credit');
select lives_ok($$select public.approve_payment('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='ft-partial'),'[]'::jsonb)$$,'FT: repeated approval is idempotent');
select is((select count(*) from public.payment_allocations where payment_id=(select id from public.payments where idempotency_key='ft-partial')),1::bigint,'FT: retry does not duplicate partial allocation');

-- Current resident wizard caps the amount at outstanding. This credit fixture
-- verifies the existing DATABASE contract; it does not claim that the UI can reuse credit.
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000004',true);
select lives_ok($$select public.create_payment_draft('81100000-0000-0000-0000-000000000001','81110000-0000-0000-0000-000000000001','81130000-0000-0000-0000-000000000004',null,current_date,5.00,'USD','Owner','FT-CREDIT',null,'ft-credit')$$,'FT: draft $5 for $4.50 obligation');
select lives_ok($$select public.submit_payment('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='ft-credit'))$$,'FT: submit $5 payment for approval');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000003',true);
select lives_ok($$select public.approve_payment('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='ft-credit'),jsonb_build_array(jsonb_build_object('receivable_item_id',(select id from public.receivable_items where description='FT charge 4.50'),'payment_amount','4.50','receivable_amount','4.50','payment_currency_code','USD','receivable_currency_code','USD')))$$,'FT: approve only $4.50 allocation');
select is((select sum(case direction when 'debit' then amount else -amount end) from public.receivable_ledger_entries where receivable_item_id=(select id from public.receivable_items where description='FT charge 4.50')),0.00::numeric,'FT: $4.50 obligation is paid exactly');
select is((select sum(payment_amount) from public.payment_allocations where payment_id=(select id from public.payments where idempotency_key='ft-credit')),4.50::numeric,'FT: allocated amount never exceeds charge');
select is((select outstanding_amount from public.receivable_balances where description='FT charge 4.50'),'0.00','FT: CxC read model shows the $4.50 charge settled');
select is((select amount from public.receivable_ledger_entries where payment_id=(select id from public.payments where idempotency_key='ft-credit') and receivable_item_id is null and entry_type='payment_credit'),0.50::numeric,'FT: excess $0.50 is separately credited');
select is((select snapshot->'approval'->>'unapplied_credit' from public.payment_receipts where payment_id=(select id from public.payments where idempotency_key='ft-credit')),'0.50','FT: receipt freezes $0.50 unapplied credit');
select lives_ok($$select public.approve_payment('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='ft-credit'),'[]'::jsonb)$$,'FT: repeated credit approval is idempotent');
select is((select count(*) from public.receivable_ledger_entries where payment_id=(select id from public.payments where idempotency_key='ft-credit') and entry_type='payment_credit'),2::bigint,'FT: no duplicate credit on retry');
select lives_ok($$select public.reverse_payment('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='ft-credit'),'FT refund correction')$$,'FT: reverse payment through compensation');
select is((select sum(case direction when 'debit' then amount else -amount end) from public.receivable_ledger_entries where receivable_item_id=(select id from public.receivable_items where description='FT charge 4.50')),4.50::numeric,'FT: reversing payment restores charge outstanding');
select is((select sum(case direction when 'credit' then amount else -amount end) from public.receivable_ledger_entries where payment_id=(select id from public.payments where idempotency_key='ft-credit') and receivable_item_id is null),0.00::numeric,'FT: reversal cancels unapplied credit exactly');
select is((select outstanding_amount from public.receivable_balances where description='FT charge 4.50'),'4.50','FT: CxC read model restores $4.50 after reversal');
select is((select count(*) from public.receivable_ledger_entries where payment_id=(select id from public.payments where idempotency_key='ft-credit') and entry_type='reversal'),2::bigint,'FT: reversal creates exactly two counterentries');

select * from finish();
rollback;
