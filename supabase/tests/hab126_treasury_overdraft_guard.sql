begin;
select plan(7);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000012601',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'hab126-admin@test.local', 'x',
  '{"full_name":"HAB-126 Admin"}'::jsonb, now(), now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000012601', true);

create temporary table hab126_workspace as
select public.create_admin_workspace(
  'Habitta HAB-126 Test',
  'independent',
  'Condominio HAB-126',
  'VE',
  'Caracas',
  'America/Caracas',
  'USD',
  'VES',
  10,
  'Torre HAB-126'
) as payload;

create temporary table hab126_source as
select public.create_treasury_account(
  (select (payload #>> '{condominium,id}')::uuid from hab126_workspace),
  'Banco origen USD', 'bank', 'USD', 'Banco HAB-126', '****1260', null
) as account;

create temporary table hab126_destination as
select public.create_treasury_account(
  (select (payload #>> '{condominium,id}')::uuid from hab126_workspace),
  'Caja destino USD', 'cash', 'USD', null, null, null
) as account;

select public.record_treasury_movement(
  (select (payload #>> '{condominium,id}')::uuid from hab126_workspace),
  (select (account).id from hab126_source),
  'credit', 'opening_balance', 100.00, current_date,
  'Saldo inicial HAB-126', null, 'opening_balance', null, 'hab126-opening-001'
);

select throws_ok(
  $$select public.record_treasury_movement(
    (select (payload #>> '{condominium,id}')::uuid from hab126_workspace),
    (select (account).id from hab126_source),
    'debit', 'withdrawal', 150.00, current_date,
    'Retiro sin confirmar', null, 'manual', null, 'hab126-withdraw-001'
  )$$,
  'P0001',
  'treasury overdraft confirmation required',
  'explicit withdrawal cannot overdraw without confirmation'
);

select lives_ok(
  $$select public.authorize_treasury_overdraft(
    (select (payload #>> '{condominium,id}')::uuid from hab126_workspace),
    (select (account).id from hab126_source),
    150.00, 'hab126-withdraw-001', 'Pago urgente autorizado por administración'
  )$$,
  'authorized manager can confirm an intentional overdraft'
);

select lives_ok(
  $$select public.record_treasury_movement(
    (select (payload #>> '{condominium,id}')::uuid from hab126_workspace),
    (select (account).id from hab126_source),
    'debit', 'withdrawal', 150.00, current_date,
    'Retiro confirmado', null, 'manual', null, 'hab126-withdraw-001'
  )$$,
  'confirmed withdrawal is recorded'
);

select is(
  (
    select balance
    from public.get_treasury_accounts(
      (select (payload #>> '{condominium,id}')::uuid from hab126_workspace)
    )
    where id = (select (account).id from hab126_source)
  ),
  -50.00::numeric,
  'confirmed withdrawal preserves the truthful negative balance'
);

select throws_ok(
  $$select public.create_treasury_transfer(
    (select (payload #>> '{condominium,id}')::uuid from hab126_workspace),
    (select (account).id from hab126_source),
    (select (account).id from hab126_destination),
    10.00, current_date, 'Transferencia sin confirmar', null, 'hab126-transfer-001'
  )$$,
  'P0001',
  'treasury overdraft confirmation required',
  'transfer cannot deepen a negative source account without confirmation'
);

select lives_ok(
  $$select public.authorize_treasury_overdraft(
    (select (payload #>> '{condominium,id}')::uuid from hab126_workspace),
    (select (account).id from hab126_source),
    10.00, 'hab126-transfer-001:out', 'Fondeo urgente de caja chica autorizado'
  )$$,
  'transfer overdraft can be authorized for its outgoing immutable movement'
);

select lives_ok(
  $$select public.create_treasury_transfer(
    (select (payload #>> '{condominium,id}')::uuid from hab126_workspace),
    (select (account).id from hab126_source),
    (select (account).id from hab126_destination),
    10.00, current_date, 'Transferencia confirmada', null, 'hab126-transfer-001'
  )$$,
  'confirmed transfer is recorded atomically'
);

select * from finish();
rollback;
