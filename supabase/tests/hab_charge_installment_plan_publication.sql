begin;
select plan(13);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
('91400000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','plan-admin@test','x',now(),now()),
('91400000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','plan-owner@test','x',now(),now());
insert into public.organizations(id,name,created_by) values ('91410000-0000-0000-0000-000000000001','Plan org','91400000-0000-0000-0000-000000000001');
insert into public.condominiums(id,organization_id,name,created_by) values ('91420000-0000-0000-0000-000000000001','91410000-0000-0000-0000-000000000001','Plan condo','91400000-0000-0000-0000-000000000001');
insert into public.condominium_memberships(condominium_id,user_id,role) values ('91420000-0000-0000-0000-000000000001','91400000-0000-0000-0000-000000000001','condominium_admin');
insert into public.people(id,condominium_id,auth_user_id,first_name,last_name,created_by) values ('91440000-0000-0000-0000-000000000001','91420000-0000-0000-0000-000000000001','91400000-0000-0000-0000-000000000002','Legal','Owner','91400000-0000-0000-0000-000000000001');
insert into public.units(id,condominium_id,code,type,created_by) values
('91430000-0000-0000-0000-000000000001','91420000-0000-0000-0000-000000000001','P-1','apartment','91400000-0000-0000-0000-000000000001'),
('91430000-0000-0000-0000-000000000002','91420000-0000-0000-0000-000000000001','P-2','apartment','91400000-0000-0000-0000-000000000001'),
('91430000-0000-0000-0000-000000000003','91420000-0000-0000-0000-000000000001','NO-OWNER','apartment','91400000-0000-0000-0000-000000000001');
insert into public.unit_owners(unit_id,person_id,created_by) values
('91430000-0000-0000-0000-000000000001','91440000-0000-0000-0000-000000000001','91400000-0000-0000-0000-000000000001'),
('91430000-0000-0000-0000-000000000002','91440000-0000-0000-0000-000000000001','91400000-0000-0000-0000-000000000001');
insert into public.charge_concepts(id,condominium_id,code,name,category,created_by) values ('91450000-0000-0000-0000-000000000001','91420000-0000-0000-0000-000000000001','PLAN','Plan','extraordinary_dues','91400000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','91400000-0000-0000-0000-000000000001',true);
select is(jsonb_array_length(public.preview_charge_installment_plans('91420000-0000-0000-0000-000000000001','91450000-0000-0000-0000-000000000001','USD',current_date,current_date + 1,100.00,'[{"unit_id":"91430000-0000-0000-0000-000000000001"},{"unit_id":"91430000-0000-0000-0000-000000000003"}]','[{"due_date":"2027-01-01","amount":"50.00","currency_code":"USD"},{"due_date":"2027-02-01","amount":"50.00","currency_code":"USD"}]')->'blockers'),1,'preview blocks a selected unit with no verified owner');
select lives_ok($$select public.post_charge_installment_plans('91420000-0000-0000-0000-000000000001','91450000-0000-0000-0000-000000000001','Recovery plan','USD',current_date,current_date + 1,100.00,'[{"unit_id":"91430000-0000-0000-0000-000000000001"},{"unit_id":"91430000-0000-0000-0000-000000000002"}]','[{"due_date":"2027-01-01","amount":"33.33","currency_code":"USD"},{"due_date":"2027-02-01","amount":"33.33","currency_code":"USD"},{"due_date":"2027-03-01","amount":"33.34","currency_code":"USD"}]','publication-idempotency-key')$$,'admin publishes selected two-unit plan');
select is((select count(*) from public.receivable_items where condominium_id='91420000-0000-0000-0000-000000000001'),2::bigint,'one original receivable per selected unit');
select is((select count(*) from public.receivable_ledger_entries where condominium_id='91420000-0000-0000-0000-000000000001'),2::bigint,'no duplicate ledger entries or installment receivables');
select is((select count(*) from public.payment_agreements where condominium_id='91420000-0000-0000-0000-000000000001' and status='pending'),2::bigint,'one pending agreement per original charge');
select is((select count(*) from public.payment_agreement_receivables ar join public.payment_agreements a on a.id=ar.agreement_id where a.condominium_id='91420000-0000-0000-0000-000000000001'),2::bigint,'each proposal is linked to exactly its original charge');
select is((select count(*) from public.receivable_ledger_entries where condominium_id='91420000-0000-0000-0000-000000000001' and direction='credit'),0::bigint,'publication never settles, pays, reverses or credits debt');
select lives_ok($$select public.post_charge_installment_plans('91420000-0000-0000-0000-000000000001','91450000-0000-0000-0000-000000000001','Recovery plan','USD',current_date,current_date + 1,100.00,'[{"unit_id":"91430000-0000-0000-0000-000000000001"},{"unit_id":"91430000-0000-0000-0000-000000000002"}]','[{"due_date":"2027-01-01","amount":"33.33","currency_code":"USD"},{"due_date":"2027-02-01","amount":"33.33","currency_code":"USD"},{"due_date":"2027-03-01","amount":"33.34","currency_code":"USD"}]','publication-idempotency-key')$$,'double submit returns the first result');
select is((select count(*) from public.receivable_items where condominium_id='91420000-0000-0000-0000-000000000001'),2::bigint,'double submit cannot duplicate charges');
select lives_ok($$select public.post_charge_batch('91420000-0000-0000-0000-000000000001','91450000-0000-0000-0000-000000000001','Legacy single charge','USD',current_date,current_date + 1,'fixed_per_unit','[{"unit_id":"91430000-0000-0000-0000-000000000001"}]','legacy-single-key',25.00)$$,'legacy fixed-per-unit single path remains available');
select is((select count(*) from public.payment_agreements where condominium_id='91420000-0000-0000-0000-000000000001'),2::bigint,'legacy single path does not create a payment agreement');
select is((select count(*) from public.receivable_ledger_entries where condominium_id='91420000-0000-0000-0000-000000000001'),3::bigint,'legacy single path adds exactly one original charge ledger entry');
select throws_ok($$select public.post_charge_installment_plans('91420000-0000-0000-0000-000000000001','91450000-0000-0000-0000-000000000001','Broken batch','USD',current_date,current_date + 1,100.00,'[{"unit_id":"91430000-0000-0000-0000-000000000001"},{"unit_id":"91430000-0000-0000-0000-000000000003"}]','[{"due_date":"2027-01-01","amount":"50.00","currency_code":"USD"},{"due_date":"2027-02-01","amount":"50.00","currency_code":"USD"}]','rollback-key')$$,'22023','one or more selected units cannot be charged','invalid one of N units rolls back the entire publication');
select * from finish();
rollback;
