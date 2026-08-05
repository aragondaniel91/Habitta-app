begin;
select plan(18);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-0000000001a1',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'treasury-admin@test.local', 'x',
    '{"full_name":"Treasury Admin"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-0000000001a2',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'treasury-outsider@test.local', 'x',
    '{}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000001a1', true);

create temporary table treasury_workspace as
select public.create_admin_workspace(
  'Habitta Treasury Test',
  'independent',
  'Condominio Tesorería',
  'VE',
  'Caracas',
  'America/Caracas',
  'USD',
  'VES',
  10,
  'Torre Tesorería'
) as payload;

create temporary table treasury_accounts_created as
select 'bank_usd'::text as key, public.create_treasury_account(
  (select (payload #>> '{condominium,id}')::uuid from treasury_workspace),
  'Banco USD',
  'bank',
  'USD',
  'Banco de prueba',
  '****1234',
  null
) as account
union all
select 'cash_usd', public.create_treasury_account(
  (select (payload #>> '{condominium,id}')::uuid from treasury_workspace),
  'Caja USD',
  'cash',
  'USD',
  null,
  null,
  null
)
union all
select 'bank_ves', public.create_treasury_account(
  (select (payload #>> '{condominium,id}')::uuid from treasury_workspace),
  'Banco VES',
  'bank',
  'VES',
  'Banco de prueba',
  '****5678',
  null
);

select is(
  (select count(*) from public.treasury_accounts),
  3::bigint,
  'administrator creates bank and cash accounts by currency'
);
select is(
  (select count(*) from public.treasury_events where event_type = 'created'),
  3::bigint,
  'account creation is audited'
);

create temporary table treasury_opening as
select public.record_treasury_movement(
  (select (payload #>> '{condominium,id}')::uuid from treasury_workspace),
  (select (account).id from treasury_accounts_created where key = 'bank_usd'),
  'credit',
  'opening_balance',
  1000,
  current_date - 3,
  'Saldo inicial de la cuenta',
  'OPEN-001',
  'opening_balance',
  null,
  'treasury-test-opening-001'
) as movement;

select is(
  (select (movement).amount from treasury_opening),
  1000.00::numeric,
  'opening balance is recorded as an immutable movement'
);

create temporary table treasury_deposit as
select public.record_treasury_movement(
  (select (payload #>> '{condominium,id}')::uuid from treasury_workspace),
  (select (account).id from treasury_accounts_created where key = 'bank_usd'),
  'credit',
  'deposit',
  200,
  current_date - 2,
  'Depósito recibido',
  'DEP-001',
  'manual',
  null,
  'treasury-test-deposit-001'
) as movement;

select is(
  (
    select (public.record_treasury_movement(
      (select (payload #>> '{condominium,id}')::uuid from treasury_workspace),
      (select (account).id from treasury_accounts_created where key = 'bank_usd'),
      'credit',
      'deposit',
      200,
      current_date - 2,
      'Depósito recibido',
      'DEP-001',
      'manual',
      null,
      'treasury-test-deposit-001'
    )).id
  ),
  (select (movement).id from treasury_deposit),
  'movement idempotency returns the original record'
);
select is(
  (select count(*) from public.treasury_movements),
  2::bigint,
  'idempotent retry does not duplicate the movement'
);

create temporary table treasury_transfer as
select public.create_treasury_transfer(
  (select (payload #>> '{condominium,id}')::uuid from treasury_workspace),
  (select (account).id from treasury_accounts_created where key = 'bank_usd'),
  (select (account).id from treasury_accounts_created where key = 'cash_usd'),
  100,
  current_date - 1,
  'Fondo para caja menor',
  'TRF-001',
  'treasury-test-transfer-001'
) as transfer;

select is(
  (select count(*) from public.treasury_movements where transfer_id = (select (transfer).id from treasury_transfer)),
  2::bigint,
  'transfer creates one debit and one credit atomically'
);
select is(
  (select count(distinct currency_code) from public.treasury_movements where transfer_id is not null),
  1::bigint,
  'transfer movements preserve one currency'
);
select throws_like(
  format(
    'select public.create_treasury_transfer(%L::uuid,%L::uuid,%L::uuid,10,current_date,%L,null,%L)',
    (select payload #>> '{condominium,id}' from treasury_workspace),
    (select (account).id::text from treasury_accounts_created where key = 'bank_usd'),
    (select (account).id::text from treasury_accounts_created where key = 'bank_ves'),
    'Transferencia inválida',
    'treasury-test-cross-currency'
  ),
  '%cross-currency transfer requires an exchange operation%',
  'cross-currency transfers are rejected'
);

select is(
  (
    select balance
    from public.get_treasury_accounts(
      (select (payload #>> '{condominium,id}')::uuid from treasury_workspace)
    )
    where name = 'Banco USD'
  ),
  1100.00::numeric,
  'source account balance is derived from movements'
);
select is(
  (
    select balance
    from public.get_treasury_accounts(
      (select (payload #>> '{condominium,id}')::uuid from treasury_workspace)
    )
    where name = 'Caja USD'
  ),
  100.00::numeric,
  'destination account balance is derived independently'
);

create temporary table treasury_reversal as
select public.reverse_treasury_movement(
  (select (payload #>> '{condominium,id}')::uuid from treasury_workspace),
  (select (movement).id from treasury_deposit),
  'Depósito registrado por error',
  'treasury-test-reversal-001'
) as movement;

select is(
  (select (movement).direction from treasury_reversal),
  'debit'::public.treasury_movement_direction,
  'reversal uses the opposite direction'
);
select is(
  (
    select balance
    from public.get_treasury_accounts(
      (select (payload #>> '{condominium,id}')::uuid from treasury_workspace)
    )
    where name = 'Banco USD'
  ),
  900.00::numeric,
  'reversal corrects the balance without editing history'
);
select lives_ok(
  $test$
  do $block$
  begin
    begin
      update public.treasury_movements
      set amount = 9999
      where id = (select (movement).id from treasury_opening);
    exception when others then
      null;
    end;

    if (
      select amount from public.treasury_movements
      where id = (select (movement).id from treasury_opening)
    ) is distinct from 1000.00::numeric then
      raise exception 'treasury movement mutated';
    end if;
  end
  $block$
  $test$,
  'confirmed movements remain immutable'
);

create temporary table treasury_reconciliation as
select public.create_treasury_reconciliation(
  (select (payload #>> '{condominium,id}')::uuid from treasury_workspace),
  (select (account).id from treasury_accounts_created where key = 'bank_usd'),
  current_date - 10,
  current_date,
  0,
  900,
  'Conciliación de prueba'
) as reconciliation;

select lives_ok(
  format(
    'select public.match_treasury_movement(%L::uuid,%L::uuid,%L::uuid)',
    (select payload #>> '{condominium,id}' from treasury_workspace),
    (select (reconciliation).id::text from treasury_reconciliation),
    (select (movement).id::text from treasury_opening)
  ),
  'movement is linked to an open reconciliation'
);
select is(
  (
    select (public.close_treasury_reconciliation(
      (select (payload #>> '{condominium,id}')::uuid from treasury_workspace),
      (select (reconciliation).id from treasury_reconciliation)
    )).difference
  ),
  0.00::numeric,
  'reconciliation closes with the calculated book difference'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000001a2', true);
select is(
  (select count(*) from public.treasury_accounts),
  0::bigint,
  'outsider cannot read treasury accounts'
);
select is(
  (select count(*) from public.treasury_movements),
  0::bigint,
  'outsider cannot read treasury movements'
);
select throws_like(
  format(
    'select public.get_treasury_accounts(%L::uuid)',
    (select payload #>> '{condominium,id}' from treasury_workspace)
  ),
  '%treasury access denied%',
  'outsider cannot call treasury account summary'
);

select * from finish();
rollback;
