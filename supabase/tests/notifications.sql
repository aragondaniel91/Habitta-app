begin;
select plan(72);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
('a0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin@n.test','x',now(),now()),
('a0000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','accountant@n.test','x',now(),now()),
('a0000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','reviewer@n.test','x',now(),now()),
('a0000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','assistant@n.test','x',now(),now()),
('a0000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','board@n.test','x',now(),now()),
('a0000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner@n.test','x',now(),now()),
('a0000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000000','authenticated','authenticated','tenant@n.test','x',now(),now()),
('a0000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000000','authenticated','authenticated','occupant@n.test','x',now(),now()),
('a0000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000000','authenticated','authenticated','family@n.test','x',now(),now()),
('a0000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000000','authenticated','authenticated','expired@n.test','x',now(),now()),
('a0000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated','other@n.test','x',now(),now()),
('a0000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated',null,'x',now(),now());
insert into public.organizations(id,name,created_by) values ('a1000000-0000-0000-0000-000000000001','Notify A','a0000000-0000-0000-0000-000000000001'),('b1000000-0000-0000-0000-000000000001','Notify B','a0000000-0000-0000-0000-000000000011');
insert into public.condominiums(id,organization_id,name,created_by) values ('a2000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','Condo A','a0000000-0000-0000-0000-000000000001'),('b2000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','Condo B','a0000000-0000-0000-0000-000000000011');
update public.condominium_notification_settings set timezone='UTC', live_email_enabled=true where condominium_id in ('a2000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001');
insert into public.organization_memberships(organization_id,user_id,role) values ('a1000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','organization_owner');
insert into public.condominium_memberships(condominium_id,user_id,role) values
('a2000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','condominium_admin'),
('a2000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','accountant'),
('a2000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000003','payment_reviewer'),
('a2000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000004','assistant'),
('a2000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000005','board_member'),
('a2000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000006','owner'),
('b2000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000011','condominium_admin');
insert into public.units(id,condominium_id,code,type,created_by) values ('a3000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','A-1','apartment','a0000000-0000-0000-0000-000000000001'),('b3000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','B-1','apartment','a0000000-0000-0000-0000-000000000011');
insert into public.people(id,condominium_id,auth_user_id,first_name,last_name,email,created_by) values
('a4000000-0000-0000-0000-000000000006','a2000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000006','Owner','Active','OWNER@n.test','a0000000-0000-0000-0000-000000000001'),
('a4000000-0000-0000-0000-000000000007','a2000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000007','Tenant','Active',null,'a0000000-0000-0000-0000-000000000001'),
('a4000000-0000-0000-0000-000000000008','a2000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000008','Authorized','Active',null,'a0000000-0000-0000-0000-000000000001'),
('a4000000-0000-0000-0000-000000000009','a2000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000009','Family','Active',null,'a0000000-0000-0000-0000-000000000001'),
('a4000000-0000-0000-0000-000000000010','a2000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000010','Owner','Expired',null,'a0000000-0000-0000-0000-000000000001'),
('a4000000-0000-0000-0000-000000000012','a2000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000012','Fallback','Mail','fallback@n.test','a0000000-0000-0000-0000-000000000001'),
('b4000000-0000-0000-0000-000000000011','b2000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000011','Other','Condo',null,'a0000000-0000-0000-0000-000000000011');
insert into public.unit_owners(unit_id,person_id,starts_at,ends_at,created_by) values
('a3000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000006',current_date-30,null,'a0000000-0000-0000-0000-000000000001'),
('a3000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000010',current_date-30,current_date-1,'a0000000-0000-0000-0000-000000000001'),
('a3000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000012',current_date+1,null,'a0000000-0000-0000-0000-000000000001');
insert into public.unit_occupancies(unit_id,person_id,occupancy_type,starts_at,created_by) values
('a3000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000006','owner_occupant',current_date-20,'a0000000-0000-0000-0000-000000000001'),
('a3000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000007','tenant',current_date-20,'a0000000-0000-0000-0000-000000000001'),
('a3000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000008','authorized_occupant',current_date-20,'a0000000-0000-0000-0000-000000000001'),
('a3000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000009','family_member',current_date-20,'a0000000-0000-0000-0000-000000000001');
insert into public.charge_concepts(id,condominium_id,code,name,category,created_by) values ('a5000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','FEE','Fee','regular_dues','a0000000-0000-0000-0000-000000000001'),('b5000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','FEE','Fee','regular_dues','a0000000-0000-0000-0000-000000000011');
insert into public.condominium_payment_methods(id,condominium_id,method_type,display_name,currency_code,created_by) values ('a6000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','cash','Cash','USD','a0000000-0000-0000-0000-000000000001');

