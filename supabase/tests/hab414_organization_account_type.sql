begin;
select plan(21);

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

-- Read back from a trusted role rather than through the tenant's own view. `org_read_v2` grants
-- visibility through membership, and creating an organization does not create a membership, so the
-- creator cannot select the row it just inserted. Asserting from inside that view compared the
-- guard against RLS visibility and reported NULL -- a test failing for a reason that has nothing to
-- do with what it is testing.
reset role;
select is(
  (select account_type::text from public.organizations where id = '41410000-0000-4000-8000-000000000005'),
  'customer',
  'the authenticated creation path cannot silently become non-customer'
);
set local role authenticated;

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


-- ------------------------------------------------------------------ UPDATE
--
-- The INSERT path was covered; the UPDATE path was not, and a guard that only watches creation is
-- a guard against nothing -- a tenant would simply create a customer organization and then promote
-- it. Two independent layers have to hold, so both are asserted.
--
-- The first layer is RLS. `organizations` carries policies for SELECT and INSERT and none for
-- UPDATE, so an update by a tenant matches no rows. That fails silently rather than loudly: no
-- error is raised, nothing changes, and the row-count is the only evidence. Asserting `throws_ok`
-- here would fail while the system behaved correctly.

do $probe$
declare
  affected integer;
begin
  update public.organizations set account_type = 'demo' where id = '41410000-0000-4000-8000-000000000005';
  get diagnostics affected = row_count;
  perform set_config('hab414.own_demo', affected::text, true);
end
$probe$;
select is(
  current_setting('hab414.own_demo')::integer,
  0,
  'a tenant cannot update its own organization to demo: no UPDATE policy admits the row'
);

do $probe$
declare
  affected integer;
begin
  update public.organizations set account_type = 'internal' where id = '41410000-0000-4000-8000-000000000005';
  get diagnostics affected = row_count;
  perform set_config('hab414.own_internal', affected::text, true);
end
$probe$;
select is(
  current_setting('hab414.own_internal')::integer,
  0,
  'a tenant cannot update its own organization to internal'
);

-- Somebody else's organization, which the tenant can neither see nor change.
do $probe$
declare
  affected integer;
begin
  update public.organizations set account_type = 'demo' where id = '41410000-0000-4000-8000-000000000001';
  get diagnostics affected = row_count;
  perform set_config('hab414.foreign_demo', affected::text, true);
end
$probe$;
select is(
  current_setting('hab414.foreign_demo')::integer,
  0,
  'a tenant cannot reclassify an organization belonging to someone else'
);

reset role;
select is(
  (select string_agg(account_type::text, ',' order by id)
   from public.organizations
   where id in ('41410000-0000-4000-8000-000000000001', '41410000-0000-4000-8000-000000000005')),
  'customer,customer',
  'neither organization changed classification after those attempts'
);

-- The second layer, asserted for what it is. As `authenticated` the row is filtered out before
-- the trigger can see it, so there is no honest way to make the trigger fire from a tenant session
-- here -- and a test that pretended otherwise would be theatre. What matters is that the guard
-- covers UPDATE at all, so that if a future migration adds an UPDATE policy for tenants, the
-- column is still protected when RLS stops being what protects it.
select is(
  (select count(*)::integer from pg_trigger t
   where t.tgrelid = 'public.organizations'::regclass
     and t.tgname = 'organizations_account_type_guard'
     and not t.tgisinternal
     -- 2 = BEFORE, 4 = INSERT, 16 = UPDATE
     and (t.tgtype & 2) = 2 and (t.tgtype & 4) = 4 and (t.tgtype & 16) = 16),
  1,
  'the guard runs before both INSERT and UPDATE, not only on creation'
);

select is(
  (select count(*)::integer from pg_trigger t
   join pg_attribute a on a.attrelid = t.tgrelid and a.attnum = any(t.tgattr)
   where t.tgrelid = 'public.organizations'::regclass
     and t.tgname = 'organizations_account_type_guard'
     and a.attname = 'account_type'),
  1,
  'its UPDATE arm is scoped to the account_type column'
);

-- And the guard is a guard, not a wall: the platform can still classify, which is the entire
-- reason the column exists.
select lives_ok(
  $$update public.organizations set account_type = 'demo'
    where id = '41410000-0000-4000-8000-000000000005'$$,
  'trusted administrative SQL can reclassify an existing organization'
);

select is(
  (select account_type::text from public.organizations where id = '41410000-0000-4000-8000-000000000005'),
  'demo',
  'the administrative reclassification persisted'
);

select * from finish();
rollback;
