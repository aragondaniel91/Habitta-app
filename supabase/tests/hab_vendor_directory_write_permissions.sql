begin;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-00000000d101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vendor-workspace-owner@test.local', 'x', '{"full_name":"Vendor workspace owner"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000d102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vendor-admin@test.local', 'x', '{"full_name":"Vendor condominium admin"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000d103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vendor-outsider@test.local', 'x', '{}'::jsonb, now(), now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000d101', true);
create temporary table vendor_workspace as
select public.create_admin_workspace('Vendor permission test organization', 'independent', 'Vendor permission test condominium', 'VE', 'Caracas', 'America/Caracas', 'USD', 'VES', 10, 'Vendor permission test tower') as payload;
reset role;

insert into public.condominium_memberships (condominium_id, user_id, role)
values ((select (payload #>> '{condominium,id}')::uuid from vendor_workspace), '00000000-0000-0000-0000-00000000d102', 'condominium_admin');

select ok(has_table_privilege('authenticated', 'public.vendors', 'INSERT'), 'authenticated has vendor INSERT privilege before RLS evaluation');
select ok(has_table_privilege('authenticated', 'public.vendors', 'UPDATE'), 'authenticated has vendor UPDATE privilege before RLS evaluation');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000d102', true);
create temporary table vendor_created as
with inserted_vendor as (
  insert into public.vendors (condominium_id, name, email, created_by)
  values ((select (payload #>> '{condominium,id}')::uuid from vendor_workspace), 'Proveedor de prueba', 'vendor@test.local', '00000000-0000-0000-0000-00000000d102')
  returning id
) select id from inserted_vendor;

select is((select count(*) from vendor_created), 1::bigint, 'authorized condominium administrator creates a vendor through RLS');
update public.vendors set name = 'Proveedor editado' where id = (select id from vendor_created);
select is((select name from public.vendors where id = (select id from vendor_created)), 'Proveedor editado', 'authorized condominium administrator edits a vendor');
update public.vendors set is_active = false where id = (select id from vendor_created);
select is((select is_active from public.vendors where id = (select id from vendor_created)), false, 'authorized condominium administrator archives without deletion');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000d103', true);
select is((select count(*) from public.vendors where id = (select id from vendor_created)), 0::bigint, 'unrelated authenticated user cannot read another condominium vendor');
create temporary table outsider_update_attempt as
with attempted_update as (
  update public.vendors set name = 'Cross-tenant write attempt' where id = (select id from vendor_created) returning id
) select id from attempted_update;
select is((select count(*) from outsider_update_attempt), 0::bigint, 'unrelated authenticated user cannot update another condominium vendor');
select throws_ok(
  format('insert into public.vendors (condominium_id, name, created_by) values (%L::uuid, %L, %L::uuid)', (select payload #>> '{condominium,id}' from vendor_workspace), 'Cross-tenant vendor write attempt', '00000000-0000-0000-0000-00000000d103'),
  '42501', null, 'unrelated authenticated user cannot create a vendor in another condominium'
);

select * from finish();
rollback;
