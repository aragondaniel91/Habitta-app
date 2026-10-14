begin;
select plan(22);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
('91300000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin@agreement.test','x',now(),now()),
('91300000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner@agreement.test','x',now(),now()),
('91300000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','tenant@agreement.test','x',now(),now());
insert into public.organizations(id,name,created_by) values ('91310000-0000-0000-0000-000000000001','Agreement org','91300000-0000-0000-0000-000000000001');
insert into public.condominiums(id,organization_id,name,created_by) values ('91320000-0000-0000-0000-000000000001','91310000-0000-0000-0000-000000000001','Agreement condo','91300000-0000-0000-0000-000000000001');
insert into public.condominium_memberships(condominium_id,user_id,role) values
('91320000-0000-0000-0000-000000000001','91300000-0000-0000-0000-000000000001','condominium_admin'),
('91320000-0000-0000-0000-000000000001','91300000-0000-0000-0000-000000000002','owner'),
('91320000-0000-0000-0000-000000000001','91300000-0000-0000-0000-000000000003','tenant');
insert into public.units(id,condominium_id,code,type,created_by) values ('91330000-0000-0000-0000-000000000001','91320000-0000-0000-0000-000000000001','A-1','apartment','91300000-0000-0000-0000-000000000001');
insert into public.people(id,condominium_id,auth_user_id,first_name,last_name,created_by) values
('91340000-0000-0000-0000-000000000002','91320000-0000-0000-0000-000000000001','91300000-0000-0000-0000-000000000002','Owner','One','91300000-0000-0000-0000-000000000001'),
('91340000-0000-0000-0000-000000000003','91320000-0000-0000-0000-000000000001','91300000-0000-0000-0000-000000000003','Tenant','One','91300000-0000-0000-0000-000000000001');
insert into public.unit_owners(unit_id,person_id,created_by) values ('91330000-0000-0000-0000-000000000001','91340000-0000-0000-0000-000000000002','91300000-0000-0000-0000-000000000001');
insert into public.unit_occupancies(unit_id,person_id,occupancy_type,created_by) values ('91330000-0000-0000-0000-000000000001','91340000-0000-0000-0000-000000000003','tenant','91300000-0000-0000-0000-000000000001');
insert into public.charge_concepts(id,condominium_id,code,name,category,created_by) values ('91350000-0000-0000-0000-000000000001','91320000-0000-0000-0000-000000000001','DUE','Dues','regular_dues','91300000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','91300000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.create_receivable_item('91320000-0000-0000-0000-000000000001','91330000-0000-0000-0000-000000000001','91350000-0000-0000-0000-000000000001','Outstanding debt',100.00,'USD',current_date,current_date)$$,'existing debt is created normally');
select is((select count(*) from public.receivable_ledger_entries),1::bigint,'baseline has only the original charge ledger entry');

select set_config('request.jwt.claim.sub','91300000-0000-0000-0000-000000000003',true);
select lives_ok($$select public.create_payment_agreement('91320000-0000-0000-0000-000000000001','91330000-0000-0000-0000-000000000001','91340000-0000-0000-0000-000000000002','USD','[{"due_date":"2026-12-01","amount":"50.00","currency_code":"USD"},{"due_date":"2027-01-01","amount":"50.00","currency_code":"USD"}]',(select array_agg(id) from public.receivable_items where description='Outstanding debt'),'resident proposal','agreement-test-key')$$,'verified tenant proposes a schedule for the owner debt');
select is((select initiated_by::text from public.payment_agreements),'resident','tenant proposal is marked resident initiated');
select is((select legal_obligor_person_id from public.payment_agreements),'91340000-0000-0000-0000-000000000002'::uuid,'tenant proposal does not transfer the owner obligation');
select is((select count(*) from public.receivable_ledger_entries),1::bigint,'proposal creates no ledger entry or allocation');
select lives_ok($$select count(*) from public.payment_agreements$$,'resident can read the unit-scoped agreement through RLS');
select ok(has_function_privilege('authenticated','public.can_propose_payment_agreement(uuid)','EXECUTE'),'RLS helper is executable by authenticated');
select ok(not has_function_privilege('anon','public.can_propose_payment_agreement(uuid)','EXECUTE'),'RLS helper remains unavailable to anon');
select ok((select pg_get_constraintdef(c.oid) like '%announcement%' and pg_get_constraintdef(c.oid) like '%maintenance%' and pg_get_constraintdef(c.oid) like '%service_request%' and pg_get_constraintdef(c.oid) like '%governance%' and pg_get_constraintdef(c.oid) like '%payment_agreement%' from pg_constraint c where c.conrelid='public.notification_events'::regclass and c.conname='notification_events_aggregate_type_check'),'notification aggregate constraint retains every legacy category and payment agreements');
select ok((select pg_get_functiondef('public.process_notification_event(uuid)'::regprocedure)) like '%processed_at=case when attempts_value>=5 then now() else null end%','shared notification processing stamps permanent failures');
reset role;
-- This runs against the populated local Supabase database, so scope the assertion to the
-- agreement created above instead of counting unrelated historical notification rows.
select is((select count(*) from public.notification_events where aggregate_type='payment_agreement' and aggregate_id=(select id from public.payment_agreements order by created_at desc limit 1)),1::bigint,'proposal emits a scoped payment-agreement notification without disturbing the shared validator');
set local role authenticated;
select throws_ok($$select public.create_payment_agreement('91320000-0000-0000-0000-000000000001','91330000-0000-0000-0000-000000000001','91340000-0000-0000-0000-000000000002','USD','[{"due_date":"2026-12-01","amount":"50.00"}]',(select array_agg(id) from public.receivable_items where description='Outstanding debt'),'duplicate','agreement-test-key-2')$$,'23505','receivable already has an active payment agreement','active agreement prevents overlapping request');

select set_config('request.jwt.claim.sub','91300000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.transition_payment_agreement((select id from public.payment_agreements),'counter','[{"due_date":"2026-12-15","amount":"100.00","currency_code":"USD"}]','administrative counter',1)$$,'administrator may counterproposal atomically');
select is((select revision_count from public.payment_agreements),2,'counter increments bounded revision');
select throws_ok($$select public.transition_payment_agreement((select id from public.payment_agreements),'accept',null,'self-accept',2)$$,'42501','payment agreement transition denied','the party who just countered cannot self-accept their own counteroffer');

select set_config('request.jwt.claim.sub','91300000-0000-0000-0000-000000000003',true);
select lives_ok($$select public.transition_payment_agreement((select id from public.payment_agreements),'accept',null,'accepted',2)$$,'the original initiator may accept the administrator''s counteroffer');
select is((select status::text from public.payment_agreements),'accepted','accepted is explicit state');
select is((select count(*) from public.payment_agreement_events),3::bigint,'immutable history captures proposal counter and acceptance');

select set_config('request.jwt.claim.sub','91300000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.create_receivable_item('91320000-0000-0000-0000-000000000001','91330000-0000-0000-0000-000000000001','91350000-0000-0000-0000-000000000001','Amount guard debt',30.00,'USD',current_date,current_date)$$,'second debt is created for amount guard checks');
select set_config('request.jwt.claim.sub','91300000-0000-0000-0000-000000000003',true);
select throws_ok($$select public.create_payment_agreement('91320000-0000-0000-0000-000000000001','91330000-0000-0000-0000-000000000001','91340000-0000-0000-0000-000000000002','USD','[{"due_date":"2026-12-01","amount":"29.99","currency_code":"USD"}]',(select array_agg(id) from public.receivable_items where description='Amount guard debt'),'under','amount-guard-under')$$,'22023','agreement schedule must equal the current outstanding receivable amount','under-allocated schedules are rejected');
select throws_ok($$select public.create_payment_agreement('91320000-0000-0000-0000-000000000001','91330000-0000-0000-0000-000000000001','91340000-0000-0000-0000-000000000002','USD','[{"due_date":"2026-12-01","amount":"30.01","currency_code":"USD"}]',(select array_agg(id) from public.receivable_items where description='Amount guard debt'),'over','amount-guard-over')$$,'22023','agreement schedule must equal the current outstanding receivable amount','over-allocated schedules are rejected');

select * from finish();
rollback;
