begin;
select plan(14);

-- Runtime coverage for the request/order RPC contract.  Each fixture is rolled back and the
-- legacy visual-review rows are observed only, never renamed, updated, or deleted.
create temporary table preserved_legacy_orders as
select id, work_order_number, status, version, title, description, scheduled_for, due_on
from public.maintenance_work_orders
where work_order_number in ('WO-2026-000005', 'WO-2026-000006');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at) values
  ('81000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','request-order-admin@test.local','x','{}',now(),now()),
  ('81000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','request-order-assistant@test.local','x','{}',now(),now()),
  ('81000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','request-order-resident@test.local','x','{}',now(),now()),
  ('81000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','request-order-other-admin@test.local','x','{}',now(),now());

set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000001',true);
create temporary table request_order_a as select public.create_admin_workspace('Request order A','independent','Request order A','VE','Caracas','America/Caracas','USD','VES',2,'A') payload;
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000004',true);
create temporary table request_order_b as select public.create_admin_workspace('Request order B','independent','Request order B','VE','Valencia','America/Caracas','USD','VES',2,'B') payload;
reset role;
insert into public.condominium_memberships (condominium_id,user_id,role) values
 ((select (payload #>> '{condominium,id}')::uuid from request_order_a),'81000000-0000-0000-0000-000000000002','assistant'),
 ((select (payload #>> '{condominium,id}')::uuid from request_order_a),'81000000-0000-0000-0000-000000000003','owner');

set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000001',true);
create temporary table request_order_request as select public.create_service_request(
 (select (payload #>> '{condominium,id}')::uuid from request_order_a),null,
 (select id from public.service_request_categories where condominium_id=(select (payload #>> '{condominium,id}')::uuid from request_order_a) and is_active order by sort_order limit 1),
 'Fuga de bomba','La bomba requiere una intervención de mantenimiento documentada.','high',null) request;
create temporary table request_order_first as select public.create_maintenance_work_order(
 (select (payload #>> '{condominium,id}')::uuid from request_order_a),null,(select (request).id from request_order_request),null,null,'corrective','high','Reparar bomba','Diagnosticar y reparar la fuga documentando el servicio.',null,null,'82000000-0000-0000-0000-000000000001',null) work_order;
create temporary table request_order_retry as select public.create_maintenance_work_order(
 (select (payload #>> '{condominium,id}')::uuid from request_order_a),null,(select (request).id from request_order_request),null,null,'corrective','high','Reparar bomba','Diagnosticar y reparar la fuga documentando el servicio.',null,null,'82000000-0000-0000-0000-000000000001',null) work_order;
select is((select (work_order).id from request_order_retry),(select (work_order).id from request_order_first),'same idempotency key returns the original order');
select is((select count(*) from public.maintenance_work_orders where request_id=(select (request).id from request_order_request)),1::bigint,'duplicate click creates one linked order');
select throws_like(format('select public.create_maintenance_work_order(%L::uuid,null,%L::uuid,null,null,%L,%L,%L,%L,null,null,null,null)',(select payload #>> '{condominium,id}' from request_order_a),(select (request).id::text from request_order_request),'corrective','high','Sin llave','Descripción válida'),'%idempotency key required%','linked request order requires an idempotency key');

select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000002',true);
select lives_ok(format('select public.create_maintenance_work_order(%L::uuid,null,%L::uuid,null,null,%L,%L,%L,%L,null,null,%L::uuid,%L)',(select payload #>> '{condominium,id}' from request_order_a),(select (request).id::text from request_order_request),'inspection','normal','Inspección adicional','La asistente documenta una intervención diferente.','82000000-0000-0000-0000-000000000002','Válvula auxiliar'),'assistant can create a distinct scoped follow-up');
select is((select count(*) from public.maintenance_work_orders where request_id=(select (request).id from request_order_request)),2::bigint,'distinct additional scope remains a legitimate second order');
create temporary table request_order_edited as select public.update_maintenance_work_order(
 (select (payload #>> '{condominium,id}')::uuid from request_order_a),(select (work_order).id from request_order_first),null,(select (request).id from request_order_request),null,null,'corrective','urgent','Reparar bomba','Diagnóstico confirmado y reparación programada para la bomba principal.','2026-10-20 15:30:00+00','2026-10-21',1) work_order;
select is((select (work_order).version from request_order_edited),2,'assistant draft update persists with optimistic version');
select throws_like(format('select public.update_maintenance_work_order(%L::uuid,%L::uuid,null,%L::uuid,null,null,%L,%L,%L,%L,%L::timestamptz,%L::date,1)',(select payload #>> '{condominium,id}' from request_order_a),(select (work_order).id::text from request_order_first),(select (request).id::text from request_order_request),'corrective','urgent','Reparar bomba','Diagnóstico confirmado y reparación programada para la bomba principal.','2026-10-20 15:30:00+00','2026-10-21'),'%version conflict%','stale update is rejected');
create temporary table request_order_scheduled as select public.transition_maintenance_work_order((select (payload #>> '{condominium,id}')::uuid from request_order_a),(select (work_order).id from request_order_first),'scheduled',null,2) work_order;
select is((select (work_order).status::text from request_order_scheduled),'scheduled','dated draft schedules through lifecycle RPC');
select throws_like(format('select public.transition_maintenance_work_order(%L::uuid,%L::uuid,%L::public.maintenance_work_order_status,%L,1)',(select payload #>> '{condominium,id}' from request_order_a),(select (work_order).id::text from request_order_retry),'cancelled','no'),'%version conflict%','transition retains optimistic guard');
 create temporary table request_order_cancelled as select public.transition_maintenance_work_order((select (payload #>> '{condominium,id}')::uuid from request_order_a),(select (work_order).id from request_order_retry),'cancelled','Duplicada por la intervención principal.',3) work_order;
select is((select (work_order).status::text from request_order_cancelled),'cancelled','draft cancellation persists through lifecycle RPC with a valid reason');

select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000003',true);
select throws_like(format('select public.create_maintenance_work_order(%L::uuid,null,%L::uuid,null,null,%L,%L,%L,%L,null,null,%L::uuid,null)',(select payload #>> '{condominium,id}' from request_order_a),(select (request).id::text from request_order_request),'corrective','high','Intento residente','El residente no administra órdenes de mantenimiento.','82000000-0000-0000-0000-000000000003'),'%maintenance management denied%','resident role is forbidden');
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000004',true);
select throws_like(format('select public.create_maintenance_work_order(%L::uuid,null,%L::uuid,null,null,%L,%L,%L,%L,null,null,%L::uuid,null)',(select payload #>> '{condominium,id}' from request_order_a),(select (request).id::text from request_order_request),'corrective','high','Intento cruzado','Otro administrador no puede crear en este condominio.','82000000-0000-0000-0000-000000000004'),'%maintenance management denied%','cross-condominium administrator is forbidden');

-- Reset to an authorized tenant-A observer before counting: do not let an unauthorized role make RLS checks vacuous.
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000001',true);
select is((select count(*) from public.maintenance_work_orders where condominium_id=(select (payload #>> '{condominium,id}')::uuid from request_order_a)),2::bigint,'authorized tenant observer sees exactly its two fixtures');
reset role;
select is((select count(*) from public.maintenance_work_orders current join preserved_legacy_orders saved using (id) where (current.work_order_number,current.status,current.version,current.title,current.description,current.scheduled_for,current.due_on) is distinct from (saved.work_order_number,saved.status,saved.version,saved.title,saved.description,saved.scheduled_for,saved.due_on)),0::bigint,'legacy WO-2026-000005/000006 fixtures remain untouched when present');
select * from finish();
rollback;
