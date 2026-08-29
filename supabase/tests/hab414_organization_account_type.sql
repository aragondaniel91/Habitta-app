begin;
select plan(13);

-- HAB-414: organization classification is commercial metadata owned by the platform.
-- It is deliberately separate from tenant authorization and from subscription enforcement.

select ok(
  to_regtype('public.organization_account_type') is not null,
  'organization_account_type exists'
);

select is(
  (
    select string_agg(e.enumlabel, ',' order by e.enumsortorder)
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    join pg_enum e on e.enumtypid = t.oid
    where n.nspname = 'public'
      and t.typname = 'organization_account_type'
  ),
  'customer,demo,internal',
  'the account type vocabulary is closed to customer, demo, and internal'
);

select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'organizations'
      and column_name = 'account_type'
  ),
  1::bigint,
  'organizations carries account_type'
);

select is(
  (
    select is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'organizations'
      and column_name = 'account_type'
  ),
  'NO',
  'account_type is never null'
);

select ok(
  (
    select column_default ilike '%customer%'
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'organizations'
      and column_name = 'account_type'
  ),
  'account_type defaults to customer'
);

insert into auth.users(id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('41400000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@hab414.test', 'x', now(), now()),
  ('41400000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b@hab414.test', 'x', now(), now());

insert into public.organizations(id, name, created_by)
values ('41410000-0000-4000-8000-000000000001', 'Default Customer', '41400000-0000-4000-8000-000000000001');

select is(
  (select account_type::text from public.organizations where id = '41410000-0000-4000-8000-000000000001'),
  'customer',
  'an ordinary organization is customer by default'
);

select lives_ok(
  $$insert into public.organizations(id, name, created_by, account_type) values
    ('41410000-0000-4000-8000-000000000002', 'Demo Seed', '41400000-0000-4000-8000-000000000001', 'demo'),
    ('41410000-0000-4000-8000-000000000003', 'Internal Seed', '41400000-0000-4000-8000-000000000001', 'internal')$$,
  'trusted administrative SQL can classify demo and internal organizations'
);

select is(
  (select string_agg(account_type::text, ',' order by account_type::text)
   from public.organizations
   where id in ('41410000-0000-4000-8000-000000000002', '41410000-0000-4000-8000-000000000003')),
  'demo,internal',
  'administrative classifications persist exactly'
);

select throws_ok(
  $$insert into public.organizations(id, name, created_by, account_type) values
    ('41410000-0000-4000-8000-000000000004', 'Invalid', '41400000-0000-4000-8000-000000000001', 'partner')$$,
  '22P02',
  null,
  'the enum rejects classifications outside the approved vocabulary'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '41400000-0000-4000-8000-000000000002', true);

select lives_ok(
  $$insert into public.organizations(id, name, created_by) values
    ('41410000-0000-4000-8000-000000000005', 'Tenant Customer', '41400000-0000-4000-8000-000000000002')$$,
  'an authenticated tenant may still create the normal customer organization allowed by existing RLS'
);

select is(
  (select account_type::text from public.organizations where id = '41410000-0000-4000-8000-000000000005'),
  'customer',
  'the authenticated creation path cannot silently become non-customer'
);

select throws_ok(
  $$insert into public.organizations(id, name, created_by, account_type) values
    ('41410000-0000-4000-8000-000000000006', 'Self Demo', '41400000-0000-4000-8000-000000000002', 'demo')$$,
  '42501',
  'organization account_type is platform-managed',
  'an authenticated tenant cannot self-classify as demo'
);

select throws_ok(
  $$insert into public.organizations(id, name, created_by, account_type) values
    ('41410000-0000-4000-8000-000000000007', 'Self Internal', '41400000-0000-4000-8000-000000000002', 'internal')$$,
  '42501',
  'organization account_type is platform-managed',
  'an authenticated tenant cannot self-classify as internal'
);

select * from finish();
rollback;
