begin;
select plan(7);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
values ('00000000-0000-4000-8000-000000004366','00000000-0000-4000-8000-000000000000','authenticated','authenticated','hab436-cycle@test.local','x',now(),now());
insert into public.organizations(id,name,created_by,account_type)
values ('43600000-0000-4000-8000-000000000006','HAB436 Cycle Customer','00000000-0000-4000-8000-000000004366','customer');
insert into public.condominiums(id,organization_id,name,created_by)
values ('43610000-0000-4000-8000-000000000006','43600000-0000-4000-8000-000000000006','HAB436 Cycle Condo','00000000-0000-4000-8000-000000004366');
insert into public.subscriptions(
  id,condominium_id,status,commercial_status,trial_starts_at,trial_ends_at,current_period_end,
  billing_consent_at,billing_method_ready_at,auto_bill_enabled
) values (
  '43620000-0000-4000-8000-000000000006','43610000-0000-4000-8000-000000000006',
  'trialing','confirmed','2026-08-03T00:00:00Z','2026-09-02T00:00:00Z',null,
  '2026-08-20T00:00:00Z','2026-08-21T00:00:00Z',true
);
insert into public.subscription_terms(
  id,subscription_id,plan_code,contracted_period_amount,currency,billing_period,
  contracted_unit_limit,unlimited_units,origin,catalog_reference_amount,authorized_by,
  effective_from,effective_to,note
) values (
  '43630000-0000-4000-8000-000000000006','43620000-0000-4000-8000-000000000006',
  'esencial',29.00,'USD','monthly',30,false,'catalog',29.00,'00000000-0000-4000-8000-000000004366',
  '2026-08-01',null,'HAB436 cycle fixture'
);
insert into public.subscription_adjustments(
  id,subscription_id,offer_id,source,adjustment_kind,percentage_off,fixed_amount,currency,
  reference_period_amount,effective_period_amount,effective_from,effective_to,authorized_by,note
) values (
  '43640000-0000-4000-8000-000000000006','43620000-0000-4000-8000-000000000006',null,
  'gift','free',null,null,'USD',29.00,0.00,'2026-09-04','2026-09-05','00000000-0000-4000-8000-000000004366','Webhook-date gift proves provider arrival date is not the billing date'
);
insert into habitta_internal.saas_billing_accounts(subscription_id,provider,provider_customer_ref,payment_method_ref)
values ('43620000-0000-4000-8000-000000000006','stripe','cus_cycle_hab436','pm_cycle_hab436');
insert into habitta_internal.saas_billing_attempts(
  id,subscription_id,condominium_id,billing_cycle_on,attempt_no,expected_amount,currency,
  provider,provider_customer_ref,payment_method_ref,provider_payment_ref,status,claimed_at,next_retry_at
) values (
  '43680000-0000-4000-8000-000000000006','43620000-0000-4000-8000-000000000006',
  '43610000-0000-4000-8000-000000000006','2026-09-02',1,29.00,'USD','stripe',
  'cus_cycle_hab436','pm_cycle_hab436','pi_cycle_hab436','provider_created',null,'2026-09-02T00:00:00Z'
);

set local role service_role;
select is(
  (public.apply_billing_provider_event_v1(
    'stripe','evt_cycle_hab436','charge_succeeded','43620000-0000-4000-8000-000000000006',
    null,'cus_cycle_hab436','pm_cycle_hab436','pi_cycle_hab436',29.00,'USD','2026-09-04T18:00:00Z'
  )->>'processing_status'),
  'applied',
  'delayed signed success uses the Habitta billing-attempt snapshot instead of webhook-date pricing'
);

set local role postgres;
select is(
  (select current_period_end from public.subscriptions where id='43620000-0000-4000-8000-000000000006'),
  '2026-10-02'::date,
  'delayed webhook preserves the September 2 billing anniversary'
);
select is(
  (select status from habitta_internal.saas_billing_attempts where id='43680000-0000-4000-8000-000000000006'),
  'succeeded',
  'provider event closes the correlated Habitta attempt'
);
select is(
  (select payload->>'billing_cycle_on' from public.subscription_events where subscription_id='43620000-0000-4000-8000-000000000006' and event_type='saas_billing_succeeded' order by created_at desc limit 1),
  '2026-09-02',
  'audit event records Habitta billing-cycle date'
);
select ok(
  (select payload->>'provider_occurred_at' from public.subscription_events where subscription_id='43620000-0000-4000-8000-000000000006' and event_type='saas_billing_succeeded' order by created_at desc limit 1) like '2026-09-04%',
  'audit event separately preserves provider occurrence timestamp'
);
select is(
  (select count(*) from public.payments where condominium_id='43610000-0000-4000-8000-000000000006'),
  0::bigint,
  'delayed SaaS provider event never creates resident payment'
);
select is(
  (select count(*) from public.receivable_items where condominium_id='43610000-0000-4000-8000-000000000006'),
  0::bigint,
  'delayed SaaS provider event never creates condominium receivable'
);

select * from finish();
rollback;
