begin;
select plan(38);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
values
  ('00000000-0000-4000-8000-000000004361','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hab436-owner-a@test.local','x',now(),now()),
  ('00000000-0000-4000-8000-000000004362','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hab436-admin@test.local','x',now(),now()),
  ('00000000-0000-4000-8000-000000004363','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hab436-owner-b@test.local','x',now(),now());

insert into public.organizations(id,name,created_by,account_type) values
  ('43600000-0000-4000-8000-000000000001','HAB436 Customer A','00000000-0000-4000-8000-000000004361','customer'),
  ('43600000-0000-4000-8000-000000000002','HAB436 Customer B','00000000-0000-4000-8000-000000004363','customer');

insert into public.condominiums(id,organization_id,name,created_by) values
  ('43610000-0000-4000-8000-000000000001','43600000-0000-4000-8000-000000000001','HAB436 Condo A','00000000-0000-4000-8000-000000004361'),
  ('43610000-0000-4000-8000-000000000002','43600000-0000-4000-8000-000000000002','HAB436 Condo B','00000000-0000-4000-8000-000000004363');

insert into public.organization_memberships(organization_id,user_id,role) values
  ('43600000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000004361','organization_owner'),
  ('43600000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000004363','organization_owner');
insert into public.condominium_memberships(condominium_id,user_id,role)
values ('43610000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000004362','condominium_admin');

insert into public.subscriptions(
  id,condominium_id,status,commercial_status,trial_starts_at,trial_ends_at,current_period_end,
  billing_consent_at,billing_method_ready_at,auto_bill_enabled
) values
  ('43620000-0000-4000-8000-000000000001','43610000-0000-4000-8000-000000000001','trialing','confirmed',now() - interval '10 days',now() + interval '20 days',null,now(),null,false),
  ('43620000-0000-4000-8000-000000000002','43610000-0000-4000-8000-000000000002','trialing','not_yet_confirmed',now() - interval '10 days',now() + interval '20 days',null,null,null,false);

insert into public.subscription_terms(
  id,subscription_id,plan_code,contracted_period_amount,currency,billing_period,
  contracted_unit_limit,unlimited_units,origin,catalog_reference_amount,authorized_by,
  effective_from,effective_to,note
) values
  ('43630000-0000-4000-8000-000000000001','43620000-0000-4000-8000-000000000001','esencial',29.00,'USD','monthly',30,false,'catalog',29.00,'00000000-0000-4000-8000-000000004361',current_date - 30,null,'HAB-436 fixture A'),
  ('43630000-0000-4000-8000-000000000002','43620000-0000-4000-8000-000000000002','esencial',29.00,'USD','monthly',30,false,'catalog',29.00,'00000000-0000-4000-8000-000000004363',current_date - 30,null,'HAB-436 fixture B');

