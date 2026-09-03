begin;
select plan(34);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
values
  ('00000000-0000-4000-8000-000000004351','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hab435-owner-a@test.local','x',now(),now()),
  ('00000000-0000-4000-8000-000000004352','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hab435-admin@test.local','x',now(),now()),
  ('00000000-0000-4000-8000-000000004353','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hab435-tenant@test.local','x',now(),now()),
  ('00000000-0000-4000-8000-000000004354','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hab435-owner-b@test.local','x',now(),now());

insert into public.organizations(id,name,created_by,account_type) values
  ('43500000-0000-4000-8000-000000000001','HAB435 Customer A','00000000-0000-4000-8000-000000004351','customer'),
  ('43500000-0000-4000-8000-000000000002','HAB435 Customer B','00000000-0000-4000-8000-000000004354','customer');

insert into public.condominiums(id,organization_id,name,created_by) values
  ('43510000-0000-4000-8000-000000000001','43500000-0000-4000-8000-000000000001','HAB435 Condo A','00000000-0000-4000-8000-000000004351'),
  ('43510000-0000-4000-8000-000000000002','43500000-0000-4000-8000-000000000002','HAB435 Condo B','00000000-0000-4000-8000-000000004354');

insert into public.organization_memberships(organization_id,user_id,role) values
  ('43500000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000004351','organization_owner'),
  ('43500000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000004354','organization_owner');

insert into public.condominium_memberships(condominium_id,user_id,role) values
  ('43510000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000004352','condominium_admin'),
  ('43510000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000004353','tenant');

insert into public.subscriptions(
  id,condominium_id,status,commercial_status,trial_starts_at,trial_ends_at,current_period_end,auto_bill_enabled
) values
  ('43520000-0000-4000-8000-000000000001','43510000-0000-4000-8000-000000000001','trialing','not_yet_confirmed',now(),now() + interval '30 days',null,false),
  ('43520000-0000-4000-8000-000000000002','43510000-0000-4000-8000-000000000002','trialing','not_yet_confirmed',now(),now() + interval '30 days',null,false);

insert into public.subscription_terms(
  id,subscription_id,plan_code,contracted_period_amount,currency,billing_period,
  contracted_unit_limit,unlimited_units,origin,catalog_reference_amount,authorized_by,
  effective_from,effective_to,note
) values
  ('43530000-0000-4000-8000-000000000001','43520000-0000-4000-8000-000000000001','esencial',29.00,'USD','monthly',30,false,'catalog',29.00,'00000000-0000-4000-8000-000000004351',current_date,null,'HAB-435 fixture A'),
  ('43530000-0000-4000-8000-000000000002','43520000-0000-4000-8000-000000000002','esencial',29.00,'USD','monthly',30,false,'catalog',29.00,'00000000-0000-4000-8000-000000004354',current_date,null,'HAB-435 fixture B');

insert into public.commercial_offers(
  id,code,kind,percentage_off,fixed_amount,currency,duration_months,valid_from,valid_until,
  max_redemptions,active,note,created_by
) values
  ('43540000-0000-4000-8000-000000000001','SAVE25','percentage',25,null,null,3,current_date,current_date + 30,1,true,'HAB-435 percentage offer','00000000-0000-4000-8000-000000004351'),
  ('43540000-0000-4000-8000-000000000002','FIX5','fixed',null,5.00,'USD',1,current_date,current_date + 30,null,true,'HAB-435 fixed offer','00000000-0000-4000-8000-000000004351');

