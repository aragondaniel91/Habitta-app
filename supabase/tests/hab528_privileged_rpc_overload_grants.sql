begin;
select plan(3);

-- HAB-528 regression: no anonymous direct or PUBLIC execution for the
-- privileged write-path RPCs already declared internal in HAB-SEC-001.
-- Check effective grants across overloads; don't trust signature-specific
-- REVOKEs to protect newly introduced overloads.
select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname in (
       'set_condominium_charge_scope',
       'approve_payment',
       'insert_receivable_item_and_entry',
       'claim_notification_events',
       'claim_due_notification_deliveries',
       'publish_due_announcements',
       'claim_due_integration_outbox'
     )
     and has_function_privilege('anon',p.oid,'EXECUTE')),
  0::bigint,
  'anon has no effective EXECUTE on sensitive RPC names, including overloads'
);

select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname in (
       'claim_notification_events',
       'claim_due_notification_deliveries',
       'publish_due_announcements',
       'claim_due_integration_outbox'
     )
     and has_function_privilege('authenticated',p.oid,'EXECUTE')),
  0::bigint,
  'authenticated cannot invoke internal job and queue processors'
);

select ok(
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname in ('set_condominium_charge_scope','approve_payment',
                        'insert_receivable_item_and_entry',
                        'claim_notification_events')) >= 4,
  'critical RPCs are present; permissions audit is not vacuous'
);

select * from finish();
rollback;
