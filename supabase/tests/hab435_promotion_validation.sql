begin;
select plan(5);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
values (
  '00000000-0000-4000-8000-000000004359',
  '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','hab435-validation-owner@test.local','x',now(),now()
);

insert into public.organizations(id,name,created_by,account_type)
values (
  '43500000-0000-4000-8000-000000000009','HAB435 Validation Customer',
  '00000000-0000-4000-8000-000000004359','customer'
);
insert into public.condominiums(id,organization_id,name,created_by)
values (
  '43510000-0000-4000-8000-000000000009','43500000-0000-4000-8000-000000000009',
  'HAB435 Validation Condo','00000000-0000-4000-8000-000000004359'
);
insert into public.organization_memberships(organization_id,user_id,role)
values (
  '43500000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000004359',
  'organization_owner'
);

insert into public.subscriptions(
  id,condominium_id,status,commercial_status,trial_starts_at,trial_ends_at,current_period_end,auto_bill_enabled
) values (
  '43520000-0000-4000-8000-000000000009','43510000-0000-4000-8000-000000000009',
  'trialing','not_yet_confirmed',now(),now() + interval '30 days',null,false
);
insert into public.subscription_terms(
  id,subscription_id,plan_code,contracted_period_amount,currency,billing_period,
  contracted_unit_limit,unlimited_units,origin,catalog_reference_amount,authorized_by,
  effective_from,effective_to,note
) values (
  '43530000-0000-4000-8000-000000000009','43520000-0000-4000-8000-000000000009',
  'esencial',29.00,'USD','monthly',30,false,'catalog',29.00,
  '00000000-0000-4000-8000-000000004359',current_date,null,'HAB-435 validation fixture'
);

insert into public.commercial_offers(
  id,code,kind,percentage_off,fixed_amount,currency,duration_months,valid_from,valid_until,
  max_redemptions,active,note,created_by
) values
  (
    '43540000-0000-4000-8000-000000000009','EXPIRED25','percentage',25,null,null,1,
    current_date - 30,current_date - 1,null,true,'Expired HAB-435 offer',
    '00000000-0000-4000-8000-000000004359'
  ),
  (
    '43540000-0000-4000-8000-000000000010','STACK10','percentage',10,null,null,1,
    current_date,current_date + 30,null,true,'HAB-435 stacking offer',
    '00000000-0000-4000-8000-000000004359'
  );

insert into public.subscription_adjustments(
  id,subscription_id,offer_id,source,adjustment_kind,percentage_off,fixed_amount,currency,
  reference_period_amount,effective_period_amount,effective_from,effective_to,authorized_by,note
) values (
  '43550000-0000-4000-8000-000000000009','43520000-0000-4000-8000-000000000009',null,
  'gift','free',null,null,'USD',29.00,0.00,
  (select trial_ends_at::date from public.subscriptions where id='43520000-0000-4000-8000-000000000009'),
  ((select trial_ends_at::date from public.subscriptions where id='43520000-0000-4000-8000-000000000009') + interval '1 month')::date,
  '00000000-0000-4000-8000-000000004359','Platform-controlled gift fixture'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000004359',true);
select throws_ok(
  $$select public.get_customer_commercial_checkout_preview_v1('43510000-0000-4000-8000-000000000009','EXPIRED25')$$,
  '22023','promotion code is not active',
  'expired promotion is rejected server-side'
);

set local role postgres;
reset request.jwt.claim.sub;
select ok(
  (select billing_consent_at is null from public.subscriptions where id='43520000-0000-4000-8000-000000000009'),
  'expired promotion validation does not record billing consent'
);
select is(
  (select count(*) from public.subscription_adjustments where subscription_id='43520000-0000-4000-8000-000000000009' and source='coupon'),
  0::bigint,
  'expired promotion validation does not create a coupon snapshot'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000004359',true);
select throws_ok(
  $$select public.get_customer_commercial_checkout_preview_v1('43510000-0000-4000-8000-000000000009','STACK10')$$,
  '23514','promotion conflicts with an existing subscription adjustment',
  'customer promotion cannot stack over Platform Admin gifted access'
);

set local role postgres;
reset request.jwt.claim.sub;
select is(
  (select count(*) from public.subscription_adjustments where subscription_id='43520000-0000-4000-8000-000000000009' and source='coupon'),
  0::bigint,
  'stacking rejection leaves the existing commercial state unchanged'
);

select * from finish();
rollback;
