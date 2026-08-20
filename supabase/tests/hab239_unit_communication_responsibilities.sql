begin;
select plan(30);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
('23900000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin@239.test','x',now(),now()),
('23900000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner@239.test','x',now(),now()),
('23900000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','tenant@239.test','x',now(),now()),
('23900000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','occupant@239.test','x',now(),now()),
('23900000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','other@239.test','x',now(),now());
insert into public.organizations(id,name,created_by) values
('23910000-0000-0000-0000-000000000001','HAB239 A','23900000-0000-0000-0000-000000000001'),
('23910000-0000-0000-0000-000000000002','HAB239 B','23900000-0000-0000-0000-000000000005');
insert into public.condominiums(id,organization_id,name,created_by) values
('23920000-0000-0000-0000-000000000001','23910000-0000-0000-0000-000000000001','HAB239 A','23900000-0000-0000-0000-000000000001'),
('23920000-0000-0000-0000-000000000002','23910000-0000-0000-0000-000000000002','HAB239 B','23900000-0000-0000-0000-000000000005');
update public.condominium_notification_settings set timezone='America/Caracas' where condominium_id='23920000-0000-0000-0000-000000000001';
insert into public.condominium_memberships(condominium_id,user_id,role) values
('23920000-0000-0000-0000-000000000001','23900000-0000-0000-0000-000000000001','condominium_admin'),
('23920000-0000-0000-0000-000000000001','23900000-0000-0000-0000-000000000005','board_member');
insert into public.units(id,condominium_id,code,type,created_by) values
('23930000-0000-0000-0000-000000000001','23920000-0000-0000-0000-000000000001','A-1','apartment','23900000-0000-0000-0000-000000000001'),
('23930000-0000-0000-0000-000000000002','23920000-0000-0000-0000-000000000001','A-2','apartment','23900000-0000-0000-0000-000000000001'),
('23930000-0000-0000-0000-000000000003','23920000-0000-0000-0000-000000000002','B-1','apartment','23900000-0000-0000-0000-000000000005');
insert into public.people(id,condominium_id,auth_user_id,first_name,last_name,email,status,created_by) values
('23940000-0000-0000-0000-000000000002','23920000-0000-0000-0000-000000000001','23900000-0000-0000-0000-000000000002','A','Owner','owner@239.test','active','23900000-0000-0000-0000-000000000001'),
('23940000-0000-0000-0000-000000000003','23920000-0000-0000-0000-000000000001','23900000-0000-0000-0000-000000000003','B','Tenant','tenant@239.test','active','23900000-0000-0000-0000-000000000001'),
('23940000-0000-0000-0000-000000000004','23920000-0000-0000-0000-000000000001','23900000-0000-0000-0000-000000000004','C','Occupant',null,'active','23900000-0000-0000-0000-000000000001'),
('23940000-0000-0000-0000-000000000005','23920000-0000-0000-0000-000000000002','23900000-0000-0000-0000-000000000005','Other','Condo',null,'active','23900000-0000-0000-0000-000000000005'),
('23940000-0000-0000-0000-000000000006','23920000-0000-0000-0000-000000000001',null,'Bill','Unlinked','billing@example.com','active','23900000-0000-0000-0000-000000000001'),
('23940000-0000-0000-0000-000000000007','23920000-0000-0000-0000-000000000001',null,'Inactive','Person',null,'inactive','23900000-0000-0000-0000-000000000001');
insert into public.unit_owners(unit_id,person_id,starts_at,ends_at,created_by) values ('23930000-0000-0000-0000-000000000001','23940000-0000-0000-0000-000000000002','2026-08-20',null,'23900000-0000-0000-0000-000000000001');
insert into public.unit_occupancies(unit_id,person_id,occupancy_type,starts_at,created_by) values
('23930000-0000-0000-0000-000000000001','23940000-0000-0000-0000-000000000003','tenant','2026-08-20','23900000-0000-0000-0000-000000000001'),
('23930000-0000-0000-0000-000000000001','23940000-0000-0000-0000-000000000004','authorized_occupant','2026-08-21','23900000-0000-0000-0000-000000000001');
insert into public.charge_concepts(id,condominium_id,code,name,category,created_by) values ('23950000-0000-0000-0000-000000000001','23920000-0000-0000-0000-000000000001','FEE239','HAB-239','regular_dues','23900000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub','23900000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.set_unit_communication_assignment('23920000-0000-0000-0000-000000000001','23930000-0000-0000-0000-000000000001','23940000-0000-0000-0000-000000000002','primary',true)$$,'administrator creates a primary recipient');
select lives_ok($$select public.set_unit_communication_assignment('23920000-0000-0000-0000-000000000001','23930000-0000-0000-0000-000000000001','23940000-0000-0000-0000-000000000003','additional',false)$$,'administrator adds an additional recipient after primary');
select throws_ok($$select public.set_unit_communication_assignment('23920000-0000-0000-0000-000000000001','23930000-0000-0000-0000-000000000002','23940000-0000-0000-0000-000000000003','additional',false)$$,'P0001','financial_primary_required','additional without a primary fails closed');
select is((select count(*) from public.unit_communication_assignments where unit_id='23930000-0000-0000-0000-000000000001' and effective_to is null and financial_role='primary'),1::bigint,'never more than one primary is active');
select lives_ok($$select public.set_unit_communication_assignment('23920000-0000-0000-0000-000000000001','23930000-0000-0000-0000-000000000001','23940000-0000-0000-0000-000000000003','primary',false)$$,'B can replace A as primary');
select is((select financial_role::text from public.unit_communication_assignments where person_id='23940000-0000-0000-0000-000000000003' and effective_to is null),'primary','B is the active primary after replacement');
select ok((select financial_role='additional' and general_recipient from public.unit_communication_assignments where person_id='23940000-0000-0000-0000-000000000002' and effective_to is null),'A becomes additional and preserves general communications');
select is((select count(*) from public.unit_communication_assignments where person_id in ('23940000-0000-0000-0000-000000000002','23940000-0000-0000-0000-000000000003') and effective_to is not null),2::bigint,'primary replacement closes both prior snapshots');
select lives_ok($$select public.set_unit_communication_assignment('23920000-0000-0000-0000-000000000001','23930000-0000-0000-0000-000000000001','23940000-0000-0000-0000-000000000006','none',true)$$,'general-only communication assignment is allowed');
select is((select financial_role::text from public.unit_communication_assignments where person_id='23940000-0000-0000-0000-000000000006' and effective_to is null),null,'general-only assignment has no financial role');
select throws_ok($$select public.set_unit_communication_assignment('23920000-0000-0000-0000-000000000001','23930000-0000-0000-0000-000000000001','23940000-0000-0000-0000-000000000005','primary',false)$$,'P0001','communication_assignment_not_found','cross-condominium person fails closed');
select throws_ok($$select public.set_unit_communication_assignment('23920000-0000-0000-0000-000000000001','23930000-0000-0000-0000-000000000001','23940000-0000-0000-0000-000000000007','primary',false)$$,'P0001','communication_assignment_person_inactive','inactive person cannot receive an active assignment');
select is((select array_agg(person_id order by person_id)::text from public.resolve_unit_financial_recipients('23920000-0000-0000-0000-000000000001','23930000-0000-0000-0000-000000000001','2026-08-21 02:30:00+00')),'{23940000-0000-0000-0000-000000000002,23940000-0000-0000-0000-000000000003}','financial event resolves only primary and additional, never unrelated or general-only');

select lives_ok($$select public.create_receivable_item('23920000-0000-0000-0000-000000000001','23930000-0000-0000-0000-000000000001','23950000-0000-0000-0000-000000000001','Explicit recipients',1,'USD','2026-08-20','2026-08-21')$$,'explicit receivable event is created');
reset role;
select lives_ok($$select public.expand_notification_event(id) from public.notification_events where condominium_id='23920000-0000-0000-0000-000000000001' and event_type='receivable_created' order by created_at desc limit 1$$,'explicit receivable event expands');
select ok(exists(select 1 from public.notifications n join public.notification_events e on e.id=n.event_id where e.condominium_id='23920000-0000-0000-0000-000000000001' and e.event_type='receivable_created' and n.recipient_user_id='23900000-0000-0000-0000-000000000002'),'primary receives the explicit receivable notification');
select ok(exists(select 1 from public.notifications n join public.notification_events e on e.id=n.event_id where e.condominium_id='23920000-0000-0000-0000-000000000001' and e.event_type='receivable_created' and n.recipient_user_id='23900000-0000-0000-0000-000000000003'),'additional receives the explicit receivable notification');
select is((select count(*) from public.notifications n join public.notification_events e on e.id=n.event_id where e.condominium_id='23920000-0000-0000-0000-000000000001' and e.event_type='receivable_created' and n.recipient_user_id='23900000-0000-0000-0000-000000000004'),0::bigint,'unrelated authorized occupant does not receive explicit financial event');

set local role authenticated;
select set_config('request.jwt.claim.sub','23900000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.set_unit_communication_assignment('23920000-0000-0000-0000-000000000001','23930000-0000-0000-0000-000000000001','23940000-0000-0000-0000-000000000002','none',false)$$,'additional assignment can be ended without deleting history');
select lives_ok($$select public.set_unit_communication_assignment('23920000-0000-0000-0000-000000000001','23930000-0000-0000-0000-000000000001','23940000-0000-0000-0000-000000000003','none',false)$$,'last financial assignment can be ended and fallback is restored');
reset role;
select is((select array_agg(person_id order by person_id)::text from public.resolve_unit_financial_recipients('23920000-0000-0000-0000-000000000001','23930000-0000-0000-0000-000000000001','2026-08-21 02:30:00+00')),'{23940000-0000-0000-0000-000000000002,23940000-0000-0000-0000-000000000003}','general-only never enables explicit-financial mode and Caracas local date excludes the next-day occupant');
select is((select count(*) from public.unit_communication_assignments where unit_id='23930000-0000-0000-0000-000000000001' and effective_to is null and financial_role is not null),0::bigint,'only historical financial assignments remain after operational removal');
select ok(position('delete from public.unit_communication_assignments' in lower(pg_get_functiondef('public.set_unit_communication_assignment(uuid,uuid,uuid,text,boolean)'::regprocedure)))=0,'assignment history is never deleted by the setter');

set local role authenticated;
select set_config('request.jwt.claim.sub','23900000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.set_unit_communication_assignment('23920000-0000-0000-0000-000000000001','23930000-0000-0000-0000-000000000001','23940000-0000-0000-0000-000000000006','primary',true)$$,'unlinked person can become explicit primary');
select lives_ok($$select public.create_receivable_item('23920000-0000-0000-0000-000000000001','23930000-0000-0000-0000-000000000001','23950000-0000-0000-0000-000000000001','Unlinked primary',1,'USD','2026-08-20','2026-08-21')$$,'unlinked-primary event is created');
reset role;
select lives_ok($$select public.expand_notification_event(id) from public.notification_events where condominium_id='23920000-0000-0000-0000-000000000001' and event_type='receivable_created' order by created_at desc limit 1$$,'unlinked-primary event expands');
select is((select count(*) from public.notifications n join public.notification_events e on e.id=n.event_id where e.condominium_id='23920000-0000-0000-0000-000000000001' and e.event_type='receivable_created' and n.recipient_user_id is null),0::bigint,'unlinked person never receives an in-app notification');
select ok(exists(select 1 from public.notification_deliveries d join public.notification_events e on e.id=d.event_id where e.condominium_id='23920000-0000-0000-0000-000000000001' and e.event_type='receivable_created' and d.recipient_user_id is null and d.recipient_email='billing@example.com' and d.status='skipped'),'unlinked explicit person receives a fail-closed email delivery record');

set local role authenticated;
select set_config('request.jwt.claim.sub','23900000-0000-0000-0000-000000000005',true);
select throws_ok($$select public.set_unit_communication_assignment('23920000-0000-0000-0000-000000000001','23930000-0000-0000-0000-000000000001','23940000-0000-0000-0000-000000000006','primary',false)$$,null,null,'unauthorized user cannot manage communication responsibilities');
reset role;
select throws_ok($$insert into public.unit_communication_assignments(condominium_id,unit_id,person_id,financial_role,created_by) values('23920000-0000-0000-0000-000000000001','23930000-0000-0000-0000-000000000001','23940000-0000-0000-0000-000000000006','additional','23900000-0000-0000-0000-000000000001')$$,'23505',null,'partial unique index prevents more than one active assignment per unit and person');

select * from finish();
rollback;
