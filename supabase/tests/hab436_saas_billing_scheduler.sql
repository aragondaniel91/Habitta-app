begin;
select plan(21);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
values ('00000000-0000-4000-8000-000000004368','00000000-0000-4000-8000-000000000000','authenticated','authenticated','hab436-biller@test.local','x',now(),now());

insert into public.organizations(id,name,created_by,account_type)
values ('43600000-0000-4000-8000-000000000008','HAB436 Billing Scheduler','00000000-0000-4000-8000-000000004368','customer');
insert into public.condominiums(id,organization_id,name,created_by) values
  ('43610000-0000-4000-8000-000000000008','43600000-0000-4000-8000-000000000008','HAB436 Paid Due','00000000-0000-4000-8000-000000004368'),
  ('43610000-0000-4000-8000-000000000007','43600000-0000-4000-8000-000000000008','HAB436 Zero Due','00000000-0000-4000-8000-000000004368');

insert into public.subscriptions(
  id,condominium_id,status,commercial_status,trial_starts_at,trial_ends_at,current_period_end,
  billing_consent_at,billing_method_ready_at,auto_bill_enabled
) values
  ('43620000-0000-4000-8000-000000000008','43610000-0000-4000-8000-000000000008','trialing','confirmed','2026-08-03T00:00:00Z','2026-09-02T00:00:00Z',null,'2026-08-20T00:00:00Z','2026-08-21T00:00:00Z',true),
  ('43620000-0000-4000-8000-000000000007','43610000-0000-4000-8000-000000000007','trialing','confirmed','2026-08-03T00:00:00Z','2026-09-02T00:00:00Z',null,'2026-08-20T00:00:00Z','2026-08-21T00:00:00Z',true);

insert into public.subscription_terms(
  id,subscription_id,plan_code,contracted_period_amount,currency,billing_period,
  contracted_unit_limit,unlimited_units,origin,catalog_reference_amount,authorized_by,
  effective_from,effective_to,note
) values
  ('43630000-0000-4000-8000-000000000008','43620000-0000-4000-8000-000000000008','esencial',29.00,'USD','monthly',30,false,'catalog',29.00,'00000000-0000-4000-8000-000000004368','2026-08-01',null,'HAB436 paid scheduler fixture'),
  ('43630000-0000-4000-8000-000000000007','43620000-0000-4000-8000-000000000007','esencial',29.00,'USD','monthly',30,false,'catalog',29.00,'00000000-0000-4000-8000-000000004368','2026-08-01',null,'HAB436 zero scheduler fixture');

insert into public.subscription_adjustments(
  id,subscription_id,offer_id,source,adjustment_kind,percentage_off,fixed_amount,currency,
  reference_period_amount,effective_period_amount,effective_from,effective_to,authorized_by,note
) values (
  '43640000-0000-4000-8000-000000000007','43620000-0000-4000-8000-000000000007',null,
  'gift','free',null,null,'USD',29.00,0.00,'2026-09-02','2026-10-02','00000000-0000-4000-8000-000000004368','HAB436 gifted first paid month'
);

insert into habitta_internal.saas_billing_accounts(subscription_id,provider,provider_customer_ref,payment_method_ref)
values
  ('43620000-0000-4000-8000-000000000008','stripe','cus_sched_paid','pm_sched_paid'),
  ('43620000-0000-4000-8000-000000000007','stripe','cus_sched_zero','pm_sched_zero');

select ok(
  not has_function_privilege('authenticated','public.claim_due_saas_billing_attempts_v1(timestamptz,integer)','EXECUTE'),
  'browser clients cannot claim SaaS billing work'
);
select ok(
  has_function_privilege('service_role','public.claim_due_saas_billing_attempts_v1(timestamptz,integer)','EXECUTE'),
  'service role may claim SaaS billing work'
);

set local role service_role;
select is(
  public.advance_zero_due_saas_periods_v1('2026-09-03T12:00:00Z',25),
  1,
  '$0 commercial period advances without contacting provider'
);

