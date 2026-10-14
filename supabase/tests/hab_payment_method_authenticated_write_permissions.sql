begin;
select plan(10);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('a4050000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'payment-method-owner@test.local', 'x', now(), now()),
  ('a4050000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'payment-method-accountant@test.local', 'x', now(), now()),
  ('a4050000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'payment-method-board@test.local', 'x', now(), now());

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4050000-0000-0000-0000-000000000001', true);
create temporary table payment_method_workspace as
select public.create_admin_workspace(
  'Payment method permission organization', 'independent', 'Payment method permission condominium',
  'VE', 'Caracas', 'America/Caracas', 'USD', 'VES', 10, 'Payment method permission tower'
) as payload;
reset role;

insert into public.condominium_memberships (condominium_id, user_id, role)
values
  ((select (payload #>> '{condominium,id}')::uuid from payment_method_workspace), 'a4050000-0000-0000-0000-000000000002', 'accountant'),
  ((select (payload #>> '{condominium,id}')::uuid from payment_method_workspace), 'a4050000-0000-0000-0000-000000000003', 'board_member');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.condominium_payment_methods'::regclass),
  'payment methods retain row-level security'
);
select ok(has_table_privilege('authenticated', 'public.condominium_payment_methods', 'INSERT'), 'authenticated has payment-method INSERT privilege before RLS');
select ok(has_table_privilege('authenticated', 'public.condominium_payment_methods', 'UPDATE'), 'authenticated has payment-method UPDATE privilege before RLS');
select ok(not has_table_privilege('authenticated', 'public.condominium_payment_methods', 'DELETE'), 'authenticated still has no payment-method DELETE privilege');
select ok(not has_table_privilege('anon', 'public.condominium_payment_methods', 'INSERT'), 'anon has no payment-method INSERT privilege');
select ok(not has_table_privilege('anon', 'public.condominium_payment_methods', 'UPDATE'), 'anon has no payment-method UPDATE privilege');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4050000-0000-0000-0000-000000000002', true);
create temporary table payment_method_created as
with inserted_method as (
  insert into public.condominium_payment_methods (
    condominium_id, method_type, display_name, currency_code, instructions, created_by
  ) values (
    (select (payload #>> '{condominium,id}')::uuid from payment_method_workspace),
    'cash', 'Caja de prueba', 'USD', 'Pagar en administración', 'a4050000-0000-0000-0000-000000000002'
  ) returning id
) select id from inserted_method;
select is((select count(*) from payment_method_created), 1::bigint, 'authorized accountant creates a payment method through RLS');

update public.condominium_payment_methods
set display_name = 'Caja de prueba editada'
where id = (select id from payment_method_created);
select is(
  (select display_name from public.condominium_payment_methods where id = (select id from payment_method_created)),
  'Caja de prueba editada',
  'authorized accountant edits a payment method through RLS'
);

select set_config('request.jwt.claim.sub', 'a4050000-0000-0000-0000-000000000003', true);
create temporary table board_update_attempt as
with attempted_update as (
  update public.condominium_payment_methods
  set display_name = 'Board write attempt'
  where id = (select id from payment_method_created)
  returning id
) select id from attempted_update;
select is((select count(*) from board_update_attempt), 0::bigint, 'board member cannot update a payment method despite authenticated table privileges');
select throws_ok(
  format(
    'insert into public.condominium_payment_methods (condominium_id, method_type, display_name, currency_code, instructions, created_by) values (%L::uuid, %L::public.payment_method_type, %L, %L, %L, %L::uuid)',
    (select payload #>> '{condominium,id}' from payment_method_workspace),
    'cash', 'Board write attempt', 'USD', 'No autorizado', 'a4050000-0000-0000-0000-000000000003'
  ),
  '42501', null, 'board member cannot create a payment method'
);

select * from finish();
rollback;
