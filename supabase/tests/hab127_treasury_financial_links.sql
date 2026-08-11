begin;
select plan(11);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000012701',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'hab127-admin@test.local', 'x',
  '{"full_name":"HAB-127 Admin"}'::jsonb, now(), now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000012701', true);

create temporary table hab127_workspace as
select public.create_admin_workspace(
  'Habitta HAB-127 Test',
  'independent',
  'Condominio HAB-127',
  'VE',
  'Caracas',
  'America/Caracas',
  'USD',
  'VES',
  10,
  'Torre HAB-127'
) as payload;

create temporary table hab127_account as
select public.create_treasury_account(
  (select (payload #>> '{condominium,id}')::uuid from hab127_workspace),
  'Banco principal USD',
  'bank',
  'USD',
  'Banco HAB-127',
  '****1270',
  null
) as account;

reset role;

insert into public.units(
  id, condominium_id, building_id, code, type, status, created_by
) values (
  '00000000-0000-0000-0000-000000012702',
  (select (payload #>> '{condominium,id}')::uuid from hab127_workspace),
  (select (payload #>> '{building,id}')::uuid from hab127_workspace),
  'A-127', 'apartment', 'active',
  '00000000-0000-0000-0000-000000012701'
);

insert into public.condominium_payment_methods(
  id, condominium_id, method_type, display_name, currency_code,
  requires_reference, requires_proof, is_active, created_by
) values (
  '00000000-0000-0000-0000-000000012703',
  (select (payload #>> '{condominium,id}')::uuid from hab127_workspace),
  'cash', 'Pago HAB-127 USD', 'USD', false, false, true,
  '00000000-0000-0000-0000-000000012701'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000012701', true);

create temporary table hab127_payment as
select public.create_payment_draft(
  (select (payload #>> '{condominium,id}')::uuid from hab127_workspace),
  '00000000-0000-0000-0000-000000012702',
  '00000000-0000-0000-0000-000000012703',
  null,
  current_date,
  100.00,
  'USD',
  'Pagador HAB-127',
  'PAY-127',
  null,
  'hab127-payment-001'
) as payment;

select public.submit_payment(
  (select (payload #>> '{condominium,id}')::uuid from hab127_workspace),
  (select (payment).id from hab127_payment)
);
select public.payment_transition(
  (select (payload #>> '{condominium,id}')::uuid from hab127_workspace),
  (select (payment).id from hab127_payment),
  'under_review',
  null
);
select public.approve_payment(
  (select (payload #>> '{condominium,id}')::uuid from hab127_workspace),
  (select (payment).id from hab127_payment),
  '[]'::jsonb
);

select is(
  (
    select amount
    from public.treasury_movements
    where source_type = 'payment'
      and source_id = (select (payment).id from hab127_payment)
  ),
  100.00::numeric,
  'approved payment creates a treasury movement for the full payment amount'
);

select is(
  (
    select direction::text
    from public.treasury_movements
    where source_type = 'payment'
      and source_id = (select (payment).id from hab127_payment)
  ),
  'credit',
  'approved payment credits treasury'
);

select is(
  (
    select treasury_account_id
    from public.payments
    where id = (select (payment).id from hab127_payment)
  ),
  (select (account).id from hab127_account),
  'payment stores the treasury account snapshot used at approval'
);

select public.approve_payment(
  (select (payload #>> '{condominium,id}')::uuid from hab127_workspace),
  (select (payment).id from hab127_payment),
  '[]'::jsonb
);

select is(
  (
    select count(*)
    from public.treasury_movements
    where source_type = 'payment'
      and source_id = (select (payment).id from hab127_payment)
  ),
  1::bigint,
  'idempotent payment approval does not duplicate treasury movements'
);

select public.reverse_payment(
  (select (payload #>> '{condominium,id}')::uuid from hab127_workspace),
  (select (payment).id from hab127_payment),
  'Reverso HAB-127'
);

select is(
  (
    select direction::text
    from public.treasury_movements
    where reversal_of = (
      select id
      from public.treasury_movements
      where source_type = 'payment'
        and source_id = (select (payment).id from hab127_payment)
    )
  ),
  'debit',
  'payment reversal creates the opposite treasury movement'
);

select is(
  (
    select balance
    from public.get_treasury_accounts(
      (select (payload #>> '{condominium,id}')::uuid from hab127_workspace)
    )
    where id = (select (account).id from hab127_account)
  ),
  0.00::numeric,
  'payment plus reversal nets treasury back to zero'
);

create temporary table hab127_expense as
select public.create_expense(
  (select (payload #>> '{condominium,id}')::uuid from hab127_workspace),
  (
    select id
    from public.expense_categories
    where condominium_id = (select (payload #>> '{condominium,id}')::uuid from hab127_workspace)
      and code = 'maintenance'
  ),
  null,
  'Gasto HAB-127',
  'EXP-127',
  current_date,
  null,
  25.00,
  'USD',
  'Transferencia',
  'EXP-PAY-127',
  null,
  null
) as expense;

select public.transition_expense(
  (select (payload #>> '{condominium,id}')::uuid from hab127_workspace),
  (select (expense).id from hab127_expense),
  'submit', null, 1
);
select public.transition_expense(
  (select (payload #>> '{condominium,id}')::uuid from hab127_workspace),
  (select (expense).id from hab127_expense),
  'approve', null, 2
);
select public.transition_expense(
  (select (payload #>> '{condominium,id}')::uuid from hab127_workspace),
  (select (expense).id from hab127_expense),
  'mark_paid', null, 3
);

select is(
  (
    select amount
    from public.treasury_movements
    where source_type = 'expense'
      and source_id = (select (expense).id from hab127_expense)
  ),
  25.00::numeric,
  'paid expense creates a treasury movement for the expense amount'
);

select is(
  (
    select direction::text
    from public.treasury_movements
    where source_type = 'expense'
      and source_id = (select (expense).id from hab127_expense)
  ),
  'debit',
  'paid expense debits treasury'
);

select is(
  (
    select treasury_account_id
    from public.expenses
    where id = (select (expense).id from hab127_expense)
  ),
  (select (account).id from hab127_account),
  'expense stores the treasury account snapshot used when marked paid'
);

select is(
  (
    select balance
    from public.get_treasury_accounts(
      (select (payload #>> '{condominium,id}')::uuid from hab127_workspace)
    )
    where id = (select (account).id from hab127_account)
  ),
  -25.00::numeric,
  'treasury balance reflects the paid expense after the reversed payment nets to zero'
);

select public.create_treasury_account(
  (select (payload #>> '{condominium,id}')::uuid from hab127_workspace),
  'Caja secundaria USD',
  'cash',
  'USD',
  null,
  null,
  null
);

create temporary table hab127_ambiguous_payment as
select public.create_payment_draft(
  (select (payload #>> '{condominium,id}')::uuid from hab127_workspace),
  '00000000-0000-0000-0000-000000012702',
  '00000000-0000-0000-0000-000000012703',
  null,
  current_date,
  10.00,
  'USD',
  'Pagador ambiguo',
  'PAY-AMB-127',
  null,
  'hab127-payment-ambiguous'
) as payment;
select public.submit_payment(
  (select (payload #>> '{condominium,id}')::uuid from hab127_workspace),
  (select (payment).id from hab127_ambiguous_payment)
);
select public.payment_transition(
  (select (payload #>> '{condominium,id}')::uuid from hab127_workspace),
  (select (payment).id from hab127_ambiguous_payment),
  'under_review',
  null
);

select throws_like(
  format(
    'select public.approve_payment(%L::uuid,%L::uuid,%L::jsonb)',
    (select payload #>> '{condominium,id}' from hab127_workspace),
    (select (payment).id::text from hab127_ambiguous_payment),
    '[]'
  ),
  '%treasury account selection is required%',
  'Habitta refuses to guess when multiple active treasury accounts match the currency'
);

select * from finish();
rollback;