set local role authenticated; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.create_receivable_item('a2000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001','Monthly',100,'USD',current_date,current_date+3)$$,'create charge succeeds'); -- 1
reset role;
select is((select count(*) from public.notification_events where event_type='receivable_created'),1::bigint,'charge creates event'); -- 2
set local role authenticated; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.post_charge_batch('a2000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001','Batch','USD',current_date,current_date+10,'fixed_per_unit','[{"unit_id":"a3000000-0000-0000-0000-000000000001"}]','batch-key',25)$$,'batch posts'); -- 3
select lives_ok($$select public.post_charge_batch('a2000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001','Batch','USD',current_date,current_date+10,'fixed_per_unit','[{"unit_id":"a3000000-0000-0000-0000-000000000001"}]','batch-key',25)$$,'batch replay succeeds'); -- 4
reset role;
select is((select count(*) from public.notification_events e join public.receivable_items i on i.id=e.aggregate_id where i.charge_batch_id is not null),1::bigint,'idempotent batch does not duplicate event'); -- 5
insert into public.receivable_items(id,condominium_id,unit_id,concept_id,item_type,description,issue_date,due_date,currency_code,original_amount,created_by) values ('a7000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001','opening_balance','Opening',current_date,current_date+4,'USD',50,'a0000000-0000-0000-0000-000000000001');
select is((select count(*) from public.notification_events where aggregate_id='a7000000-0000-0000-0000-000000000001' and event_type='opening_balance_created'),1::bigint,'opening balance creates event'); -- 6
do $$ begin begin insert into public.receivable_items(id,condominium_id,unit_id,concept_id,item_type,description,issue_date,currency_code,original_amount,created_by) values ('a7000000-0000-0000-0000-000000000099','a2000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001','charge','Rollback',current_date,'USD',1,'a0000000-0000-0000-0000-000000000001'); raise exception 'rollback'; exception when others then null; end; end $$;
select is((select count(*) from public.notification_events where aggregate_id='a7000000-0000-0000-0000-000000000099'),0::bigint,'financial rollback leaves no event'); -- 7

insert into public.payments(id,condominium_id,unit_id,submitted_by_user_id,submitted_for_person_id,payment_method_id,status,payment_date,original_amount,original_currency_code,payer_name,idempotency_key) values
('a8000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000006','a4000000-0000-0000-0000-000000000007','a6000000-0000-0000-0000-000000000001','draft',current_date,20,'USD','Owner','p1'),
('a8000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000006',null,'a6000000-0000-0000-0000-000000000001','draft',current_date,21,'USD','Owner','p2'),
('a8000000-0000-0000-0000-000000000003','a2000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000006',null,'a6000000-0000-0000-0000-000000000001','draft',current_date,22,'USD','Owner','p3');
update public.payments set status='submitted' where id in ('a8000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000002','a8000000-0000-0000-0000-000000000003');
select is((select count(*) from public.notification_events where event_type='payment_submitted'),3::bigint,'submitted generates events'); -- 8
update public.payments set status='correction_requested',correction_reason='Fix' where id='a8000000-0000-0000-0000-000000000001';
select is((select count(*) from public.notification_events where event_type='payment_correction_requested'),1::bigint,'correction generates event'); -- 9
update public.payments set status='rejected',rejection_reason='No',rejected_by='a0000000-0000-0000-0000-000000000003' where id='a8000000-0000-0000-0000-000000000002';
select is((select count(*) from public.notification_events where event_type='payment_rejected'),1::bigint,'rejection generates event'); -- 10
update public.payments set status='approved',approved_by='a0000000-0000-0000-0000-000000000003',approved_at=now() where id='a8000000-0000-0000-0000-000000000003';
select is((select count(*) from public.notification_events where event_type='payment_approved'),1::bigint,'approval generates event'); -- 11
insert into public.payment_receipts(id,condominium_id,payment_id,receipt_number,sequence_year,sequence_number,issued_by,snapshot) values ('a9000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000003','REC-TEST',2026,1,'a0000000-0000-0000-0000-000000000003','{}');
select is((select count(*) from public.notification_events where event_type='payment_receipt_issued'),1::bigint,'receipt generates event'); -- 12
update public.payments set status='reversed',reversed_by='a0000000-0000-0000-0000-000000000003',reversed_at=now(),reversal_reason='Reverse' where id='a8000000-0000-0000-0000-000000000003';
select is((select count(*) from public.notification_events where event_type='payment_reversed'),1::bigint,'reversal generates event'); -- 13

