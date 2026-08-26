begin;
select plan(22);

select has_function(
  'public',
  'update_condominium_profile',
  array['uuid','text','text','text','text','text','text','text','text','text','text','text','text','text','text','text'],
  'condominium profile correction RPC exists'
);
select has_function(
  'public',
  'rename_organization',
  array['uuid','text'],
  'organization rename RPC exists'
);
select is(
  (select count(*) from pg_policies where schemaname='public' and tablename='condominiums' and cmd='UPDATE'),
  0::bigint,
  'no row level policy lets a client update condominiums outside the RPC'
);
select is(
  (select count(*) from pg_policies where schemaname='public' and tablename='organizations' and cmd='UPDATE'),
  0::bigint,
  'no row level policy lets a client update organizations outside the RPC'
);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000036001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab360-owner@test.local', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000036002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab360-board@test.local', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000036003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab360-admin@test.local', 'x', now(), now());

insert into public.organizations (id, name, created_by)
values ('36000000-0000-4000-8000-000000000001', 'HAB 360 Org', '00000000-0000-0000-0000-000000036001');

insert into public.condominiums (id, organization_id, name, created_by, country_code, city, timezone, primary_currency_code, address_line1)
values
  ('36010000-0000-4000-8000-000000000001', '36000000-0000-4000-8000-000000000001', 'Residencias HAB 360', '00000000-0000-0000-0000-000000036001', 'VE', 'Caracas', 'America/Caracas', 'USD', 'Av. Principal'),
  ('36010000-0000-4000-8000-000000000002', '36000000-0000-4000-8000-000000000001', 'Residencias Vecina', '00000000-0000-0000-0000-000000036001', 'VE', 'Caracas', 'America/Caracas', 'USD', 'Av. Secundaria');

insert into public.organization_memberships (organization_id, user_id, role)
values ('36000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000036001', 'organization_owner');

insert into public.condominium_memberships (condominium_id, user_id, role)
values
  ('36010000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000036001', 'condominium_admin'),
  ('36010000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000036002', 'board_member'),
  ('36010000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000036003', 'condominium_admin');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000036002', true);

select throws_ok(
  $$select public.update_condominium_profile('36010000-0000-4000-8000-000000000001','Intento board','VE','Av. Principal','Caracas','America/Caracas','USD')$$,
  'P0001',
  'permission denied',
  'a board member cannot correct the condominium profile'
);
select throws_ok(
  $$select public.rename_organization('36000000-0000-4000-8000-000000000001','Intento board')$$,
  'P0001',
  'organization owner required',
  'a board member cannot rename the organization'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000036001', true);

select lives_ok(
  $$select public.update_condominium_profile('36010000-0000-4000-8000-000000000001','Residencias HAB 360 Corregido','VE','Av. Principal 2','Valencia','America/Caracas','USD','VES','Condominio Residencias HAB 360 C.A.','RIF','J-12345678-9')$$,
  'administrator corrects the condominium profile'
);
select is(
  (select name from public.condominiums where id='36010000-0000-4000-8000-000000000001'),
  'Residencias HAB 360 Corregido',
  'the condominium can finally be renamed'
);
select is(
  (select legal_id_number from public.condominiums where id='36010000-0000-4000-8000-000000000001'),
  'J-12345678-9',
  'the legal identifier that belongs on receipts is correctable'
);
select is(
  (select secondary_currency_code from public.condominiums where id='36010000-0000-4000-8000-000000000001'),
  'VES',
  'the secondary currency is correctable'
);
select is(
  (select organization_id from public.condominiums where id='36010000-0000-4000-8000-000000000001'),
  '36000000-0000-4000-8000-000000000001'::uuid,
  'correcting the profile never moves the condominium to another organization'
);

select throws_ok(
  $$select public.update_condominium_profile('36010000-0000-4000-8000-000000000001','Residencias Vecina','VE','Av. Principal','Caracas','America/Caracas','USD')$$,
  'P0001',
  'condominium name already exists',
  'a duplicate name is reported as a domain error instead of a unique violation'
);
select throws_ok(
  $$select public.update_condominium_profile('36010000-0000-4000-8000-000000000001','   ','VE','Av. Principal','Caracas','America/Caracas','USD')$$,
  'P0001',
  'invalid condominium profile',
  'a blank name is rejected'
);
select throws_ok(
  $$select public.update_condominium_profile('36010000-0000-4000-8000-000000000001','Residencias HAB 360 Corregido','VE','Av. Principal','Caracas','America/Caracas','USD','USD')$$,
  'P0001',
  'invalid condominium profile',
  'the secondary currency cannot repeat the primary one'
);
select throws_ok(
  $$select public.update_condominium_profile('36010000-0000-4000-8000-000000000001','Residencias HAB 360 Corregido','VE','Av. Principal','Caracas','Marte/Olympus','USD')$$,
  'P0001',
  'invalid condominium timezone',
  'an unknown timezone is rejected'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000036003', true);
select lives_ok(
  $$select public.update_condominium_profile('36010000-0000-4000-8000-000000000001','Residencias HAB 360 Corregido','VE','Av. Principal 2','Valencia','America/Caracas','USD','VES','Condominio Residencias HAB 360 C.A.','RIF','J-12345678-9')$$,
  'a condominium administrator corrects their own condominium'
);
select throws_ok(
  $$select public.update_condominium_profile('36010000-0000-4000-8000-000000000002','Otro condominio','VE','Av. Principal','Caracas','America/Caracas','USD')$$,
  'P0001',
  'permission denied',
  'a condominium administrator cannot edit a sibling condominium'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000036001', true);

select lives_ok(
  $$select public.rename_organization('36000000-0000-4000-8000-000000000001','HAB 360 Administradora')$$,
  'the organization owner renames the organization'
);
select is(
  (select name from public.organizations where id='36000000-0000-4000-8000-000000000001'),
  'HAB 360 Administradora',
  'the organization name is corrected'
);
select throws_ok(
  $$select public.rename_organization('36000000-0000-4000-8000-000000000001','  ')$$,
  'P0001',
  'invalid organization name',
  'a blank organization name is rejected'
);

-- Row level security matches no row instead of raising, so the proof is that nothing changed.
update public.condominiums set name='bypass' where id='36010000-0000-4000-8000-000000000001';
update public.organizations set name='bypass' where id='36000000-0000-4000-8000-000000000001';
select is(
  (select name from public.condominiums where id='36010000-0000-4000-8000-000000000001'),
  'Residencias HAB 360 Corregido',
  'a direct condominium update outside the RPC changes nothing'
);
select is(
  (select name from public.organizations where id='36000000-0000-4000-8000-000000000001'),
  'HAB 360 Administradora',
  'a direct organization update outside the RPC changes nothing'
);

select * from finish();
rollback;
