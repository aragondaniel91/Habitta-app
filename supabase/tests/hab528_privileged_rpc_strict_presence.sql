begin;
select plan(3);

-- Every required sensitive RPC name must remain present. Counting distinct
-- names rather than matching a minimum function count prevents an overload
-- of one RPC from concealing a removed or renamed sibling.
select is(
  (select count(distinct p.proname) from pg_proc p
   join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in (
     'set_condominium_charge_scope','approve_payment',
     'insert_receivable_item_and_entry','claim_notification_events',
     'claim_due_notification_deliveries','publish_due_announcements',
     'claim_due_integration_outbox')),
  7::bigint,
  'all seven reviewed sensitive RPC names remain present'
);

select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='insert_receivable_item_and_entry'
   and has_function_privilege('authenticated',p.oid,'EXECUTE')),
  0::bigint,
  'signed-in clients cannot call the internal receivable ledger writer, including overloads'
);

select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in (
     'set_condominium_charge_scope','approve_payment',
     'insert_receivable_item_and_entry','claim_notification_events',
     'claim_due_notification_deliveries','publish_due_announcements',
     'claim_due_integration_outbox')
   and has_function_privilege('anon',p.oid,'EXECUTE')),
  0::bigint,
  'all sensitive RPC overloads continue to deny anonymous EXECUTE'
);

select * from finish();
rollback;
