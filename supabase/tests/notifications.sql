begin;
select plan(13);

select has_table('public','notification_events','outbox exists');
select has_table('public','notifications','in-app notifications exist');
select has_table('public','notification_deliveries','email deliveries exist');
select has_table('public','notification_preferences','preferences exist');
select has_table('public','condominium_notification_settings','settings exist');
select has_function('public','emit_notification_event','financial event emitter exists');
select has_function('public','expand_notification_event','recipient expansion exists');
select has_function('public','generate_due_notification_events','due event generator exists');
select has_function('public','get_my_notifications','safe inbox RPC exists');
select has_function('public','mark_notification_read','safe mark-read RPC exists');
select has_function('public','update_my_notification_preferences','preferences RPC exists');
select has_function('public','claim_notification_delivery','queue claiming RPC exists');
select has_function('public','finish_notification_delivery','retry completion RPC exists');

select * from finish();
rollback;
