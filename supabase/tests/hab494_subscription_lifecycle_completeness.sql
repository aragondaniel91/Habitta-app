begin;
select plan(34);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
values
  ('00000000-0000-0000-0000-000000004941','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hab494-owner@test.local','x',now(),now()),
  ('00000000-0000-0000-0000-000000004942','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hab494-platform@test.local','x',now(),now()),
  ('00000000-0000-0000-0000-000000004943','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hab494-tenant@test.local','x',now(),now());

insert into public.organizations(id,name,created_by,account_type) values
  ('49400000-0000-0000-0000-000000000001','HAB494 Customer','00000000-0000-0000-0000-000000004941','customer');

insert into public.condominiums(id,organization_id,name,created_by) values
  ('49410000-0000-0000-0000-000000000001','49400000-0000-0000-0000-000000000001','HAB494 Condo','00000000-0000-0000-0000-000000004941');

insert into public.organization_memberships(organization_id,user_id,role) values
  ('49400000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000004941','organization_owner');
insert into public.platform_admins(user_id) values ('00000000-0000-0000-0000-000000004942');

-- ------------------------------------------------------------------ client boundary

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000004943',true);
select throws_ok(
  $$select public.platform_change_plan('49410000-0000-0000-0000-000000000001','comunidad','monthly',null)$$,
  '42501', 'platform admin required',
  'ordinary tenant cannot change a subscription plan'
);
select throws_ok(
  $$select public.platform_request_subscription_cancellation('49410000-0000-0000-0000-000000000001',null,null)$$,
  '42501', 'platform admin required',
  'ordinary tenant cannot request a cancellation'
);
select throws_ok(
  $$select public.platform_reactivate_subscription('49410000-0000-0000-0000-000000000001','esencial','monthly')$$,
  '42501', 'platform admin required',
  'ordinary tenant cannot reactivate a subscription'
);

-- ------------------------------------------------------------------ trial, then plan change

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000004942',true);
select lives_ok(
  $$select public.platform_start_30_day_trial('49410000-0000-0000-0000-000000000001','esencial','monthly')$$,
  'platform admin can start the trial these tests build on'
);

set local role postgres;
reset request.jwt.claim.sub;
-- Backdate the term so the "same day" guard does not fire on the first, legitimate plan change.
update public.subscription_terms
   set effective_from = current_date - 10
 where subscription_id = (select id from public.subscriptions where condominium_id='49410000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000004942',true);
select lives_ok(
  $$select public.platform_change_plan('49410000-0000-0000-0000-000000000001','comunidad','monthly','upgrade requested by customer')$$,
  'platform admin can change plan on a trialing subscription'
);
select throws_ok(
  $$select public.platform_change_plan('49410000-0000-0000-0000-000000000001','comunidad','monthly',null)$$,
  '22023', 'requested plan and billing period match the current term',
  'changing to the exact same plan and period is rejected as a no-op'
);
select throws_ok(
  $$select public.platform_change_plan('49410000-0000-0000-0000-000000000001','comunidad','annual',null)$$,
  '23514', 'cannot change plan the same day the current term started; try again tomorrow',
  'a second plan change the same day the first took effect is rejected'
);

set local role postgres;
reset request.jwt.claim.sub;
select ok(
  (select plan_code = 'comunidad' and billing_period = 'monthly' and effective_from = current_date and effective_to is null
     from public.subscription_terms t
     join public.subscriptions s on s.id = t.subscription_id
    where s.condominium_id = '49410000-0000-0000-0000-000000000001'
    order by t.effective_from desc limit 1),
  'plan change opens a new term at the catalogue price for the new plan'
);
select ok(
  (select plan_code = 'esencial' and effective_to = current_date
     from public.subscription_terms t
     join public.subscriptions s on s.id = t.subscription_id
    where s.condominium_id = '49410000-0000-0000-0000-000000000001'
      and t.plan_code = 'esencial'),
  'plan change closes the prior term instead of rewriting it'
);
select ok(
  exists (
    select 1 from public.subscription_events e
    where e.condominium_id = '49410000-0000-0000-0000-000000000001'
      and e.event_type = 'plan_changed'
      and e.from_plan = 'esencial' and e.to_plan = 'comunidad'
      and e.reason = 'upgrade requested by customer'
  ),
  'plan change records an auditable event with the old and new plan'
);

-- ------------------------------------------------------------------ cancellation guards

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000004942',true);
select throws_ok(
  $$select public.platform_request_subscription_cancellation('49410000-0000-0000-0000-000000000001',current_date - 1,null)$$,
  '22023', 'cancellation date cannot be in the past',
  'cancellation cannot be backdated'
);
select throws_ok(
  $$select public.platform_request_subscription_cancellation('49410000-0000-0000-0000-000000000001',current_date,null)$$,
  '23514', 'cancellation date must be after the current term started',
  'cancellation the same day the current term started is rejected'
);

set local role postgres;
reset request.jwt.claim.sub;
-- Shrink the prior closed term first so the exclusion constraint never sees an overlap: the open
-- term's effective_from cannot move earlier than the closed term's effective_to at any point.
update public.subscription_terms
   set effective_to = current_date - 5
 where subscription_id = (select id from public.subscriptions where condominium_id='49410000-0000-0000-0000-000000000001')
   and effective_to = current_date;
update public.subscription_terms
   set effective_from = current_date - 5
 where subscription_id = (select id from public.subscriptions where condominium_id='49410000-0000-0000-0000-000000000001')
   and effective_to is null;