select lives_ok($$select public.expand_notification_event(id) from public.notification_events where event_type='receivable_created' order by created_at limit 1$$,'receivable expands'); -- 14
select ok(exists(select 1 from public.notifications where recipient_user_id='a0000000-0000-0000-0000-000000000006' and notification_type='receivable_created'),'active owner receives'); -- 15
select ok(exists(select 1 from public.notifications where recipient_user_id='a0000000-0000-0000-0000-000000000007' and notification_type='receivable_created'),'active tenant receives'); -- 16
select ok(exists(select 1 from public.notifications where recipient_user_id='a0000000-0000-0000-0000-000000000008' and notification_type='receivable_created'),'authorized occupant receives'); -- 17
select is((select count(*) from public.notifications where recipient_user_id='a0000000-0000-0000-0000-000000000009'),0::bigint,'family member excluded'); -- 18
select is((select count(*) from public.notifications where recipient_user_id='a0000000-0000-0000-0000-000000000010'),0::bigint,'expired relationship excluded'); -- 19
select is((select count(*) from public.notifications where recipient_user_id='a0000000-0000-0000-0000-000000000012'),0::bigint,'future relationship excluded'); -- 20
select is((select count(*) from public.notifications where recipient_user_id='a0000000-0000-0000-0000-000000000006' and notification_type='receivable_created'),1::bigint,'multiple relationships deduplicate recipient'); -- 21
select lives_ok($$select public.expand_notification_event(id) from public.notification_events where event_type='payment_submitted' order by created_at limit 1$$,'review event expands'); -- 22
select ok(exists(select 1 from public.notifications where recipient_user_id='a0000000-0000-0000-0000-000000000003' and notification_type='payment_submitted'),'reviewer receives submitted'); -- 23
select is((select count(*) from public.notifications where recipient_user_id='a0000000-0000-0000-0000-000000000004' and notification_type='payment_submitted'),0::bigint,'assistant excluded from review'); -- 24
select is((select count(*) from public.notifications where recipient_user_id='a0000000-0000-0000-0000-000000000005' and notification_type='payment_submitted'),0::bigint,'board excluded from review'); -- 25
select lives_ok($$select public.expand_notification_event(id) from public.notification_events where event_type='payment_receipt_issued'$$,'receipt expands through payment'); -- 26
select ok(exists(select 1 from public.notifications where recipient_user_id='a0000000-0000-0000-0000-000000000006' and notification_type='payment_receipt_issued'),'receipt reaches submitted by'); -- 27
select is((select count(*) from public.notifications where recipient_user_id='a0000000-0000-0000-0000-000000000011'),0::bigint,'Condo B user never receives Condo A'); -- 28

