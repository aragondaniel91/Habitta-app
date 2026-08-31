begin;
select plan(31);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
values
  ('00000000-0000-0000-0000-000000004241','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hab424-owner@test.local','x',now(),now()),
  ('00000000-0000-0000-0000-000000004242','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hab424-platform@test.local','x',now(),now()),
  ('00000000-0000-0000-0000-000000004243','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hab424-tenant@test.local','x',now(),now());

insert into public.organizations(id,name,created_by,account_type) values
  ('42400000-0000-0000-0000-000000000001','HAB424 Customer A','00000000-0000-0000-0000-000000004241','customer'),
  ('42400000-0000-0000-0000-000000000002','HAB424 Demo','00000000-0000-0000-0000-000000004241','demo'),
  ('42400000-0000-0000-0000-000000000003','HAB424 Customer B','00000000-0000-0000-0000-000000004241','customer');

insert into public.condominiums(id,organization_id,name,created_by) values
  ('42410000-0000-0000-0000-000000000001','42400000-0000-0000-0000-000000000001','HAB424 Condo A','00000000-0000-0000-0000-000000004241'),
  ('42410000-0000-0000-0000-000000000002','42400000-0000-0000-0000-000000000002','HAB424 Demo Condo','00000000-0000-0000-0000-000000004241'),
  ('42410000-0000-0000-0000-000000000003','42400000-0000-0000-0000-000000000003','HAB424 Condo B','00000000-0000-0000-0000-000000004241');

insert into public.organization_memberships(organization_id,user_id,role) values
  ('42400000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000004241','organization_owner');
insert into public.condominium_memberships(condominium_id,user_id,role) values
  ('42410000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000004241','condominium_admin'),
  ('42410000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000004243','tenant');