-- ------------------------------------------------------------------ end-of-term cancellation lifecycle

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000004942',true);
select lives_ok(
  $$select public.platform_request_subscription_cancellation('49410000-0000-0000-0000-000000000001',current_date,'customer requested cancellation')$$,
  'platform admin can schedule an end-of-term cancellation'
);
select throws_ok(
  $$select public.platform_request_subscription_cancellation('49410000-0000-0000-0000-000000000001',current_date,null)$$,
  '23514', 'a cancellation is already scheduled for this subscription',
  'a second cancellation cannot be scheduled while one is already pending'
);

set local role postgres;
reset request.jwt.claim.sub;
select ok(
  (select cancel_at = current_date and status <> 'cancelled'
     from public.subscriptions where condominium_id='49410000-0000-0000-0000-000000000001'),
  'a scheduled cancellation does not change status until it takes effect'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000004942',true);
select lives_ok(
  $$select public.platform_undo_scheduled_cancellation('49410000-0000-0000-0000-000000000001')$$,
  'platform admin can undo a scheduled cancellation before it takes effect'
);
select throws_ok(
  $$select public.platform_undo_scheduled_cancellation('49410000-0000-0000-0000-000000000001')$$,
  '23514', 'no cancellation is scheduled for this subscription',
  'undoing when nothing is scheduled is rejected'
);

set local role postgres;
reset request.jwt.claim.sub;
select ok(
  (select cancel_at is null from public.subscriptions where condominium_id='49410000-0000-0000-0000-000000000001'),
  'undo clears the scheduled cancellation date'
);
select ok(
  exists (
    select 1 from public.subscription_events e
    where e.condominium_id = '49410000-0000-0000-0000-000000000001'
      and e.event_type = 'subscription_cancellation_reversed'
      and e.payload @> jsonb_build_object('previous_cancel_at', current_date)
  ),
  'the reversal is recorded with the cancellation date it undid'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000004942',true);
select lives_ok(
  $$select public.platform_request_subscription_cancellation('49410000-0000-0000-0000-000000000001',current_date,'final cancellation')$$,
  'platform admin can reschedule the cancellation'
);

select throws_ok(
  $$select public.process_scheduled_cancellations()$$,
  '42501', 'permission denied for function process_scheduled_cancellations',
  'the scheduled-cancellation processor rejects a client role'
);

set local role postgres;
reset request.jwt.claim.sub;
select is(
  (select public.process_scheduled_cancellations()),
  1,
  'the scheduled-cancellation processor cancels exactly the one due subscription'
);
select ok(
  (select status = 'cancelled' and not auto_bill_enabled
     from public.subscriptions where condominium_id='49410000-0000-0000-0000-000000000001'),
  'processing a due cancellation moves the subscription to cancelled and disables auto-bill'
);
select ok(
  (select effective_to = current_date
     from public.subscription_terms t
     join public.subscriptions s on s.id = t.subscription_id
    where s.condominium_id = '49410000-0000-0000-0000-000000000001'
      and t.plan_code = 'comunidad'),
  'processing a due cancellation closes the open commercial term on the effective date'
);
select ok(
  exists (
    select 1 from public.subscription_events e
    where e.condominium_id = '49410000-0000-0000-0000-000000000001'
      and e.event_type = 'subscription_cancelled'
      and e.payload @> '{"auto_bill_disabled": true}'::jsonb
  ),
  'the cancellation is recorded as an auditable event'
);

-- ------------------------------------------------------------------ reactivation

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000004942',true);
select lives_ok(
  $$select public.platform_reactivate_subscription('49410000-0000-0000-0000-000000000001','esencial','monthly')$$,
  'platform admin can reactivate a cancelled subscription'
);
select throws_ok(
  $$select public.platform_reactivate_subscription('49410000-0000-0000-0000-000000000001','esencial','monthly')$$,
  '23514', 'only a cancelled subscription can be reactivated',
  'an already-active subscription cannot be reactivated again'
);

set local role postgres;
reset request.jwt.claim.sub;
select ok(
  (select status = 'active' and commercial_status = 'confirmed' and cancel_at is null
     from public.subscriptions where condominium_id='49410000-0000-0000-0000-000000000001'),
  'reactivation restores active, confirmed access and clears the cancellation date'
);
select ok(
  (select not auto_bill_enabled and billing_consent_at is null and billing_method_ready_at is null
     from public.subscriptions where condominium_id='49410000-0000-0000-0000-000000000001'),
  'reactivation never assumes a pre-cancellation billing consent or auto-bill setup still applies'
);
select ok(
  (select trial_starts_at is null and trial_ends_at is null
     from public.subscriptions where condominium_id='49410000-0000-0000-0000-000000000001'),
  'reactivation clears the stale trial window instead of leaving it to confuse billing scheduling'
);
select ok(
  (select plan_code = 'esencial' and billing_period = 'monthly' and effective_from = current_date and effective_to is null
     from public.subscription_terms t
     join public.subscriptions s on s.id = t.subscription_id
    where s.condominium_id = '49410000-0000-0000-0000-000000000001'
    order by t.effective_from desc limit 1),
  'reactivation opens a fresh commercial term at the catalogue price for the chosen plan'
);
select ok(
  exists (
    select 1 from public.subscription_events e
    where e.condominium_id = '49410000-0000-0000-0000-000000000001'
      and e.event_type = 'subscription_reactivated'
      and e.from_status = 'cancelled' and e.to_status = 'active'
  ),
  'reactivation is recorded as an auditable event'
);

-- ------------------------------------------------------------------ never fabricates money

select is(
  (select count(*) from public.payments where condominium_id='49410000-0000-0000-0000-000000000001'),
  0::bigint,
  'plan change, cancellation and reactivation do not manufacture payments'
);
select is(
  (select count(*) from public.receivable_items where condominium_id='49410000-0000-0000-0000-000000000001'),
  0::bigint,
  'plan change, cancellation and reactivation do not manufacture receivables'
);

select * from finish();
rollback;
