begin;
select plan(6);

-- HAB-SEC-001. An anonymous caller reached nine internal functions because five migrations
-- revoked from `public, authenticated` and never from `anon`, which holds its own direct grant.

select is(
  (select count(*) from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and has_function_privilege('anon', p.oid, 'EXECUTE')
     and not has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  0::bigint,
  'no function is reachable by anon while being denied to authenticated'
);

-- The pipeline the Worker drives as service_role must be closed to both client roles.
select is(
  (select count(*) from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('claim_notification_events','claim_due_notification_deliveries',
       'process_notification_event','finish_notification_delivery','skip_notification_delivery',
       'should_send_notification_delivery','emit_notification_event','expand_notification_event',
       'generate_due_notification_events','generate_governance_due_notification_events',
       'publish_due_announcements','finalize_announcement_publication',
       'claim_due_integration_outbox','mark_integration_outbox_queued',
       'complete_integration_outbox_event')
     and (has_function_privilege('anon', p.oid, 'EXECUTE')
       or has_function_privilege('authenticated', p.oid, 'EXECUTE'))),
  0::bigint,
  'the notification and integration pipeline is closed to anon and authenticated'
);

-- ...and must still work for the role that actually runs it.
select ok(
  (select bool_and(has_function_privilege('service_role', p.oid, 'EXECUTE'))
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('claim_notification_events','process_notification_event',
       'publish_due_announcements','skip_notification_delivery')),
  'the scheduled and queue handlers keep their service_role grant'
);

-- The ledger writer was the same gap reaching money. It was blocked only by a NOT NULL on
-- created_by, which is defence by accident.
select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'insert_receivable_item_and_entry'
     and has_function_privilege('anon', p.oid, 'EXECUTE')),
  0::bigint,
  'the low-level ledger writer is not reachable by an anonymous caller'
);

-- The original exploit, driven end to end.
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
('5ec00000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sec001@test.local','x',now(),now());
insert into public.organizations(id,name,created_by) values
('5ec10000-0000-4000-8000-000000000001','SEC001 Org','5ec00000-0000-0000-0000-000000000001');
insert into public.condominiums(id,organization_id,name,created_by) values
('5ec20000-0000-4000-8000-000000000001','5ec10000-0000-4000-8000-000000000001','SEC001 Condo','5ec00000-0000-0000-0000-000000000001');

set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','anon',true);

select throws_ok(
  $$select public.claim_notification_events(50)$$,
  '42501',
  'permission denied for function claim_notification_events',
  'an anonymous caller can no longer drain the notification queue'
);
select throws_ok(
  $$select public.publish_due_announcements(now())$$,
  '42501',
  'permission denied for function publish_due_announcements',
  'nor publish announcements that were scheduled for later'
);

select * from finish();
rollback;
