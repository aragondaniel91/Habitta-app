begin;
select plan(8);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
values ('00000000-0000-4000-8000-000000004369','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hab436-stripe@test.local','x',now(),now());

insert into public.organizations(id,name,created_by,account_type)
values ('43600000-0000-4000-8000-000000000009','HAB436 Stripe Customer','00000000-0000-4000-8000-000000004369','customer');
insert into public.condominiums(id,organization_id,name,created_by)
values ('43610000-0000-4000-8000-000000000009','43600000-0000-4000-8000-000000000009','HAB436 Stripe Condo','00000000-0000-4000-8000-000000004369');
insert into public.organization_memberships(organization_id,user_id,role)
values ('43600000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000004369','organization_owner');

insert into public.subscriptions(
  id,condominium_id,status,commercial_status,trial_starts_at,trial_ends_at,
  billing_consent_at,billing_method_ready_at,auto_bill_enabled
) values (
  '43620000-0000-4000-8000-000000000009','43610000-0000-4000-8000-000000000009',
  'trialing','confirmed',now()-interval '5 days',now()+interval '25 days',now(),null,false
);
insert into public.subscription_terms(
  id,subscription_id,plan_code,contracted_period_amount,currency,billing_period,
  contracted_unit_limit,unlimited_units,origin,catalog_reference_amount,authorized_by,
  effective_from,effective_to,note
) values (
  '43630000-0000-4000-8000-000000000009','43620000-0000-4000-8000-000000000009',
  'esencial',29.00,'USD','monthly',30,false,'catalog',29.00,'00000000-0000-4000-8000-000000004369',
  current_date-5,null,'HAB-436 Stripe fixture'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000004369',true);
select set_config(
  'hab436.stripe_attempt',
  public.begin_customer_billing_setup_v1(
    '43610000-0000-4000-8000-000000000009',
    '43690000-0000-4000-8000-000000000009'
  )->>'attempt_id',
  true
);
select ok(current_setting('hab436.stripe_attempt')::uuid is not null,'customer creates Stripe setup intent only after commercial consent');
select ok(
  not has_function_privilege('authenticated','public.resolve_saas_billing_subscription_v1(text,text,text)','EXECUTE'),
  'browser clients cannot resolve subscriptions from opaque provider references'
);

set local role service_role;
select lives_ok(
  format(
    $$select public.attach_billing_provider_setup_v1('%s','stripe','cs_test_hab436',null,now()+interval '30 minutes')$$,
    current_setting('hab436.stripe_attempt')
  ),
  'Stripe Checkout session may attach before Stripe creates its Customer'
);

set local role postgres;
select is(
  (select provider_customer_ref from habitta_internal.billing_setup_attempts where id=current_setting('hab436.stripe_attempt')::uuid),
  null,
  'pending Stripe Checkout stores no fabricated customer reference'
);

set local role service_role;
select is(
  (public.apply_billing_provider_event_v1(
    'stripe','evt_checkout_ready_hab436','payment_method_ready',
    '43620000-0000-4000-8000-000000000009','cs_test_hab436','cus_test_hab436','pm_test_hab436',
    null,null,null,now()
  )->>'processing_status'),
  'applied',
  'verified Checkout completion supplies customer and payment-method references'
);
select is(
  public.resolve_saas_billing_subscription_v1('stripe',null,'pm_test_hab436'),
  '43620000-0000-4000-8000-000000000009'::uuid,
  'verified detached-method webhook can resolve subscription by opaque method reference'
);
select is(
  public.resolve_saas_billing_subscription_v1('stripe','cus_test_hab436',null),
  '43620000-0000-4000-8000-000000000009'::uuid,
  'verified provider webhook can resolve subscription by opaque customer reference'
);

set local role postgres;
select ok(
  (select billing_method_ready_at is not null and auto_bill_enabled from public.subscriptions where id='43620000-0000-4000-8000-000000000009'),
  'Stripe readiness remains gated by the prior explicit commercial consent'
);

select * from finish();
rollback;
