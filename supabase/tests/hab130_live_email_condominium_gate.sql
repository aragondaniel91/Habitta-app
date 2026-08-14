begin;
select plan(18);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
('13000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hab130-admin@test.local','x',now(),now()),
('13000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hab130-accountant@test.local','x',now(),now()),
('13000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hab130-recipient@test.local','x',now(),now());

insert into public.organizations(id,name,created_by)
values ('13100000-0000-0000-0000-000000000001','HAB-130 Organization','13000000-0000-0000-0000-000000000001');

insert into public.condominiums(id,organization_id,name,created_by)
values ('13200000-0000-0000-0000-000000000001','13100000-0000-0000-0000-000000000001','HAB-130 Condominium','13000000-0000-0000-0000-000000000001');

insert into public.condominium_memberships(condominium_id,user_id,role) values
('13200000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000001','condominium_admin'),
('13200000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000002','accountant');

insert into public.units(id,condominium_id,code,type,created_by)
values ('13300000-0000-0000-0000-000000000001','13200000-0000-0000-0000-000000000001','A-130','apartment','13000000-0000-0000-0000-000000000001');

insert into public.charge_concepts(id,condominium_id,code,name,category,created_by)
values ('13400000-0000-0000-0000-000000000001','13200000-0000-0000-0000-000000000001','H130','HAB-130 fee','regular_dues','13000000-0000-0000-0000-000000000001');

insert into public.receivable_items(
  id,condominium_id,unit_id,concept_id,item_type,description,issue_date,due_date,
  currency_code,original_amount,created_by
) values (
  '13500000-0000-0000-0000-000000000001','13200000-0000-0000-0000-000000000001',
  '13300000-0000-0000-0000-000000000001','13400000-0000-0000-0000-000000000001',
  'charge','HAB-130 test charge',current_date,current_date+7,'USD',10,
  '13000000-0000-0000-0000-000000000001'
);

select has_column('public','condominium_notification_settings','live_email_enabled','live email gate column exists'); -- 1
select is(
  (select live_email_enabled from public.condominium_notification_settings where condominium_id='13200000-0000-0000-0000-000000000001'),
  false,
  'new condominium starts with live email disabled'
); -- 2
select ok(
  not has_function_privilege('authenticated','public.set_condominium_live_email_enabled(uuid,boolean,text,uuid)','EXECUTE'),
  'authenticated clients cannot activate live email directly'
); -- 3
select ok(
  has_function_privilege('service_role','public.set_condominium_live_email_enabled(uuid,boolean,text,uuid)','EXECUTE'),
  'service role owns the activation boundary'
); -- 4

insert into public.notification_deliveries(
  condominium_id,event_id,recipient_user_id,recipient_email,channel,template_key,payload,status,deduplication_key
)
select condominium_id,id,'13000000-0000-0000-0000-000000000003','hab130-recipient@test.local','email',
  'new_receivable','{}','pending','hab130-before-activation'
from public.notification_events where aggregate_id='13500000-0000-0000-0000-000000000001' limit 1;

select is(
  (select status from public.notification_deliveries where deduplication_key='hab130-before-activation'),
  'skipped'::public.notification_delivery_status,
  'unactivated condominium cannot create a pending email delivery'
); -- 5
select is(
  (select last_error_code from public.notification_deliveries where deduplication_key='hab130-before-activation'),
  'live_email_not_activated',
  'fail-closed delivery records a stable safety reason'
); -- 6
select is(
  (public.claim_notification_delivery(
    (select id from public.notification_deliveries where deduplication_key='hab130-before-activation'),
    'cloudflare-queue'
  )).id,
  null::uuid,
  'unactivated delivery cannot be claimed'
); -- 7
select is(
  public.should_send_notification_delivery(
    (select id from public.notification_deliveries where deduplication_key='hab130-before-activation')
  ),
  false,
  'delivery-time guard also fails closed'
); -- 8

select throws_ok(
  $$select public.set_condominium_live_email_enabled(
    '13200000-0000-0000-0000-000000000001',true,'Accountant cannot activate','13000000-0000-0000-0000-000000000002'
  )$$,
  'permission denied',
  'accountant cannot activate live email'
); -- 9
select throws_ok(
  $$select public.set_condominium_live_email_enabled(
    '13200000-0000-0000-0000-000000000001',true,'short','13000000-0000-0000-0000-000000000001'
  )$$,
  'activation reason required',
  'activation requires an auditable reason'
); -- 10
select lives_ok(
  $$select public.set_condominium_live_email_enabled(
    '13200000-0000-0000-0000-000000000001',true,'Enable verified production residents','13000000-0000-0000-0000-000000000001'
  )$$,
  'condominium admin can explicitly activate live email'
); -- 11
select is(
  (select live_email_enabled from public.condominium_notification_settings where condominium_id='13200000-0000-0000-0000-000000000001'),
  true,
  'activation flips only the explicit live email gate'
); -- 12
select is(
  (select count(*) from public.notification_live_email_audit where condominium_id='13200000-0000-0000-0000-000000000001' and enabled),
  1::bigint,
  'activation is audited'
); -- 13

insert into public.notification_deliveries(
  condominium_id,event_id,recipient_user_id,recipient_email,channel,template_key,payload,status,deduplication_key
)
select condominium_id,id,'13000000-0000-0000-0000-000000000003','hab130-recipient@test.local','email',
  'new_receivable','{}','pending','hab130-after-activation'
from public.notification_events where aggregate_id='13500000-0000-0000-0000-000000000001' limit 1;

-- HAB-130 tests the explicit live-email gate, not HAB-150's bulk-send timing policy.
-- Make this fixture due now so the claim assertions remain focused on the gate boundary.
update public.notification_deliveries
set next_attempt_at = now() - interval '1 minute'
where deduplication_key = 'hab130-after-activation';

select is(
  (select status from public.notification_deliveries where deduplication_key='hab130-after-activation'),
  'pending'::public.notification_delivery_status,
  'activated condominium may create a pending email delivery'
); -- 14
select ok(
  exists(
    select 1 from public.claim_due_notification_deliveries(100)
    where id=(select id from public.notification_deliveries where deduplication_key='hab130-after-activation')
  ),
  'activated pending delivery can be queued'
); -- 15
select ok(
  (public.claim_notification_delivery(
    (select id from public.notification_deliveries where deduplication_key='hab130-after-activation'),
    'cloudflare-queue'
  )).status='processing',
  'activated queued delivery can be claimed'
); -- 16

select lives_ok(
  $$select public.set_condominium_live_email_enabled(
    '13200000-0000-0000-0000-000000000001',false,'Disable live email after verification','13000000-0000-0000-0000-000000000001'
  )$$,
  'administrator can deactivate live email'
); -- 17
select ok(
  (select status='skipped' and last_error_code='live_email_not_activated'
     from public.notification_deliveries where deduplication_key='hab130-after-activation')
  and (select count(*)=2 from public.notification_live_email_audit where condominium_id='13200000-0000-0000-0000-000000000001'),
  'deactivation neutralizes active deliveries and records another audit entry'
); -- 18

select * from finish();
rollback;