insert into public.notification_preferences(condominium_id,user_id,notification_type,in_app_enabled,email_enabled) values ('a2000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000006','payment_rejected',false,false),('a2000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000007','opening_balance_created',false,false);
select lives_ok($$select public.expand_notification_event(id) from public.notification_events where event_type='payment_rejected'$$,'critical event expands'); -- 29
select ok(exists(select 1 from public.notifications where recipient_user_id='a0000000-0000-0000-0000-000000000006' and notification_type='payment_rejected'),'critical in-app cannot be disabled'); -- 30
select lives_ok($$select public.expand_notification_event(id) from public.notification_events where event_type='opening_balance_created'$$,'noncritical event expands'); -- 31
select is((select count(*) from public.notifications where recipient_user_id='a0000000-0000-0000-0000-000000000007' and notification_type='opening_balance_created'),0::bigint,'noncritical in-app preference honored'); -- 32
select ok(exists(select 1 from public.notification_deliveries where recipient_user_id='a0000000-0000-0000-0000-000000000006' and status='skipped' and last_error_code='user_email_disabled'),'disabled user email creates skipped'); -- 33
update public.condominium_notification_settings set email_enabled=false where condominium_id='a2000000-0000-0000-0000-000000000001';
select lives_ok($$select public.expand_notification_event(id) from public.notification_events where event_type='payment_correction_requested'$$,'settings-disabled event expands'); -- 34
select ok(exists(select 1 from public.notification_deliveries where event_id in (select id from public.notification_events where event_type='payment_correction_requested') and status='skipped' and last_error_code='condominium_email_disabled'),'condominium email disabled creates skipped'); -- 35
update public.condominium_notification_settings set email_enabled=true where condominium_id='a2000000-0000-0000-0000-000000000001';
update auth.users set email=null where id='a0000000-0000-0000-0000-000000000008';
select lives_ok($$select public.expand_notification_event(id) from public.notification_events where event_type='payment_approved'$$,'missing-email event expands'); -- 36
select ok(exists(select 1 from public.notification_deliveries where recipient_user_id='a0000000-0000-0000-0000-000000000008' and status='skipped' and last_error_code='recipient_email_unavailable'),'missing email creates skipped'); -- 37
select is((select count(*) from (select 1 from public.notification_deliveries d group by d.event_id,d.recipient_user_id,d.channel having count(*)>1) duplicates),0::bigint,'delivery deduplication holds'); -- 38

set local role authenticated; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000006',true);
select ok((select count(*) from public.notifications)>0,'user reads own notifications'); -- 39
select is((select count(*) from public.notifications where recipient_user_id<>'a0000000-0000-0000-0000-000000000006'),0::bigint,'user cannot read another inbox'); -- 40
select lives_ok($$select public.mark_notification_read(id) from public.notifications limit 1$$,'mark read succeeds'); -- 41
select lives_ok($$select public.mark_notification_read(id) from public.notifications limit 1$$,'mark read is idempotent'); -- 42
select lives_ok($$select public.mark_all_notifications_read(null)$$,'mark all is scoped to caller'); -- 43
select lives_ok($$select public.archive_notification(id) from public.notifications limit 1$$,'archive own notification'); -- 44
select throws_ok($$select * from public.notification_events$$,'permission denied for table notification_events','authenticated cannot access outbox'); -- 45
select throws_ok($$select * from public.notification_deliveries$$,'permission denied for table notification_deliveries','authenticated cannot access deliveries'); -- 46
select throws_ok($$select public.update_condominium_notification_settings('a2000000-0000-0000-0000-000000000001',true,true,3,true,'UTC')$$,'permission denied','resident cannot modify settings'); -- 47
reset role;

select is(public.generate_due_notification_events(now()),1,'due soon generated once'); -- 48
select is(public.generate_due_notification_events(now()),0,'due soon deduplicated'); -- 49
update public.condominium_notification_settings set timezone='Pacific/Kiritimati' where condominium_id='a2000000-0000-0000-0000-000000000001';
select lives_ok($$select public.generate_due_notification_events('2026-07-27 11:30:00+00')$$,'timezone-specific local date supported'); -- 50
select throws_ok($$insert into public.notification_events(condominium_id,event_type,aggregate_type,aggregate_id,unit_id,payload,deduplication_key) values ('a2000000-0000-0000-0000-000000000001','receivable_created','receivable','a7000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001','{"condominium_id":"a2000000-0000-0000-0000-000000000001"}','bad-unit')$$,null,'cross-condominium unit rejected'); -- 51
select throws_ok($$update public.notification_events set aggregate_id='a7000000-0000-0000-0000-000000000001' where id=(select id from public.notification_events where aggregate_id<>'a7000000-0000-0000-0000-000000000001' order by id limit 1)$$,'notification events are immutable','event identity immutable'); -- 52

