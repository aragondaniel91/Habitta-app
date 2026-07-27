begin;
select plan(59);

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
select throws_ok($$select public.create_payment_draft('81100000-0000-0000-0000-000000000001','81110000-0000-0000-0000-000000000002','81130000-0000-0000-0000-000000000001',null,current_date,1,'USD','Owner',null,null,'wrong-unit')$$,null,null,'owner cannot create for another unit');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000010',true);
select throws_ok($$select public.create_payment_draft('81100000-0000-0000-0000-000000000001','81110000-0000-0000-0000-000000000001','81130000-0000-0000-0000-000000000004',null,current_date,1,'USD','Expired',null,null,'expired')$$,null,null,'expired relation cannot create payment');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000005',true);
select lives_ok($$select public.create_payment_draft('81100000-0000-0000-0000-000000000001','81110000-0000-0000-0000-000000000001','81130000-0000-0000-0000-000000000004',null,current_date,1,'USD','Tenant',null,null,'tenant')$$,'active tenant creates payment');
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
select throws_ok($$select public.submit_payment('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='owner-proof'))$$,null,null,'submit requires reference');
select lives_ok($$select public.update_payment_draft('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='owner-proof'),'81130000-0000-0000-0000-000000000001',current_date,100,'USD','Owner','REF-1',null)$$,'owner adds required reference');
select throws_ok($$select public.submit_payment('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='owner-proof'))$$,null,null,'submit requires proof');
select lives_ok($$select public.record_payment_proof('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='owner-proof'),'81150000-0000-0000-0000-000000000001','payments/81150000-0000-0000-0000-000000000001','one.pdf','application/pdf',10,'abc')$$,'first proof is recorded');
select lives_ok($$select public.record_payment_proof('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='owner-proof'),'81150000-0000-0000-0000-000000000002','payments/81150000-0000-0000-0000-000000000002','two.pdf','application/pdf',11,'def')$$,'proof can be replaced before submit');
select is((select count(*) from public.payment_proofs where superseded_at is null),1::bigint,'proof replacement leaves one active version');
select lives_ok($$select public.submit_payment('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='owner-proof'))$$,'valid payment is submitted');
select throws_ok($$select public.record_payment_proof('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='owner-proof'),'81150000-0000-0000-0000-000000000003','payments/81150000-0000-0000-0000-000000000003','three.pdf','application/pdf',12,'ghi')$$,null,null,'proof cannot be replaced after submit');
select is((select count(*) from public.receivable_ledger_entries where payment_id=(select id from public.payments where idempotency_key='owner-proof')),0::bigint,'creating and submitting payment does not change ledger');

select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000007',true);
select public.submit_payment('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='assistant'));
select throws_ok($$select public.payment_transition('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='assistant'),'under_review',null)$$,null,null,'assistant cannot review');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000003',true);
select lives_ok($$select public.payment_transition('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='assistant'),'correction_requested','fix')$$,'reviewer requests correction');
select is((select count(*) from public.receivable_ledger_entries where payment_id=(select id from public.payments where idempotency_key='assistant')),0::bigint,'correction request does not change ledger');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000007',true);
select public.submit_payment('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='assistant'));
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000003',true);
select lives_ok($$select public.payment_transition('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='assistant'),'rejected','duplicate')$$,'reviewer rejects payment');
select is((select count(*) from public.receivable_ledger_entries where payment_id=(select id from public.payments where idempotency_key='assistant')),0::bigint,'rejection does not change ledger');
select lives_ok($$select public.payment_transition('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='owner-proof'),'under_review',null)$$,'payment reviewer starts review');

select is((select count(*) from public.payment_allocations),0::bigint,'preview starts without writes');
select is(jsonb_array_length((public.preview_payment_allocation('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='owner-proof'),jsonb_build_array(jsonb_build_object('receivable_item_id',(select id from public.receivable_items where description='USD due'),'payment_amount','60.00','receivable_amount','60.00','payment_currency_code','USD','receivable_currency_code','USD')))->'errors'),0,'same-currency preview validates one-to-one');
select ok(jsonb_array_length((public.preview_payment_allocation('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='owner-proof'),jsonb_build_array(jsonb_build_object('receivable_item_id',(select id from public.receivable_items where description='VES due'),'payment_amount','10.00','receivable_amount','400.00','payment_currency_code','USD','receivable_currency_code','VES')))->'errors')>0,'cross-currency preview requires rate');
select is(jsonb_array_length((public.preview_payment_allocation('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='owner-proof'),jsonb_build_array(jsonb_build_object('receivable_item_id',(select id from public.receivable_items where description='VES due'),'payment_amount','10.00','receivable_amount','400.00','payment_currency_code','USD','receivable_currency_code','VES','receivable_per_payment_rate','40.0000000000')))->'errors'),0,'exact rate produces correct receivable amount');
select ok(jsonb_array_length((public.preview_payment_allocation('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='owner-proof'),jsonb_build_array(jsonb_build_object('receivable_item_id',(select id from public.receivable_items where description='USD due'),'payment_amount','1.00','receivable_amount','1.00','payment_currency_code','USD','receivable_currency_code','USD'),jsonb_build_object('receivable_item_id',(select id from public.receivable_items where description='USD due'),'payment_amount','1.00','receivable_amount','1.00','payment_currency_code','USD','receivable_currency_code','USD')))->'errors')>0,'duplicate allocation is rejected');
select ok(jsonb_array_length((public.preview_payment_allocation('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='owner-proof'),jsonb_build_array(jsonb_build_object('receivable_item_id',(select id from public.receivable_items where description='USD due'),'payment_amount','101.00','receivable_amount','101.00','payment_currency_code','USD','receivable_currency_code','USD')))->'errors')>0,'outstanding cannot be over-applied');
select ok(jsonb_array_length((public.preview_payment_allocation('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='owner-proof'),jsonb_build_array(jsonb_build_object('receivable_item_id',(select id from public.receivable_items where description='VES due'),'payment_amount','101.00','receivable_amount','4040.00','payment_currency_code','USD','receivable_currency_code','VES','receivable_per_payment_rate','40.0000000000')))->'errors')>0,'allocations cannot exceed payment amount');
select is((select count(*) from public.payment_allocations),0::bigint,'preview writes no allocations');
select lives_ok($$select public.approve_payment('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='owner-proof'),jsonb_build_array(jsonb_build_object('receivable_item_id',(select id from public.receivable_items where description='USD due'),'payment_amount','60.00','receivable_amount','60.00','payment_currency_code','USD','receivable_currency_code','USD')))$$,'payment reviewer approves partial application');
select is((select sum(case direction when 'debit' then amount else -amount end) from public.receivable_ledger_entries where receivable_item_id=(select id from public.receivable_items where description='USD due')),40.00::numeric,'partial payment reduces outstanding');
select is((select amount from public.receivable_ledger_entries where payment_id=(select id from public.payments where idempotency_key='owner-proof') and receivable_item_id is null),40.00::numeric,'remainder creates unapplied credit');
select lives_ok($$select public.approve_payment('81100000-0000-0000-0000-000000000001',(select id from public.payments where idempotency_key='owner-proof'),'[]')$$,'repeated approval is idempotent');
select is((select count(*) from public.receivable_ledger_entries where payment_id=(select id from public.payments where idempotency_key='owner-proof') and entry_type='payment_credit'),2::bigint,'repeated approval does not duplicate ledger');
select is((select count(*) from public.payment_receipts where payment_id=(select id from public.payments where idempotency_key='owner-proof')),1::bigint,'receipt is unique');
select is((select count(distinct sequence_number) from public.payment_receipts),1::bigint,'receipt sequence number is unique');
select is((select snapshot->'condominium'->>'name' from public.payment_receipts limit 1),'Condo Pay A','snapshot preserves condominium');
select is((select snapshot->'unit'->>'code'||':'||snapshot->'method'->>'display_name' from public.payment_receipts limit 1),'A-1:Bank USD','snapshot preserves unit and method');

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
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000001',true);
select throws_ok($$delete from public.condominium_payment_methods where id='81130000-0000-0000-0000-000000000004'$$,null,null,'payment methods cannot be deleted');
select throws_ok($$select * from public.payment_receipt_sequences$$,null,null,'receipt sequences are private');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000004',true);
select is((select count(*) from public.condominium_payment_methods where condominium_id='82200000-0000-0000-0000-000000000002'),0::bigint,'Condo A user cannot read Condo B methods');
select is((select count(*) from public.payments where condominium_id='82200000-0000-0000-0000-000000000002'),0::bigint,'Condo A user cannot read Condo B payments');
select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-000000000006',true);
select is((select count(*) from public.payments),0::bigint,'board member cannot read individual payments');
select is((select count(*) from public.payment_proofs),0::bigint,'board member cannot read proof metadata');

select * from finish();
rollback;
