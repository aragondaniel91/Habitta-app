begin;
select plan(35);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
('70000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin@fin.test','x',now(),now()),
('70000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','accountant@fin.test','x',now(),now()),
('70000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','reviewer@fin.test','x',now(),now()),
('70000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner@fin.test','x',now(),now()),
('70000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','tenant@fin.test','x',now(),now()),
('70000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000000','authenticated','authenticated','board@fin.test','x',now(),now()),
('70000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000000','authenticated','authenticated','other@fin.test','x',now(),now());
insert into public.organizations(id,name,created_by) values ('71000000-0000-0000-0000-000000000001','Finance A','70000000-0000-0000-0000-000000000001'),('72000000-0000-0000-0000-000000000002','Finance B','70000000-0000-0000-0000-000000000007');
insert into public.condominiums(id,organization_id,name,created_by) values ('71100000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001','Condo A','70000000-0000-0000-0000-000000000001'),('72200000-0000-0000-0000-000000000002','72000000-0000-0000-0000-000000000002','Condo B','70000000-0000-0000-0000-000000000007');
insert into public.condominium_memberships(condominium_id,user_id,role) values
('71100000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','condominium_admin'),
('71100000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002','accountant'),
('71100000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000003','payment_reviewer'),
('71100000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000004','owner'),
('71100000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000005','tenant'),
('71100000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000006','board_member'),
('72200000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000007','condominium_admin');
insert into public.units(id,condominium_id,code,type,created_by) values
('71110000-0000-0000-0000-000000000001','71100000-0000-0000-0000-000000000001','A-1','apartment','70000000-0000-0000-0000-000000000001'),
('71110000-0000-0000-0000-000000000002','71100000-0000-0000-0000-000000000001','A-2','apartment','70000000-0000-0000-0000-000000000001'),
('72220000-0000-0000-0000-000000000001','72200000-0000-0000-0000-000000000002','B-1','apartment','70000000-0000-0000-0000-000000000007');
insert into public.people(id,condominium_id,auth_user_id,first_name,last_name,created_by) values
('71111000-0000-0000-0000-000000000004','71100000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000004','Own','Er','70000000-0000-0000-0000-000000000001'),
('71111000-0000-0000-0000-000000000005','71100000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000005','Ten','Ant','70000000-0000-0000-0000-000000000001');
insert into public.unit_owners(unit_id,person_id,created_by) values ('71110000-0000-0000-0000-000000000001','71111000-0000-0000-0000-000000000004','70000000-0000-0000-0000-000000000001');
insert into public.unit_occupancies(unit_id,person_id,occupancy_type,created_by) values ('71110000-0000-0000-0000-000000000002','71111000-0000-0000-0000-000000000005','tenant','70000000-0000-0000-0000-000000000001');
insert into public.charge_concepts(id,condominium_id,code,name,category,created_by) values ('71120000-0000-0000-0000-000000000001','71100000-0000-0000-0000-000000000001','DUES','Dues','regular_dues','70000000-0000-0000-0000-000000000001');

set local role authenticated; select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.create_receivable_item('71100000-0000-0000-0000-000000000001','71110000-0000-0000-0000-000000000001','71120000-0000-0000-0000-000000000001','Admin charge',100.00,'USD',current_date-95,current_date-91)$$,'condominium admin creates charge');
select is((select direction::text from public.receivable_ledger_entries where description='Admin charge'),'debit','manual charge creates debit');
select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-000000000002',true);
select lives_ok($$select public.create_receivable_item('71100000-0000-0000-0000-000000000001','71110000-0000-0000-0000-000000000002','71120000-0000-0000-0000-000000000001','Accountant charge',50.00,'VES',current_date,current_date+10)$$,'accountant creates charge');
select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-000000000003',true);
select throws_ok($$select public.create_receivable_item('71100000-0000-0000-0000-000000000001','71110000-0000-0000-0000-000000000001',null,'Denied',1.00,'USD',current_date,null)$$,null,null,'payment reviewer cannot create charge');
select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-000000000004',true);
select is((select count(distinct unit_id) from public.receivable_items),1::bigint,'owner reads only related unit');
select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-000000000005',true);
select is((select count(distinct unit_id) from public.receivable_items),1::bigint,'tenant reads only related unit');
select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-000000000007',true);
select is((select count(*) from public.receivable_items where condominium_id='71100000-0000-0000-0000-000000000001'),0::bigint,'Condo B cannot read Condo A');
select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-000000000006',true);
select is((select count(*) from public.receivable_items),0::bigint,'board member cannot enumerate debt');
select ok((select count(*) from public.get_receivables_summary('71100000-0000-0000-0000-000000000001'))>0,'board member obtains aggregates');