select ok(
  not has_function_privilege('authenticated', 'habitta_internal.commercial_checkout_preview_v1(uuid,text)', 'EXECUTE'),
  'authenticated clients cannot execute the internal checkout calculator directly'
);
select ok(
  not has_function_privilege('anon', 'public.get_customer_commercial_checkout_preview_v1(uuid,text)', 'EXECUTE'),
  'anonymous clients cannot execute commercial checkout preview'
);
select ok(
  not has_function_privilege('anon', 'public.record_customer_commercial_consent_v1(uuid,text,text)', 'EXECUTE'),
  'anonymous clients cannot record commercial consent'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','',true);
select throws_ok(
  $$select public.get_customer_commercial_checkout_preview_v1('43510000-0000-4000-8000-000000000001',null)$$,
  '42501','authentication required',
  'checkout preview requires an authenticated user'
);

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000004353',true);
select throws_ok(
  $$select public.get_customer_commercial_checkout_preview_v1('43510000-0000-4000-8000-000000000001',null)$$,
  '42501','commercial checkout requires organization owner scope',
  'tenant cannot see checkout pricing'
);

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000004352',true);
select throws_ok(
  $$select public.get_customer_commercial_checkout_preview_v1('43510000-0000-4000-8000-000000000001',null)$$,
  '42501','commercial checkout requires organization owner scope',
  'condominium admin cannot provide organization-level billing consent'
);

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000004354',true);
select throws_ok(
  $$select public.get_customer_commercial_checkout_preview_v1('43510000-0000-4000-8000-000000000001',null)$$,
  '42501','commercial checkout requires organization owner scope',
  'owner of another organization cannot see this checkout'
);

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000004351',true);
select is(
  (public.get_customer_commercial_checkout_preview_v1('43510000-0000-4000-8000-000000000001',null)->>'amount_due_today')::numeric,
  0::numeric,
  'trial checkout explicitly owes zero today'
);
select is(
  (public.get_customer_commercial_checkout_preview_v1('43510000-0000-4000-8000-000000000001',null)->>'first_period_amount')::numeric,
  29.00::numeric,
  'checkout without promotion preserves contracted first-period amount'
);
select is(
  length(public.get_customer_commercial_checkout_preview_v1('43510000-0000-4000-8000-000000000001',null)->>'terms_fingerprint'),
  64,
  'checkout preview returns a SHA-256 terms fingerprint'
);
select is(
  (public.get_customer_commercial_checkout_preview_v1('43510000-0000-4000-8000-000000000001',null)->>'auto_bill_enabled')::boolean,
  false,
  'checkout preview cannot claim automatic billing is enabled'
);
select throws_ok(
  $$select public.get_customer_commercial_checkout_preview_v1('43510000-0000-4000-8000-000000000001','NOPE')$$,
  '22023','promotion code is invalid',
  'invalid promotion code is rejected server-side'
);
select is(
  (public.get_customer_commercial_checkout_preview_v1('43510000-0000-4000-8000-000000000001','save25')->>'first_period_amount')::numeric,
  21.75::numeric,
  'percentage promotion preview computes effective first-period amount'
);
select is(
  (public.get_customer_commercial_checkout_preview_v1('43510000-0000-4000-8000-000000000001','SAVE25')#>>'{promotion,starts_on}')::date,
  (select trial_ends_at::date from public.subscriptions where id='43520000-0000-4000-8000-000000000001'),
  'promotion starts when the free trial ends'
);
select is(
  (public.get_customer_commercial_checkout_preview_v1('43510000-0000-4000-8000-000000000001','SAVE25')#>>'{promotion,ends_on}')::date,
  ((select trial_ends_at::date from public.subscriptions where id='43520000-0000-4000-8000-000000000001') + interval '3 months')::date,
  'promotion preview exposes its finite duration'
);
select set_config(
  'hab435.stale_fingerprint',
  public.get_customer_commercial_checkout_preview_v1('43510000-0000-4000-8000-000000000001','SAVE25')->>'terms_fingerprint',
  true
);

set local role postgres;
reset request.jwt.claim.sub;
select is(
  (select count(*) from public.subscription_adjustments where subscription_id='43520000-0000-4000-8000-000000000001'),
  0::bigint,
  'preview never mutates subscription adjustments'
);
update public.plans set catalog_monthly_usd=31.00 where code='esencial';

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000004351',true);
select throws_ok(
  $$select public.record_customer_commercial_consent_v1('43510000-0000-4000-8000-000000000001','SAVE25',current_setting('hab435.stale_fingerprint'))$$,
  '23514','commercial terms changed; refresh checkout preview',
  'consent rejects terms that changed after preview'
);

set local role postgres;
reset request.jwt.claim.sub;
select ok(
  (select billing_consent_at is null and commercial_status='not_yet_confirmed' from public.subscriptions where id='43520000-0000-4000-8000-000000000001'),
  'stale consent attempt leaves commercial state untouched'
);
update public.plans set catalog_monthly_usd=29.00 where code='esencial';

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000004351',true);
select throws_ok(
  $$select public.record_customer_commercial_consent_v1('43510000-0000-4000-8000-000000000001','SAVE25','bad')$$,
  '22023','valid commercial terms fingerprint is required',
  'malformed fingerprints are rejected'
);
select set_config(
  'hab435.valid_fingerprint',
  public.get_customer_commercial_checkout_preview_v1('43510000-0000-4000-8000-000000000001','SAVE25')->>'terms_fingerprint',
  true
);
select lives_ok(
  $$select public.record_customer_commercial_consent_v1('43510000-0000-4000-8000-000000000001','SAVE25',current_setting('hab435.valid_fingerprint'))$$,
  'organization owner can explicitly consent to the previewed commercial terms'
);

set local role postgres;
reset request.jwt.claim.sub;
select is(
  (select commercial_status::text from public.subscriptions where id='43520000-0000-4000-8000-000000000001'),
  'confirmed',
  'successful checkout records confirmed commercial status'
);
select ok(
  (select billing_consent_at is not null from public.subscriptions where id='43520000-0000-4000-8000-000000000001'),
  'successful checkout records an explicit billing consent timestamp'
);
select ok(
  (select not auto_bill_enabled and billing_method_ready_at is null from public.subscriptions where id='43520000-0000-4000-8000-000000000001'),
  'commercial consent neither creates payment-method readiness nor enables automatic billing'
);
select is(
  (select count(*) from public.subscription_adjustments where subscription_id='43520000-0000-4000-8000-000000000001'),
  1::bigint,
  'consent snapshots exactly one selected promotion'
);
select is(
  (select effective_period_amount from public.subscription_adjustments where subscription_id='43520000-0000-4000-8000-000000000001'),
  21.75::numeric,
  'promotion snapshot preserves the previewed effective amount'
);
select is(
  (select effective_from from public.subscription_adjustments where subscription_id='43520000-0000-4000-8000-000000000001'),
  (select trial_ends_at::date from public.subscriptions where id='43520000-0000-4000-8000-000000000001'),
  'promotion snapshot cannot consume time during the free trial'
);
select ok(
  exists (
    select 1 from public.subscription_events e
    where e.subscription_id='43520000-0000-4000-8000-000000000001'
      and e.event_type='billing_consent_recorded'
      and e.actor_user_id='00000000-0000-4000-8000-000000004351'
      and e.payload->>'terms_fingerprint'=current_setting('hab435.valid_fingerprint')
      and e.payload @> '{"offer_code":"SAVE25","auto_bill_enabled":false}'::jsonb
  ),
  'billing consent is auditable with actor, fingerprint, promotion and auto-bill=false evidence'
);
select is(
  (select count(*) from public.payments where condominium_id='43510000-0000-4000-8000-000000000001'),
  0::bigint,
  'commercial checkout never manufactures resident payments'
);
select is(
  (select count(*) from public.receivable_items where condominium_id='43510000-0000-4000-8000-000000000001'),
  0::bigint,
  'commercial checkout never manufactures resident receivables'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000004351',true);
select is(
  (public.record_customer_commercial_consent_v1(
    '43510000-0000-4000-8000-000000000001','SAVE25',current_setting('hab435.valid_fingerprint')
  )->>'idempotent_replay')::boolean,
  true,
  'retrying the exact accepted consent is idempotent'
);
select throws_ok(
  $$select public.record_customer_commercial_consent_v1('43510000-0000-4000-8000-000000000001',null,current_setting('hab435.valid_fingerprint'))$$,
  '23514','commercial consent already recorded',
  'a consent retry cannot silently change the selected promotion'
);

set local role postgres;
reset request.jwt.claim.sub;
select is(
  (select count(*) from public.subscription_adjustments where subscription_id='43520000-0000-4000-8000-000000000001'),
  1::bigint,
  'idempotent replay does not duplicate the promotion snapshot'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000004354',true);
select throws_ok(
  $$select public.get_customer_commercial_checkout_preview_v1('43510000-0000-4000-8000-000000000002','SAVE25')$$,
  '23514','promotion redemption limit reached',
  'promotion max-redemption limit is enforced from immutable adjustment snapshots'
);
select is(
  (public.get_customer_commercial_checkout_preview_v1('43510000-0000-4000-8000-000000000002','FIX5')->>'first_period_amount')::numeric,
  24.00::numeric,
  'fixed promotion keeps HAB-424 semantics by subtracting from the contracted amount'
);
select is(
  (public.get_customer_commercial_checkout_preview_v1('43510000-0000-4000-8000-000000000002','FIX5')->>'post_promotion_period_amount')::numeric,
  29.00::numeric,
  'checkout makes the post-promotion contracted price explicit'
);

select * from finish();
rollback;
