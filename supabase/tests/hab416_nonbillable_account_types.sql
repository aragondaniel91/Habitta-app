begin;
select plan(12);

-- HAB-416: demo/internal are operational tenant classifications, never commercial customers.

select ok(
  to_regprocedure('public.guard_customer_subscription()') is not null,
  'the subscription account-type guard exists'
);

select is(
  (
    select count(*)::integer
    from pg_trigger
    where tgrelid = 'public.subscriptions'::regclass
      and tgname = 'subscriptions_customer_account_guard'
      and not tgisinternal
  ),
  1,
  'subscriptions are protected by the customer-account guard'
);

insert into auth.users(id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values (
  '41600000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'owner@hab416.test',
  'x',
  now(),
  now()
);

insert into public.organizations(id, name, created_by, account_type) values
  ('41610000-0000-4000-8000-000000000001', 'Customer With Contract', '41600000-0000-4000-8000-000000000001', 'customer'),
  ('41610000-0000-4000-8000-000000000002', 'Synthetic Demo', '41600000-0000-4000-8000-000000000001', 'demo'),
  ('41610000-0000-4000-8000-000000000003', 'Internal Habitta', '41600000-0000-4000-8000-000000000001', 'internal'),
  ('41610000-0000-4000-8000-000000000004', 'Customer To Reclassify', '41600000-0000-4000-8000-000000000001', 'customer');

insert into public.condominiums(id, organization_id, name, created_by) values
  ('41620000-0000-4000-8000-000000000001', '41610000-0000-4000-8000-000000000001', 'Customer Condo', '41600000-0000-4000-8000-000000000001'),
  ('41620000-0000-4000-8000-000000000002', '41610000-0000-4000-8000-000000000002', 'Demo Condo', '41600000-0000-4000-8000-000000000001'),
  ('41620000-0000-4000-8000-000000000003', '41610000-0000-4000-8000-000000000003', 'Internal Condo', '41600000-0000-4000-8000-000000000001'),
  ('41620000-0000-4000-8000-000000000004', '41610000-0000-4000-8000-000000000004', 'Reclassify Condo', '41600000-0000-4000-8000-000000000001');

select lives_ok(
  $$insert into public.subscriptions(condominium_id, status)
    values ('41620000-0000-4000-8000-000000000001', 'active')$$,
  'a normal customer condominium may have a subscription'
);

select throws_ok(
  $$insert into public.subscriptions(condominium_id, status)
    values ('41620000-0000-4000-8000-000000000002', 'active')$$,
  '23514',
  'subscriptions are only permitted for customer organizations',
  'a demo condominium cannot acquire a subscription'
);

select throws_ok(
  $$insert into public.subscriptions(condominium_id, status)
    values ('41620000-0000-4000-8000-000000000003', 'active')$$,
  '23514',
  'subscriptions are only permitted for customer organizations',
  'an internal condominium cannot acquire a subscription'
);

select throws_ok(
  $$update public.organizations
       set account_type = 'demo'
     where id = '41610000-0000-4000-8000-000000000001'$$,
  '23514',
  'non-customer organization cannot retain a subscription',
  'a customer with commercial state cannot be relabeled as demo'
);

select is(
  (select account_type::text from public.organizations where id = '41610000-0000-4000-8000-000000000001'),
  'customer',
  'failed reclassification leaves the contracted organization as customer'
);

select lives_ok(
  $$update public.organizations
       set account_type = 'demo'
     where id = '41610000-0000-4000-8000-000000000004'$$,
  'an unsubscribed customer may be deliberately reclassified as demo'
);

select is(
  (select account_type::text from public.organizations where id = '41610000-0000-4000-8000-000000000004'),
  'demo',
  'the safe administrative reclassification persists'
);

select throws_ok(
  $$insert into public.subscriptions(condominium_id, status)
    values ('41620000-0000-4000-8000-000000000004', 'active')$$,
  '23514',
  'subscriptions are only permitted for customer organizations',
  'the newly classified demo remains nonbillable'
);

select lives_ok(
  $$update public.organizations
       set account_type = 'customer'
     where id = '41610000-0000-4000-8000-000000000004'$$,
  'a trusted operator can explicitly return a noncontracted demo to customer state'
);

select lives_ok(
  $$insert into public.subscriptions(condominium_id, status)
    values ('41620000-0000-4000-8000-000000000004', 'active')$$,
  'commercial state is possible only after the organization is explicitly customer again'
);

select * from finish();
rollback;