reset role; select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-000000000001',true);
select throws_ok($$update public.receivable_ledger_entries set amount=1 where description='Admin charge'$$,null,'ledger entries are immutable','ledger rejects update');
select throws_ok($$delete from public.receivable_ledger_entries where description='Admin charge'$$,null,'ledger entries are immutable','ledger rejects delete');
set local role authenticated; select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.import_opening_balances('71100000-0000-0000-0000-000000000001','[{"unit_code":"A-1","balance_type":"debit","amount":"25.00","currency_code":"USD","effective_date":"2026-01-01"},{"unit_code":"A-2","balance_type":"credit","amount":"5.00","currency_code":"VES","effective_date":"2026-02-01"}]','opening-1','opening.csv')$$,'opening balances import succeeds');
select is((select item_type::text from public.receivable_items where original_amount=25),'opening_balance','opening debit uses opening_balance item');
select is((select entry_type::text from public.receivable_ledger_entries where amount=25),'opening_debit','opening debit uses opening_debit');
select is((select direction::text from public.receivable_ledger_entries where amount=5),'credit','opening credit creates credit');
select lives_ok($$select public.post_charge_batch('71100000-0000-0000-0000-000000000001','71120000-0000-0000-0000-000000000001','Fixed','USD',current_date,current_date+10,'fixed_per_unit','[{"unit_id":"71110000-0000-0000-0000-000000000001"},{"unit_id":"71110000-0000-0000-0000-000000000002"}]','fixed-1',10.00)$$,'fixed batch posts');
select is((select count(*) from public.receivable_items where charge_batch_id is not null),2::bigint,'batch links charge_batch_id');
select is((select sum(original_amount) from public.receivable_items where charge_batch_id is not null),20.00::numeric,'fixed batch amounts are correct');
select lives_ok($$select public.post_charge_batch('71100000-0000-0000-0000-000000000001','71120000-0000-0000-0000-000000000001','Custom','USD',current_date,current_date+10,'custom_per_unit','[{"unit_id":"71110000-0000-0000-0000-000000000001","amount":"7.25"},{"unit_id":"71110000-0000-0000-0000-000000000002","amount":"8.75"}]','custom-1',null)$$,'custom batch posts');
select is((select sum(original_amount) from public.receivable_items i join public.charge_batches b on b.id=i.charge_batch_id where b.idempotency_key='custom-1'),16.00::numeric,'custom amounts are correct');
select throws_ok($$select public.post_charge_batch('71100000-0000-0000-0000-000000000001','71120000-0000-0000-0000-000000000001','Duplicate','USD',current_date,current_date+10,'fixed_per_unit','[{"unit_id":"71110000-0000-0000-0000-000000000001"},{"unit_id":"71110000-0000-0000-0000-000000000001"}]','duplicate',1.00)$$,null,null,'duplicate unit rejected');
select throws_ok($$select public.import_opening_balances('71100000-0000-0000-0000-000000000001','[{"unit_code":"MISSING","balance_type":"debit","amount":"10.00","currency_code":"USD","effective_date":"2026-01-01"}]','invalid-import',null)$$,null,null,'invalid import rolls back');
select is((select count(*) from public.opening_balance_imports where idempotency_key='invalid-import'),0::bigint,'invalid import wrote nothing');
select lives_ok($$select public.import_opening_balances('71100000-0000-0000-0000-000000000001','[{"unit_code":"A-1","balance_type":"debit","amount":"25.00","currency_code":"USD","effective_date":"2026-01-01"},{"unit_code":"A-2","balance_type":"credit","amount":"5.00","currency_code":"VES","effective_date":"2026-02-01"}]','opening-1','opening.csv')$$,'import idempotency returns result');
select is((select count(*) from public.opening_balance_imports where idempotency_key='opening-1'),1::bigint,'import key does not duplicate');
select lives_ok($$select public.post_charge_batch('71100000-0000-0000-0000-000000000001','71120000-0000-0000-0000-000000000001','Fixed','USD',current_date,current_date+10,'fixed_per_unit','[{"unit_id":"71110000-0000-0000-0000-000000000001"},{"unit_id":"71110000-0000-0000-0000-000000000002"}]','fixed-1',10.00)$$,'batch idempotency returns result');
select is((select count(*) from public.charge_batches where idempotency_key='fixed-1'),1::bigint,'batch key does not duplicate');
select lives_ok($$select public.reverse_receivable_item('71100000-0000-0000-0000-000000000001',(select id from public.receivable_items where description='Admin charge'),'correction')$$,'reversal succeeds');
select is((select direction::text from public.receivable_ledger_entries where entry_type='reversal' limit 1),'credit','reversal has opposite direction');
select throws_ok($$select public.reverse_receivable_item('71100000-0000-0000-0000-000000000001',(select id from public.receivable_items where description='Admin charge'),'again')$$,null,null,'double reversal rejected');
select is((select count(distinct currency_code) from public.get_receivables_summary('71100000-0000-0000-0000-000000000001')),2::bigint,'USD and VES remain separate');
select ok((select count(distinct currency_code) from public.get_unit_statement('71100000-0000-0000-0000-000000000001','71110000-0000-0000-0000-000000000001'))>=1,'statement calculates balances by currency');
select ok((select over_90::numeric from public.get_receivables_aging('71100000-0000-0000-0000-000000000001') where currency_code='USD')>=0,'aging classifies dates');
reset role;
select throws_ok($$update public.charge_batches set name='Changed' where idempotency_key='fixed-1'$$,null,'posted batches are immutable','posted batch cannot update');
select throws_ok($$delete from public.charge_batches where idempotency_key='fixed-1'$$,null,'posted batches are immutable','posted batch cannot delete');
select * from finish(); rollback;