insert into public.platform_admins(user_id) values ('00000000-0000-0000-0000-000000004242');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000004243',true);
select throws_ok(
  $$select public.platform_create_commercial_offer('TENANT25','percentage',25,1,current_date,null,null,'nope')$$,
  '42501', 'platform admin required',
  'ordinary tenant cannot create commercial offers'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000004242',true);
select lives_ok(
  $$select public.platform_create_commercial_offer('LAUNCH25','percentage',25,3,current_date,current_date + 30,10,'Launch offer')$$,
  'platform admin can create a percentage offer'
);
select is(
  (select percentage_off from public.platform_list_commercial_offers() where code='LAUNCH25'),
  25.00::numeric,
  'offer list preserves percentage value'
);
select is(
  (select duration_months from public.platform_list_commercial_offers() where code='LAUNCH25'),
  3,
  'offer list preserves duration'
);

select throws_ok(
  $$select public.platform_start_30_day_trial('42410000-0000-0000-0000-000000000002','esencial','monthly')$$,
  '23514', 'commercial activation is only permitted for customer organizations',
  'demo condominium cannot receive a trial subscription'
);

select lives_ok(
  $$select public.platform_start_30_day_trial('42410000-0000-0000-0000-000000000001','esencial','monthly')$$,
  'platform admin can start a customer trial'
);
select is(
  (select status::text from public.subscriptions where condominium_id='42410000-0000-0000-0000-000000000001'),
  'trialing',
  'trial subscription starts in trialing state'
);
select ok(
  (select trial_starts_at is not null and trial_ends_at = trial_starts_at + interval '30 days'
     from public.subscriptions where condominium_id='42410000-0000-0000-0000-000000000001'),
  'trial window is exactly 30 days'
);
select is(
  (select auto_bill_enabled from public.subscriptions where condominium_id='42410000-0000-0000-0000-000000000001'),
  false,
  'trial never enables automatic billing'
);
select is(
  (select contracted_period_amount from public.subscription_terms t join public.subscriptions s on s.id=t.subscription_id where s.condominium_id='42410000-0000-0000-0000-000000000001'),
  29.00::numeric,
  'trial preserves the catalogue contract amount instead of rewriting it to zero'
);

select throws_ok(
  $$select public.platform_activate_subscription('42410000-0000-0000-0000-000000000001',null,null,true)$$,
  '23514', 'automatic billing requires explicit consent and payment method readiness',
  'automatic billing requires explicit consent and payment method readiness'
);
select lives_ok(
  $$select public.platform_activate_subscription('42410000-0000-0000-0000-000000000001',null,null,false)$$,
  'manual/provider-independent activation is explicit and does not enable auto billing'
);
select ok(
  (select status='active' and commercial_status='confirmed' and not auto_bill_enabled
     from public.subscriptions where condominium_id='42410000-0000-0000-0000-000000000001'),
  'activation records confirmed active commercial state without automatic billing'
);

select lives_ok(
  $$select public.platform_apply_commercial_offer('42410000-0000-0000-0000-000000000001','launch25',current_date)$$,
  'coupon code matching is normalized and can be applied'
);
select is(
  (select effective_period_amount from public.subscription_adjustments a join public.subscriptions s on s.id=a.subscription_id where s.condominium_id='42410000-0000-0000-0000-000000000001' and a.source='coupon'),
  21.75::numeric,
  '25 percent coupon computes the expected effective period price'
);
select is(
  (select contracted_period_amount from public.subscription_terms t join public.subscriptions s on s.id=t.subscription_id where s.condominium_id='42410000-0000-0000-0000-000000000001'),
  29.00::numeric,
  'coupon does not mutate contracted_period_amount'
);
select is(
  (select effective_to - effective_from from public.subscription_adjustments a join public.subscriptions s on s.id=a.subscription_id where s.condominium_id='42410000-0000-0000-0000-000000000001' and a.source='coupon'),
  ((current_date + interval '3 months')::date - current_date),
  'coupon duration is represented as an explicit finite interval'
);

select lives_ok(
  $$select public.platform_create_commercial_offer('SECOND10','percentage',10,1,current_date,null,null,'Second offer')$$,
  'second offer definition can exist'
);
select throws_ok(
  $$select public.platform_apply_commercial_offer('42410000-0000-0000-0000-000000000001','SECOND10',current_date)$$,
  '23P01', null,
  'a second overlapping commercial adjustment is rejected by the database'
);
select throws_ok(
  $$select public.platform_gift_months('42410000-0000-0000-0000-000000000001',1,current_date,'Overlap gift')$$,
  '23P01', null,
  'gifted access cannot stack over an active coupon'
);

select lives_ok(
  $$select public.platform_gift_months('42410000-0000-0000-0000-000000000001',1,(current_date + interval '3 months')::date,'Customer success gift')$$,
  'gift can start after the prior adjustment ends'
);
select is(
  (select effective_period_amount from public.subscription_adjustments a join public.subscriptions s on s.id=a.subscription_id where s.condominium_id='42410000-0000-0000-0000-000000000001' and a.source='gift'),
  0.00::numeric,
  'gifted month is represented as a zero effective commercial price'
);
select is(
  (select count(*) from public.payments where condominium_id='42410000-0000-0000-0000-000000000001'),
  0::bigint,
  'commercial adjustments do not manufacture payments'
);
select is(
  (select count(*) from public.receivable_items where condominium_id='42410000-0000-0000-0000-000000000001'),
  0::bigint,
  'commercial adjustments do not manufacture receivables'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000004241',true);
select is(
  (public.my_commercial_summary('42410000-0000-0000-0000-000000000001')->>'contracted_period_amount')::numeric,
  29.00::numeric,
  'condominium admin can read its own commercial summary'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000004243',true);
select throws_ok(
  $$select public.my_commercial_summary('42410000-0000-0000-0000-000000000001')$$,
  '42501', 'commercial summary requires condominium owner/admin scope',
  'tenant cannot read negotiated subscription pricing'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000004242',true);
select lives_ok(
  $$select public.platform_start_30_day_trial('42410000-0000-0000-0000-000000000003','comunidad','monthly')$$,
  'second customer can start a trial'
);

set local role postgres;
reset request.jwt.claim.sub;
update public.subscriptions
set trial_starts_at = now() - interval '31 days',
    trial_ends_at = now() - interval '1 day'
where condominium_id='42410000-0000-0000-0000-000000000003';

select is(
  (public.resolve_entitlements('42410000-0000-0000-0000-000000000003')->>'may_operate')::boolean,
  false,
  'expired trial fails closed even before status bookkeeping runs'
);
select lives_ok(
  $$select public.process_expired_trials()$$,
  'expired-trial processor executes without billing side effects'
);
select is(
  (select status::text from public.subscriptions where condominium_id='42410000-0000-0000-0000-000000000003'),
  'suspended',
  'expired trial deterministically transitions to suspended'
);
select ok(
  exists (
    select 1 from public.subscription_events e
    where e.condominium_id='42410000-0000-0000-0000-000000000003'
      and e.event_type='trial_expired'
      and e.payload @> '{"automatic_charge_attempted": false}'::jsonb
  ),
  'trial expiration audit explicitly records that no automatic charge was attempted'
);

select * from finish();
rollback;
