begin;
select plan(5);

-- HAB-SEC-009. `insert_budget_lines_from_json` is a helper for `create_budget_period` and
-- `create_budget_revision`, both SECURITY DEFINER and both gated on can_manage_budgets. It does no
-- check of its own, correctly, but it was granted to `authenticated` so it could be called direct.

select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='insert_budget_lines_from_json'
     and (has_function_privilege('authenticated',p.oid,'EXECUTE')
       or has_function_privilege('anon',p.oid,'EXECUTE'))),
  0::bigint,
  'the budget line helper is not reachable by a client role'
);
select ok(
  (select bool_and(p.prosecdef and coalesce(p.prosrc,'') ~* 'can_manage_budgets')
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in ('create_budget_period','create_budget_revision')),
  'its callers are security definer and still gated on can_manage_budgets'
);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
('5ec90000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sec009-a@test.local','x',now(),now()),
('5ec90000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sec009-b@test.local','x',now(),now());
insert into public.organizations(id,name,created_by) values
('5ec91000-0000-4000-8000-00000000000a','SEC009 Org A','5ec90000-0000-0000-0000-00000000000a'),
('5ec91000-0000-4000-8000-00000000000b','SEC009 Org B','5ec90000-0000-0000-0000-00000000000b');
insert into public.condominiums(id,organization_id,name,created_by) values
('5ec92000-0000-4000-8000-00000000000a','5ec91000-0000-4000-8000-00000000000a','SEC009 Condo A','5ec90000-0000-0000-0000-00000000000a'),
('5ec92000-0000-4000-8000-00000000000b','5ec91000-0000-4000-8000-00000000000b','SEC009 Condo B','5ec90000-0000-0000-0000-00000000000b');
insert into public.organization_memberships(organization_id,user_id,role) values
('5ec91000-0000-4000-8000-00000000000a','5ec90000-0000-0000-0000-00000000000a','organization_owner'),
('5ec91000-0000-4000-8000-00000000000b','5ec90000-0000-0000-0000-00000000000b','organization_owner');
insert into public.condominium_memberships(condominium_id,user_id,role) values
('5ec92000-0000-4000-8000-00000000000a','5ec90000-0000-0000-0000-00000000000a','condominium_admin'),
('5ec92000-0000-4000-8000-00000000000b','5ec90000-0000-0000-0000-00000000000b','condominium_admin');

-- B builds a legitimate budget.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','5ec90000-0000-0000-0000-00000000000b',true);
select set_config('sec009.cat',(select id::text from public.expense_categories where condominium_id='5ec92000-0000-4000-8000-00000000000b' limit 1),true);
select lives_ok(
  format($q$select public.create_budget_period('5ec92000-0000-4000-8000-00000000000b','2027','2027-01-01'::date,'2027-12-31'::date,'[{"category_id":"%s","currency_code":"USD","amount":1000,"note":"legitimo"}]'::jsonb,gen_random_uuid(),null)$q$, current_setting('sec009.cat')),
  'the other condominium builds its own budget'
);
reset role;

-- The attacker is handed the identifiers RLS would otherwise hide, to test the function itself.
select set_config('sec009.ver',(select id::text from public.budget_versions limit 1),true);
select set_config('sec009.per',(select id::text from public.budget_periods limit 1),true);
select set_config('sec009.cat2',(select id::text from public.expense_categories where condominium_id='5ec92000-0000-4000-8000-00000000000b' offset 1 limit 1),true);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','5ec90000-0000-0000-0000-00000000000a',true);

select throws_ok(
  format($q$select public.insert_budget_lines_from_json('%s'::uuid,'%s'::uuid,'5ec92000-0000-4000-8000-00000000000b','[{"category_id":"%s","currency_code":"USD","amount":999999,"note":"injected"}]'::jsonb)$q$,
    current_setting('sec009.ver'), current_setting('sec009.per'), current_setting('sec009.cat2')),
  '42501',
  'permission denied for function insert_budget_lines_from_json',
  'an administrator of one condominium cannot write budget lines into another'
);
reset role;

select is(
  (select count(*) from public.budget_lines),
  1::bigint,
  'the other condominium''s budget is untouched'
);

select * from finish();
rollback;