insert into public.receivable_items(id,condominium_id,unit_id,concept_id,item_type,description,issue_date,due_date,currency_code,original_amount,created_by) values ('b7000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001','b5000000-0000-0000-0000-000000000001','charge','Other',current_date,current_date+1,'USD',10,'a0000000-0000-0000-0000-000000000011');
select throws_ok($$insert into public.notification_events(condominium_id,event_type,aggregate_type,aggregate_id,unit_id,payload,deduplication_key) values ('a2000000-0000-0000-0000-000000000001','receivable_created','receivable','b7000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','{"condominium_id":"a2000000-0000-0000-0000-000000000001"}','bad-aggregate')$$,'notification aggregate does not belong to condominium','aggregate from another condominium rejected'); -- 53
select throws_ok($$insert into public.notifications(condominium_id,recipient_user_id,event_id,notification_type,title,body) select 'b2000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000011',id,event_type,'x','x' from public.notification_events where condominium_id='a2000000-0000-0000-0000-000000000001' limit 1$$,null,'notification cannot reference event from another condominium'); -- 54
select throws_ok($$insert into public.notification_deliveries(condominium_id,event_id,recipient_user_id,recipient_email,channel,template_key,payload,deduplication_key) select 'b2000000-0000-0000-0000-000000000001',id,'a0000000-0000-0000-0000-000000000011','other@n.test','email','new_receivable','{}','cross-delivery' from public.notification_events where condominium_id='a2000000-0000-0000-0000-000000000001' limit 1$$,null,'delivery cannot reference event from another condominium'); -- 55
select throws_ok($$update public.notification_deliveries set recipient_user_id='a0000000-0000-0000-0000-000000000011' where id=(select id from public.notification_deliveries limit 1)$$,'notification deliveries are immutable','delivery recipient immutable'); -- 56
select throws_ok($$update public.notification_deliveries set template_key='payment_approved' where id=(select id from public.notification_deliveries limit 1)$$,'notification deliveries are immutable','delivery template immutable'); -- 57
select throws_ok($$update public.notification_deliveries set payload='{"changed":true}' where id=(select id from public.notification_deliveries limit 1)$$,'notification deliveries are immutable','delivery payload immutable'); -- 58

insert into public.notification_deliveries(condominium_id,event_id,recipient_user_id,recipient_email,channel,template_key,payload,status,deduplication_key) select condominium_id,id,'a0000000-0000-0000-0000-000000000006','owner@n.test','email','new_receivable','{"action_url":"/app/test"}','pending','ops-delivery' from public.notification_events where condominium_id='a2000000-0000-0000-0000-000000000001' limit 1;
select lives_ok($$select public.claim_notification_delivery((select id from public.notification_deliveries where deduplication_key='ops-delivery'),'test')$$,'internal claim updates operational fields'); -- 59
select lives_ok($$select public.finish_notification_delivery((select id from public.notification_deliveries where deduplication_key='ops-delivery'),'provider',null,false)$$,'internal finish updates operational fields'); -- 60
insert into public.notification_deliveries(condominium_id,event_id,recipient_user_id,recipient_email,channel,template_key,payload,status,attempts,claimed_at,deduplication_key) select condominium_id,id,'a0000000-0000-0000-0000-000000000007','tenant@n.test','email','new_receivable','{"action_url":"/app/test"}','processing',1,now()-interval '11 minutes','stale-delivery' from public.notification_events where condominium_id='a2000000-0000-0000-0000-000000000001' limit 1;
select ok((public.claim_notification_delivery((select id from public.notification_deliveries where deduplication_key='stale-delivery'),'test')).status='processing','processing stale is reclaimed'); -- 61
insert into public.notification_deliveries(condominium_id,event_id,recipient_user_id,recipient_email,channel,template_key,payload,status,attempts,claimed_at,deduplication_key) select condominium_id,id,'a0000000-0000-0000-0000-000000000008','occupant@n.test','email','new_receivable','{"action_url":"/app/test"}','processing',5,now()-interval '11 minutes','dead-stale' from public.notification_events where condominium_id='a2000000-0000-0000-0000-000000000001' limit 1;
select is((public.claim_notification_delivery((select id from public.notification_deliveries where deduplication_key='dead-stale'),'test')).id,null::uuid,'five-attempt stale delivery is not reclaimed'); -- 62
select is((select status from public.notification_deliveries where deduplication_key='dead-stale'),'dead'::public.notification_delivery_status,'five-attempt stale delivery becomes dead'); -- 63