set local role postgres;
select is(
  (select status::text from public.subscriptions where id='43620000-0000-4000-8000-000000000007'),
  'active',
  '$0 due subscription becomes active'
);
select is(
  (select current_period_end from public.subscriptions where id='43620000-0000-4000-8000-000000000007'),
  '2026-10-02'::date,
  '$0 due period advances by the contracted monthly cadence'
);
select ok(
  exists(select 1 from public.subscription_events where subscription_id='43620000-0000-4000-8000-000000000007' and event_type='saas_zero_due_period_advanced'),
  '$0 due advancement is audited explicitly'
);
select is(
  (select count(*) from public.payments where condominium_id='43610000-0000-4000-8000-000000000007'),
  0::bigint,
  '$0 SaaS period never manufactures resident payment'
);

set local role service_role;
select set_config(
  'hab436.billing_attempt',
  (select attempt_id::text from public.claim_due_saas_billing_attempts_v1('2026-09-03T12:00:00Z',20) limit 1),
  true
);
select ok(current_setting('hab436.billing_attempt')::uuid is not null,'positive due period creates one claimable billing attempt');

set local role postgres;
select is(
  (select expected_amount from habitta_internal.saas_billing_attempts where id=current_setting('hab436.billing_attempt')::uuid),
  29.00::numeric,
  'billing attempt freezes Habitta-calculated expected amount'
);
select is(
  (select currency from habitta_internal.saas_billing_attempts where id=current_setting('hab436.billing_attempt')::uuid),
  'USD',
  'billing attempt freezes Habitta commercial currency'
);

set local role service_role;
select is(
  (select count(*) from public.claim_due_saas_billing_attempts_v1('2026-09-03T12:00:00Z',20)),
  0::bigint,
  'claimed attempt is not double-claimed in the same run'
);
select ok(
  public.release_saas_billing_attempt_for_retry_v1(
    current_setting('hab436.billing_attempt')::uuid,
    'stripe_network_timeout',
    '2026-09-03T12:15:00Z'
  ),
  'ambiguous provider failure releases the same attempt for retry'
);
select is(
  (select attempt_id from public.claim_due_saas_billing_attempts_v1('2026-09-03T12:16:00Z',20) limit 1),
  current_setting('hab436.billing_attempt')::uuid,
  'ambiguous retry reuses the same Habitta attempt and provider idempotency key'
);

select is(
  (public.attach_saas_billing_provider_payment_v1(
    current_setting('hab436.billing_attempt')::uuid,'stripe','pi_sched_failed'
  )->>'status'),
  'provider_created',
  'provider PaymentIntent reference is attached before webhook state mutation'
);
select is(
  (public.attach_saas_billing_provider_payment_v1(
    current_setting('hab436.billing_attempt')::uuid,'stripe','pi_sched_failed'
  )->>'idempotent_replay')::boolean,
  true,
  'provider payment attachment is idempotent'
);
select throws_ok(
  format(
    $$select public.attach_saas_billing_provider_payment_v1('%s','stripe','pi_DIFFERENT')$$,
    current_setting('hab436.billing_attempt')
  ),
  '23514','billing attempt already attached to different provider payment',
  'billing attempt cannot be rebound to another provider payment'
);

select is(
  (public.apply_billing_provider_event_v1(
    'stripe','evt_sched_failed','charge_failed','43620000-0000-4000-8000-000000000008',
    null,'cus_sched_paid','pm_sched_paid','pi_sched_failed',29.00,'USD','2026-09-03T12:20:00Z'
  )->>'processing_status'),
  'applied',
  'signed matching provider failure transitions commercial state'
);

set local role postgres;
select is(
  (select status from habitta_internal.saas_billing_attempts where id=current_setting('hab436.billing_attempt')::uuid),
  'failed',
  'provider event trigger closes the concrete billing attempt as failed'
);
select is(
  (select status::text from public.subscriptions where id='43620000-0000-4000-8000-000000000008'),
  'past_due',
  'definitive provider failure makes the SaaS subscription past_due'
);

set local role service_role;
select is(
  (select attempt_no from public.claim_due_saas_billing_attempts_v1(clock_timestamp() + interval '2 hours',20) where subscription_id='43620000-0000-4000-8000-000000000008' limit 1),
  2,
  'a definitive failed charge creates the next bounded retry attempt after the retry window'
);

set local role postgres;
select is(
  (select count(*) from public.receivable_items where condominium_id in ('43610000-0000-4000-8000-000000000008','43610000-0000-4000-8000-000000000007')),
  0::bigint,
  'SaaS scheduling and retries never create condominium receivables'
);

select * from finish();
rollback;
