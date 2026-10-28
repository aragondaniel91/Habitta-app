begin;
select plan(8);

insert into auth.users(id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('59100000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'search-a@agreement.test', 'x', now(), now()),
  ('59100000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'search-b@agreement.test', 'x', now(), now());
insert into public.organizations(id, name, created_by) values
  ('59110000-0000-0000-0000-000000000001', 'Search A', '59100000-0000-0000-0000-000000000001'),
  ('59110000-0000-0000-0000-000000000002', 'Search B', '59100000-0000-0000-0000-000000000002');
insert into public.condominiums(id, organization_id, name, created_by) values
  ('59120000-0000-0000-0000-000000000001', '59110000-0000-0000-0000-000000000001', 'Search A', '59100000-0000-0000-0000-000000000001'),
  ('59120000-0000-0000-0000-000000000002', '59110000-0000-0000-0000-000000000002', 'Search B', '59100000-0000-0000-0000-000000000002');
insert into public.condominium_memberships(condominium_id, user_id, role) values
  ('59120000-0000-0000-0000-000000000001', '59100000-0000-0000-0000-000000000001', 'payment_reviewer'),
  ('59120000-0000-0000-0000-000000000002', '59100000-0000-0000-0000-000000000002', 'payment_reviewer');
insert into public.units(id, condominium_id, code, type, created_by) values
  ('59130000-0000-0000-0000-000000000001', '59120000-0000-0000-0000-000000000001', 'A-1', 'apartment', '59100000-0000-0000-0000-000000000001'),
  ('59130000-0000-0000-0000-000000000002', '59120000-0000-0000-0000-000000000002', 'B-1', 'apartment', '59100000-0000-0000-0000-000000000002');
insert into public.people(id, condominium_id, first_name, last_name, created_by) values
  ('59140000-0000-0000-0000-000000000001', '59120000-0000-0000-0000-000000000001', 'Search', 'A', '59100000-0000-0000-0000-000000000001'),
  ('59140000-0000-0000-0000-000000000002', '59120000-0000-0000-0000-000000000002', 'Search', 'B', '59100000-0000-0000-0000-000000000002');
insert into public.payment_agreements(id, condominium_id, unit_id, legal_obligor_person_id, initiated_by, proposing_actor_kind, proposed_by_user_id, currency_code, schedule, idempotency_key) values
  ('59150000-0000-0000-0000-000000000001', '59120000-0000-0000-0000-000000000001', '59130000-0000-0000-0000-000000000001', '59140000-0000-0000-0000-000000000001', 'administrator', 'administrator', '59100000-0000-0000-0000-000000000001', 'USD', '[{"due_date":"2026-11-01","amount":"0.10"},{"due_date":"2026-12-01","amount":"0.20"}]', 'search-a-key'),
  ('59150000-0000-0000-0000-000000000002', '59120000-0000-0000-0000-000000000002', '59130000-0000-0000-0000-000000000002', '59140000-0000-0000-0000-000000000002', 'administrator', 'administrator', '59100000-0000-0000-0000-000000000002', 'USD', '[{"due_date":"2026-11-01","amount":"0.30"}]', 'search-b-key');

select ok(has_function_privilege('authenticated', 'public.list_payment_agreement_ids(uuid,integer,integer,uuid,uuid,text,numeric,numeric,date,date,date,date,text)', 'execute'), 'authenticated can invoke the invoker search RPC');
select ok(not has_function_privilege('anon', 'public.list_payment_agreement_ids(uuid,integer,integer,uuid,uuid,text,numeric,numeric,date,date,date,date,text)', 'execute'), 'anon cannot invoke the search RPC');
select ok(position('SECURITY DEFINER' in pg_get_functiondef('public.list_payment_agreement_ids(uuid,integer,integer,uuid,uuid,text,numeric,numeric,date,date,date,date,text)'::regprocedure)) = 0, 'search RPC does not bypass RLS');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '59100000-0000-0000-0000-000000000001', true);
select is((select count(*) from public.list_payment_agreement_ids('59120000-0000-0000-0000-000000000001', 1, 25, '59130000-0000-0000-0000-000000000001', null, null, 0.30, 0.30)), 1::bigint, '0.10 plus 0.20 exactly matches the 0.30 numeric range');
select is((select agreement_id from public.list_payment_agreement_ids('59120000-0000-0000-0000-000000000001', 1, 25, '59130000-0000-0000-0000-000000000001', null, null, 0.30, 0.30)), '59150000-0000-0000-0000-000000000001'::uuid, 'database page returns the matching agreement ID');
select is((select total_count from public.list_payment_agreement_ids('59120000-0000-0000-0000-000000000001', 1, 25, '59130000-0000-0000-0000-000000000001', null, null, 0.30, 0.30)), 1::bigint, 'database page returns an accurate total');
select is((select count(*) from public.list_payment_agreement_ids('59120000-0000-0000-0000-000000000002', 1, 25, '59130000-0000-0000-0000-000000000002')), 1::bigint, 'cross-tenant search returns only the empty-page total row under caller RLS');

reset role;
set local role anon;
select throws_ok($$select public.list_payment_agreement_ids('59120000-0000-0000-0000-000000000001')$$, '42501', null, 'anon execution is denied');

select * from finish();
rollback;
