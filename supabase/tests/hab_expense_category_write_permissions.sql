begin;
select plan(12);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'category-workspace-owner@test.local', 'x', '{"full_name":"Category workspace owner"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000c102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'category-accountant@test.local', 'x', '{"full_name":"Category accountant"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000c103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'category-board-member@test.local', 'x', '{"full_name":"Category board member"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000c104', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'category-outsider@test.local', 'x', '{}'::jsonb, now(), now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000c101', true);
create temporary table category_workspace as
select public.create_admin_workspace('Category permission test organization', 'independent', 'Category permission test condominium', 'VE', 'Caracas', 'America/Caracas', 'USD', 'VES', 10, 'Category permission test tower') as payload;
reset role;

insert into public.condominium_memberships (condominium_id, user_id, role)
values
  ((select (payload #>> '{condominium,id}')::uuid from category_workspace), '00000000-0000-0000-0000-00000000c102', 'accountant'),
  ((select (payload #>> '{condominium,id}')::uuid from category_workspace), '00000000-0000-0000-0000-00000000c103', 'board_member');

select ok(has_table_privilege('authenticated', 'public.expense_categories', 'INSERT'), 'authenticated has category INSERT privilege before RLS evaluation');
select ok(has_table_privilege('authenticated', 'public.expense_categories', 'UPDATE'), 'authenticated has category UPDATE privilege before RLS evaluation');
select ok(not has_table_privilege('anon', 'public.expense_categories', 'INSERT'), 'anon has no category INSERT privilege');
select ok(not has_table_privilege('anon', 'public.expense_categories', 'UPDATE'), 'anon has no category UPDATE privilege');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000c102', true);
create temporary table category_created as
with inserted_category as (
  insert into public.expense_categories (condominium_id, code, name, description, created_by)
  values ((select (payload #>> '{condominium,id}')::uuid from category_workspace), 'cleaning-test', 'Limpieza de prueba', 'Categoría creada mediante RLS', '00000000-0000-0000-0000-00000000c102')
  returning id
) select id from inserted_category;

select is((select count(*) from category_created), 1::bigint, 'authorized accountant creates an expense category through RLS');
update public.expense_categories set name = 'Limpieza editada' where id = (select id from category_created);
select is((select name from public.expense_categories where id = (select id from category_created)), 'Limpieza editada', 'authorized accountant edits an expense category');
update public.expense_categories set is_active = false where id = (select id from category_created);
select is((select is_active from public.expense_categories where id = (select id from category_created)), false, 'authorized accountant archives an expense category without deletion');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000c103', true);
create temporary table board_member_update_attempt as
with attempted_update as (
  update public.expense_categories set name = 'Board member write attempt' where id = (select id from category_created) returning id
) select id from attempted_update;
select is((select count(*) from board_member_update_attempt), 0::bigint, 'board member cannot update an expense category despite authenticated table privileges');
select throws_ok(
  format('insert into public.expense_categories (condominium_id, code, name, created_by) values (%L::uuid, %L, %L, %L::uuid)', (select payload #>> '{condominium,id}' from category_workspace), 'board-member-write', 'Board member write attempt', '00000000-0000-0000-0000-00000000c103'),
  '42501', null, 'board member cannot create an expense category'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000c104', true);
select is((select count(*) from public.expense_categories where id = (select id from category_created)), 0::bigint, 'unrelated authenticated user cannot read another condominium category');
create temporary table outsider_update_attempt as
with attempted_update as (
  update public.expense_categories set name = 'Cross-tenant write attempt' where id = (select id from category_created) returning id
) select id from attempted_update;
select is((select count(*) from outsider_update_attempt), 0::bigint, 'unrelated authenticated user cannot update another condominium category');
select throws_ok(
  format('insert into public.expense_categories (condominium_id, code, name, created_by) values (%L::uuid, %L, %L, %L::uuid)', (select payload #>> '{condominium,id}' from category_workspace), 'outsider-write', 'Cross-tenant category write attempt', '00000000-0000-0000-0000-00000000c104'),
  '42501', null, 'unrelated authenticated user cannot create a category in another condominium'
);

select * from finish();
rollback;