select ok(
  not has_function_privilege('authenticated','public.attach_billing_provider_setup_v1(uuid,text,text,text,timestamptz)','EXECUTE'),
  'authenticated clients cannot attach provider setup references'
);
select ok(
  not has_function_privilege('authenticated','public.apply_billing_provider_event_v1(text,text,text,uuid,text,text,text,text,numeric,text,timestamptz)','EXECUTE'),
  'authenticated clients cannot apply provider webhook events'
);
select ok(
  has_function_privilege('service_role','public.attach_billing_provider_setup_v1(uuid,text,text,text,timestamptz)','EXECUTE'),
  'service role may attach verified provider setup references'
);
select ok(
  has_function_privilege('service_role','public.apply_billing_provider_event_v1(text,text,text,uuid,text,text,text,text,numeric,text,timestamptz)','EXECUTE'),
  'service role may apply normalized verified provider events'
);
select ok(
  not has_table_privilege('authenticated','habitta_internal.billing_provider_events','SELECT'),
  'provider event storage is not readable by browser clients'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','',true);
select throws_ok(
  $$select public.begin_customer_billing_setup_v1('43610000-0000-4000-8000-000000000001','43690000-0000-4000-8000-000000000001')$$,
  '42501','authentication required',
  'billing setup requires authentication'
);

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000004362',true);
select throws_ok(
  $$select public.begin_customer_billing_setup_v1('43610000-0000-4000-8000-000000000001','43690000-0000-4000-8000-000000000002')$$,
  '42501','billing setup requires organization owner scope',
  'condominium admin cannot authorize payment-method setup'
);

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000004363',true);
select throws_ok(
  $$select public.begin_customer_billing_setup_v1('43610000-0000-4000-8000-000000000002','43690000-0000-4000-8000-000000000003')$$,
  '23514','explicit commercial consent is required before payment setup',
  'payment-method setup is impossible before HAB-435 consent'
);

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000004361',true);
select set_config(
  'hab436.attempt_id',
  public.begin_customer_billing_setup_v1(
    '43610000-0000-4000-8000-000000000001',
    '43690000-0000-4000-8000-000000000004'
  )->>'attempt_id',
  true
);
select ok(
  current_setting('hab436.attempt_id')::uuid is not null,
  'organization owner can create a provider-neutral setup attempt after consent'
);
select is(
  (public.begin_customer_billing_setup_v1(
    '43610000-0000-4000-8000-000000000001',
    '43690000-0000-4000-8000-000000000004'
  )->>'idempotent_replay')::boolean,
  true,
  'same setup request is idempotent'
);
select throws_ok(
  $$select public.begin_customer_billing_setup_v1('43610000-0000-4000-8000-000000000002','43690000-0000-4000-8000-000000000004')$$,
  '42501','billing setup requires organization owner scope',
  'idempotency key cannot be reused to cross tenant scope'
);

set local role postgres;
reset request.jwt.claim.sub;
select ok(
  (select billing_method_ready_at is null and not auto_bill_enabled from public.subscriptions where id='43620000-0000-4000-8000-000000000001'),
  'starting setup does not mark a payment method ready or enable automatic billing'
);
select ok(
  exists (
    select 1 from public.subscription_events
    where subscription_id='43620000-0000-4000-8000-000000000001'
      and event_type='billing_setup_requested'
  ),
  'customer setup intent is auditable'
);
select set_config('hab436.event_time', now()::text, true);

set local role service_role;
select lives_ok(
  format(
    $$select public.attach_billing_provider_setup_v1('%s','testpay','set_436_a','cus_436_a',now() + interval '1 hour')$$,
    current_setting('hab436.attempt_id')
  ),
  'server-side adapter may attach opaque provider setup references'
);
select is(
  (public.attach_billing_provider_setup_v1(
    current_setting('hab436.attempt_id')::uuid,
    'testpay','set_436_a','cus_436_a',now() + interval '2 hours'
  )->>'idempotent_replay')::boolean,
  true,
  'reattaching the exact provider setup state is idempotent even if expiry is refreshed'
);
select throws_ok(
  format(
    $$select public.attach_billing_provider_setup_v1('%s','testpay','set_436_changed','cus_436_a',now() + interval '1 hour')$$,
    current_setting('hab436.attempt_id')
  ),
  '23514','billing setup attempt already attached to different provider state',
  'attached setup cannot be silently rebound to another provider reference'
);

select is(
  (public.apply_billing_provider_event_v1(
    'testpay','evt_setup_ready_436','payment_method_ready',
    '43620000-0000-4000-8000-000000000001','set_436_a','cus_436_a','pm_436_a',null,null,null,
    current_setting('hab436.event_time')::timestamptz
  )->>'processing_status'),
  'applied',
  'verified payment-method-ready event is applied'
);

set local role postgres;
select ok(
  (select billing_method_ready_at is not null and auto_bill_enabled from public.subscriptions where id='43620000-0000-4000-8000-000000000001'),
  'payment method readiness enables automatic billing only after prior consent'
);
select is(
  (select status from habitta_internal.billing_setup_attempts where id=current_setting('hab436.attempt_id')::uuid),
  'ready',
  'provider-ready event closes the setup attempt'
);
select is(
  (select payment_method_ref from habitta_internal.saas_billing_accounts where subscription_id='43620000-0000-4000-8000-000000000001'),
  'pm_436_a',
  'Habitta stores only opaque provider payment-method reference'
);

set local role service_role;
select is(
  (public.apply_billing_provider_event_v1(
    'testpay','evt_setup_ready_436','payment_method_ready',
    '43620000-0000-4000-8000-000000000001','set_436_a','cus_436_a','pm_436_a',null,null,null,
    current_setting('hab436.event_time')::timestamptz
  )->>'idempotent_replay')::boolean,
  true,
  'duplicate provider event is idempotent'
);
select throws_ok(
  format(
    $$select public.apply_billing_provider_event_v1(
      'testpay','evt_setup_ready_436','payment_method_ready',
      '43620000-0000-4000-8000-000000000001','set_436_a','cus_436_a','pm_DIFFERENT',null,null,null,'%s'::timestamptz
    )$$,
    current_setting('hab436.event_time')
  ),
  '23514','provider event id reused with different normalized payload',
  'same provider event id with changed normalized payload is rejected'
);

select is(
  (public.apply_billing_provider_event_v1(
    'testpay','evt_wrong_amount_436','charge_succeeded',
    '43620000-0000-4000-8000-000000000001',null,'cus_436_a',null,'pay_wrong_436',28.00,'USD',
    current_setting('hab436.event_time')::timestamptz
  )->>'rejection_reason'),
  'commercial_amount_mismatch',
  'provider success with amount different from Habitta commercial terms is rejected'
);

set local role postgres;
select is(
  (select status::text from public.subscriptions where id='43620000-0000-4000-8000-000000000001'),
  'trialing',
  'rejected provider charge cannot change Habitta subscription status'
);
select is(
  (select processing_status from habitta_internal.billing_provider_events where provider_event_id='evt_wrong_amount_436'),
  'rejected',
  'commercial mismatch remains auditable as a rejected provider event'
);

set local role service_role;
select is(
  (public.apply_billing_provider_event_v1(
    'testpay','evt_charge_ok_436','charge_succeeded',
    '43620000-0000-4000-8000-000000000001',null,'cus_436_a',null,'pay_ok_436',29.00,'USD',
    current_setting('hab436.event_time')::timestamptz
  )->>'processing_status'),
  'applied',
  'matching authorized provider charge is applied'
);

set local role postgres;
select is(
  (select status::text from public.subscriptions where id='43620000-0000-4000-8000-000000000001'),
  'active',
  'successful SaaS charge activates Habitta commercial subscription state'
);
select ok(
  (select current_period_end > current_date from public.subscriptions where id='43620000-0000-4000-8000-000000000001'),
  'successful charge advances Habitta-owned commercial period'
);
select ok(
  exists (
    select 1 from public.subscription_events
    where subscription_id='43620000-0000-4000-8000-000000000001'
      and event_type='saas_billing_succeeded'
      and payload @> '{"provider":"testpay","amount":29.00,"currency":"USD"}'::jsonb
  ),
  'successful SaaS billing transition is auditable'
);
select is(
  (select count(*) from public.payments where condominium_id='43610000-0000-4000-8000-000000000001'),
  0::bigint,
  'SaaS billing success never manufactures a resident payment'
);
select is(
  (select count(*) from public.receivable_items where condominium_id='43610000-0000-4000-8000-000000000001'),
  0::bigint,
  'SaaS billing success never manufactures a condominium receivable'
);

set local role service_role;
select is(
  (public.apply_billing_provider_event_v1(
    'testpay','evt_charge_failed_436','charge_failed',
    '43620000-0000-4000-8000-000000000001',null,'cus_436_a',null,'pay_failed_436',29.00,'USD',
    current_setting('hab436.event_time')::timestamptz
  )->>'processing_status'),
  'applied',
  'matching provider charge failure is applied as commercial state only'
);

set local role postgres;
select is(
  (select status::text from public.subscriptions where id='43620000-0000-4000-8000-000000000001'),
  'past_due',
  'failed authorized SaaS charge moves commercial subscription to past_due'
);

set local role service_role;
select is(
  (public.apply_billing_provider_event_v1(
    'testpay','evt_method_removed_436','payment_method_removed',
    '43620000-0000-4000-8000-000000000001',null,'cus_436_a',null,null,null,null,
    current_setting('hab436.event_time')::timestamptz
  )->>'processing_status'),
  'applied',
  'verified payment method removal is applied'
);

set local role postgres;
select ok(
  (select billing_method_ready_at is null and not auto_bill_enabled from public.subscriptions where id='43620000-0000-4000-8000-000000000001'),
  'removing the provider payment method immediately disables automatic billing'
);
select is(
  (select payment_method_ref from habitta_internal.saas_billing_accounts where subscription_id='43620000-0000-4000-8000-000000000001'),
  null,
  'removed provider method clears only the opaque method reference'
);
select is(
  (select count(*) from public.payments where condominium_id='43610000-0000-4000-8000-000000000001'),
  0::bigint,
  'entire provider lifecycle remains isolated from resident payment records'
);
select is(
  (select count(*) from public.receivable_items where condominium_id='43610000-0000-4000-8000-000000000001'),
  0::bigint,
  'entire provider lifecycle remains isolated from resident receivables'
);

select * from finish();
rollback;