insert into public.notification_events(condominium_id,event_type,aggregate_type,aggregate_id,unit_id,payload,deduplication_key,available_at) values ('a2000000-0000-0000-0000-000000000001','receivable_created','receivable','a7000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','{"condominium_id":"a2000000-0000-0000-0000-000000000001"}','retry-event',now()-interval '1 minute');
select ok(exists(select 1 from public.claim_notification_events(100) where id=(select id from public.notification_events where deduplication_key='retry-event')),'pending event can be claimed for retry'); -- 64
update public.notification_events set attempts=5,available_at=now()-interval '1 minute' where deduplication_key='retry-event';
select is((select count(*) from public.claim_notification_events(100) where id=(select id from public.notification_events where deduplication_key='retry-event')),0::bigint,'max-attempt event is not reclaimed'); -- 65
select is((select status from public.notification_events where deduplication_key='retry-event'),'failed'::public.notification_event_status,'max attempts marks event failed'); -- 66
select is((public.claim_notification_delivery((select id from public.notification_deliveries where deduplication_key='ops-delivery'),'test')).id,null::uuid,'sent delivery is never reclaimed'); -- 67
select is((public.claim_notification_delivery((select id from public.notification_deliveries where status='skipped' limit 1),'test')).id,null::uuid,'skipped delivery is never reclaimed'); -- 68

insert into public.receivable_items(id,condominium_id,unit_id,concept_id,item_type,description,issue_date,due_date,currency_code,original_amount,lifecycle_status,created_by) values
('a7000000-0000-0000-0000-000000000010','a2000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001','charge','Overdue',current_date-10,current_date-1,'USD',30,'active','a0000000-0000-0000-0000-000000000001'),
('a7000000-0000-0000-0000-000000000011','a2000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001','charge','Settled',current_date-10,current_date-1,'USD',30,'active','a0000000-0000-0000-0000-000000000001'),
('a7000000-0000-0000-0000-000000000012','a2000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001','charge','Reversed',current_date-10,current_date-1,'USD',30,'reversed','a0000000-0000-0000-0000-000000000001');
insert into public.receivable_ledger_entries(condominium_id,unit_id,receivable_item_id,entry_type,direction,amount,currency_code,effective_date,description,created_by) values
('a2000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000010','charge','debit',30,'USD',current_date-10,'Overdue','a0000000-0000-0000-0000-000000000001'),
('a2000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000011','charge','debit',30,'USD',current_date-10,'Settled','a0000000-0000-0000-0000-000000000001'),
('a2000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000011','opening_credit','credit',30,'USD',current_date-1,'Settled','a0000000-0000-0000-0000-000000000001'),
('a2000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000012','charge','debit',30,'USD',current_date-10,'Reversed','a0000000-0000-0000-0000-000000000001');
select is(public.generate_due_notification_events(now()),1,'only outstanding active overdue item generates'); -- 69
select is(public.generate_due_notification_events(now()),0,'overdue event generates only once'); -- 70
set local role authenticated; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.update_condominium_notification_settings('a2000000-0000-0000-0000-000000000001',true,true,4,true,'UTC')$$,'authorized administrator updates valid timezone'); -- 71
select throws_ok($$select public.update_condominium_notification_settings('a2000000-0000-0000-0000-000000000001',true,true,4,true,'Mars/Olympus')$$,'invalid timezone','invalid timezone is rejected'); -- 72
reset role;

select * from finish();
rollback;
