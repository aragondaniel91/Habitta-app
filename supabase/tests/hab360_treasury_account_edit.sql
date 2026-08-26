begin;
select plan(20);

select has_function(
  'public',
  'update_treasury_account',
  array['uuid','uuid','text','public.treasury_account_type','text','text','text','text','boolean'],
  'treasury account correction RPC exists'
);
select is(
  (select count(*) from pg_policies where schemaname='public' and tablename='treasury_accounts' and cmd='UPDATE'),
  0::bigint,
  'no row level policy lets a client update treasury accounts outside the RPC'
);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000036101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab360t-admin@test.local', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000036102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab360t-board@test.local', 'x', now(), now());

insert into public.organizations (id, name, created_by)
values ('36100000-0000-4000-8000-000000000001', 'HAB 360T Org', '00000000-0000-0000-0000-000000036101');

insert into public.condominiums (id, organization_id, name, created_by)
values
  ('36110000-0000-4000-8000-000000000001', '36100000-0000-4000-8000-000000000001', 'HAB 360T Condo', '00000000-0000-0000-0000-000000036101'),
  ('36110000-0000-4000-8000-000000000002', '36100000-0000-4000-8000-000000000001', 'HAB 360T Vecino', '00000000-0000-0000-0000-000000036101');

insert into public.organization_memberships (organization_id, user_id, role)
values ('36100000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000036101', 'organization_owner');

insert into public.condominium_memberships (condominium_id, user_id, role)
values
  ('36110000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000036101', 'condominium_admin'),
  ('36110000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000036102', 'board_member');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000036101', true);

select lives_ok(
  $$select public.create_treasury_account('36110000-0000-4000-8000-000000000001','Cuenta operativa','bank','USD','Banco Original','0102-1111')$$,
  'administrator creates the treasury account'
);
select lives_ok(
  $$select public.create_treasury_account('36110000-0000-4000-8000-000000000001','Caja chica','cash','USD',null,null)$$,
  'administrator creates a cash account'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000036102', true);
select throws_ok(
  $$select public.update_treasury_account('36110000-0000-4000-8000-000000000001',(select id from public.treasury_accounts where name='Cuenta operativa'),'Intento board','bank','USD','Banco Original','0102-1111')$$,
  'P0001',
  'treasury management denied',
  'a board member cannot correct a treasury account'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000036101', true);

select lives_ok(
  $$select public.update_treasury_account('36110000-0000-4000-8000-000000000001',(select id from public.treasury_accounts where name='Cuenta operativa'),'Cuenta operativa principal','bank','USD','Banco Corregido','0102-2222','Nota corregida')$$,
  'descriptive fields are correctable'
);
select is(
  (select bank_name from public.treasury_accounts where name='Cuenta operativa principal'),
  'Banco Corregido',
  'the institution is corrected'
);
select is(
  (select version from public.treasury_accounts where name='Cuenta operativa principal'),
  2,
  'the optimistic version advances with every correction'
);
select is(
  (select count(*) from public.treasury_events where entity_type='account' and event_type='updated'
     and entity_id=(select id from public.treasury_accounts where name='Cuenta operativa principal')),
  1::bigint,
  'the correction is recorded in the treasury audit trail'
);

select throws_ok(
  $$select public.update_treasury_account('36110000-0000-4000-8000-000000000001',(select id from public.treasury_accounts where name='Caja chica'),'Caja chica','cash','USD','Banco Inventado')$$,
  'P0001',
  'cash accounts cannot have a bank name',
  'a cash account still cannot claim a bank'
);
select throws_ok(
  $$select public.update_treasury_account('36110000-0000-4000-8000-000000000001',(select id from public.treasury_accounts where name='Cuenta operativa principal'),'X','bank','USD','Banco Corregido')$$,
  'P0001',
  'invalid treasury account',
  'a one character name is rejected'
);
select throws_ok(
  $$select public.update_treasury_account('36110000-0000-4000-8000-000000000002',(select id from public.treasury_accounts where name='Cuenta operativa principal'),'Otro condominio','bank','USD','Banco Corregido')$$,
  'P0001',
  'treasury account unavailable',
  'an account cannot be reached through a sibling condominium'
);

-- Once money has moved, the currency and the nature of the account are settled facts.
select lives_ok(
  $$select public.record_treasury_movement('36110000-0000-4000-8000-000000000001',(select id from public.treasury_accounts where name='Cuenta operativa principal'),'credit','deposit',150.00,current_date,'Deposito inicial',null,'manual',null,'hab360t-mov-1')$$,
  'a movement is recorded against the account'
);
select throws_ok(
  $$select public.update_treasury_account('36110000-0000-4000-8000-000000000001',(select id from public.treasury_accounts where name='Cuenta operativa principal'),'Cuenta operativa principal','bank','VES','Banco Corregido')$$,
  'P0001',
  'treasury account has movements',
  'the currency cannot be reinterpreted once money moved'
);
select throws_ok(
  $$select public.update_treasury_account('36110000-0000-4000-8000-000000000001',(select id from public.treasury_accounts where name='Cuenta operativa principal'),'Cuenta operativa principal','cash','USD',null)$$,
  'P0001',
  'treasury account has movements',
  'the account type cannot be reinterpreted once money moved'
);
select lives_ok(
  $$select public.update_treasury_account('36110000-0000-4000-8000-000000000001',(select id from public.treasury_accounts where name='Cuenta operativa principal'),'Cuenta operativa corregida','bank','USD','Banco Corregido','0102-3333')$$,
  'descriptive fields stay correctable after movements exist'
);

select throws_ok(
  $$select public.update_treasury_account('36110000-0000-4000-8000-000000000001',(select id from public.treasury_accounts where name='Cuenta operativa corregida'),'Cuenta operativa corregida','bank','USD','Banco Corregido','0102-3333',null,false)$$,
  'P0001',
  'treasury account still holds a balance',
  'an account holding money cannot be archived'
);
select lives_ok(
  $$select public.update_treasury_account('36110000-0000-4000-8000-000000000001',(select id from public.treasury_accounts where name='Caja chica'),'Caja chica','cash','USD',null,null,null,false)$$,
  'an empty account can be archived instead of deleted'
);
select is(
  (select is_active from public.treasury_accounts where name='Caja chica'),
  false,
  'archiving deactivates rather than deletes'
);

select throws_ok(
  $$update public.treasury_accounts set name='bypass' where name='Cuenta operativa corregida'$$,
  '42501',
  'permission denied for table treasury_accounts',
  'authenticated clients cannot bypass the RPC with a direct account update'
);

select * from finish();
rollback;
