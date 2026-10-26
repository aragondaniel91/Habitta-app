begin;
select plan(6);

-- HAB-528: prove the effective EXECUTE ACL for the existing, reviewed
-- charge-scope setter after a clean migration replay. This does not alter
-- production grants or assume that PostgreSQL PUBLIC revocation removes
-- a direct anon grant.
select ok(
  to_regprocedure('public.set_condominium_charge_scope(uuid, public.condominium_charge_scope)') is not null,
  'charge-scope RPC exists after replaying migrations'
);

select is(
  has_function_privilege(
    'anon',
    'public.set_condominium_charge_scope(uuid, public.condominium_charge_scope)',
    'EXECUTE'
  ),
  false,
  'anon cannot execute the billing-mode setter'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.set_condominium_charge_scope(uuid, public.condominium_charge_scope)',
    'EXECUTE'
  ),
  true,
  'authenticated retains EXECUTE, subject to the RPC internal permission guard'
);

select is(
  has_function_privilege(
    'service_role',
    'public.set_condominium_charge_scope(uuid, public.condominium_charge_scope)',
    'EXECUTE'
  ),
  true,
  'service_role retains explicitly intended access'
);

select is(
  (
    select count(*)
    from pg_proc p,
      aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where p.oid = 'public.set_condominium_charge_scope(uuid, public.condominium_charge_scope)'::regprocedure
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ),
  0::bigint,
  'no EXECUTE grant remains for PUBLIC'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok(
  $$select public.set_condominium_charge_scope('00000000-0000-0000-0000-000000000001'::uuid, 'building'::public.condominium_charge_scope)$$,
  '42501',
  'permission denied for function set_condominium_charge_scope',
  'unauthenticated caller is denied at the PostgreSQL EXECUTE boundary'
);

reset role;
select * from finish();
rollback;
