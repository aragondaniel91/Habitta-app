begin;
select plan(7);

-- HAB-SEC-008. `resolve_unit_financial_recipients` is SECURITY DEFINER with row_security=off and
-- performs no permission check, because it is meant to be reached only from
-- `expand_notification_event`. HAB-239 revoked it from public and anon and granted it to
-- service_role, but never revoked it from `authenticated`.

select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='resolve_unit_financial_recipients'
     and (has_function_privilege('authenticated', p.oid,'EXECUTE')
       or has_function_privilege('anon', p.oid,'EXECUTE'))),
  0::bigint,
  'the recipient resolver is closed to both client roles'
);
select ok(
  (select bool_and(has_function_privilege('service_role', p.oid,'EXECUTE'))
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='resolve_unit_financial_recipients'),
  'the notification pipeline keeps the grant it actually uses'
);

-- Two condominiums in separate organizations. A is the attacker, B the victim.
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
('5ec80000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sec008-a@test.local','x',now(),now()),
('5ec80000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sec008-b@test.local','x',now(),now());
insert into public.organizations(id,name,created_by) values
('5ec81000-0000-4000-8000-00000000000a','SEC008 Org A','5ec80000-0000-0000-0000-00000000000a'),
('5ec81000-0000-4000-8000-00000000000b','SEC008 Org B','5ec80000-0000-0000-0000-00000000000b');
insert into public.condominiums(id,organization_id,name,created_by) values
('5ec82000-0000-4000-8000-00000000000a','5ec81000-0000-4000-8000-00000000000a','SEC008 Condo A','5ec80000-0000-0000-0000-00000000000a'),
('5ec82000-0000-4000-8000-00000000000b','5ec81000-0000-4000-8000-00000000000b','SEC008 Condo B','5ec80000-0000-0000-0000-00000000000b');
insert into public.organization_memberships(organization_id,user_id,role) values
('5ec81000-0000-4000-8000-00000000000a','5ec80000-0000-0000-0000-00000000000a','organization_owner'),
('5ec81000-0000-4000-8000-00000000000b','5ec80000-0000-0000-0000-00000000000b','organization_owner');
insert into public.condominium_memberships(condominium_id,user_id,role) values
('5ec82000-0000-4000-8000-00000000000a','5ec80000-0000-0000-0000-00000000000a','condominium_admin'),
('5ec82000-0000-4000-8000-00000000000b','5ec80000-0000-0000-0000-00000000000b','condominium_admin');
insert into public.units(id,condominium_id,code,type,created_by) values
('5ec83000-0000-4000-8000-00000000000b','5ec82000-0000-4000-8000-00000000000b','B-1','apartment','5ec80000-0000-0000-0000-00000000000b');
insert into public.people(id,condominium_id,first_name,last_name,email,status,created_by) values
('5ec84000-0000-4000-8000-00000000000b','5ec82000-0000-4000-8000-00000000000b','Maria','Privada','maria.privada@victima.test','active','5ec80000-0000-0000-0000-00000000000b');
insert into public.unit_owners(unit_id,person_id,ownership_percentage,is_primary_contact,starts_at,created_by) values
('5ec83000-0000-4000-8000-00000000000b','5ec84000-0000-4000-8000-00000000000b',100,true,current_date-100,'5ec80000-0000-0000-0000-00000000000b');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
-- The administrator of A, with entirely legitimate credentials for A, aiming at B.
select set_config('request.jwt.claim.sub','5ec80000-0000-0000-0000-00000000000a',true);

select throws_ok(
  $$select * from public.resolve_unit_financial_recipients('5ec82000-0000-4000-8000-00000000000b','5ec83000-0000-4000-8000-00000000000b',now())$$,
  '42501',
  'permission denied for function resolve_unit_financial_recipients',
  'an administrator of one condominium cannot read another condominium''s residents'
);

-- RLS is what keeps the identifiers out of reach in the first place; it must stay that way.
select is((select count(*) from public.units where condominium_id='5ec82000-0000-4000-8000-00000000000b'),0::bigint,
  'the attacker cannot enumerate the other condominium''s units');
select is((select count(*) from public.people where condominium_id='5ec82000-0000-4000-8000-00000000000b'),0::bigint,
  'nor its people');
select is((select count(*) from public.condominiums where id='5ec82000-0000-4000-8000-00000000000b'),0::bigint,
  'nor the condominium itself');

-- And the legitimate owner still sees their own.
select set_config('request.jwt.claim.sub','5ec80000-0000-0000-0000-00000000000b',true);
select is((select count(*) from public.people where condominium_id='5ec82000-0000-4000-8000-00000000000b'),1::bigint,
  'the condominium''s own administrator still reads their own residents');

select * from finish();
rollback;
