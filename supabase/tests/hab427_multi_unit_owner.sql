begin;
select plan(24);

-- HAB-427: an owner with more than one unit in the same condominium.
--
-- Two things are pinned here. First, that `get_resident_financial_units` answers "what do MY units
-- owe" -- per unit, per currency, from the ledger -- and answers it for exactly the units the
-- caller may already read financially, no more and no fewer. Second, that `can_submit_payment`
-- agrees with `can_read_financial_unit` about what an active relationship is: it used to ask only
-- for `ends_at is null`, so an owner who had agreed a sale for next month lost the ability to pay
-- this month's dues, while an owner whose title starts next month could already pay.
--
-- The fixture is deliberately awkward: two currencies on one unit, an overpayment on another, a
-- unit with no movement at all, and three relationships that must not count. A suite that only
-- covers the happy unit proves the function returns rows, not that it returns the right ones.

-- The condominium is created by an operator who is not the resident under test. If the resident
-- were also the organization owner, `can_manage_people` would short-circuit every negative
-- assertion below into a pass.
insert into auth.users(id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('42700000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'operator@hab427.test', 'x', now(), now()),
  ('42700000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'owner@hab427.test', 'x', now(), now()),
  ('42700000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'stale@hab427.test', 'x', now(), now()),
  ('42700000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'neighbour@hab427.test', 'x', now(), now());

insert into public.organizations(id, name, created_by)
values ('42710000-0000-4000-8000-000000000001', 'Org HAB-427',
        '42700000-0000-4000-8000-000000000001');

insert into public.condominiums(id, organization_id, name, created_by)
values
  ('42720000-0000-4000-8000-000000000001', '42710000-0000-4000-8000-000000000001',
   'Condo A HAB-427', '42700000-0000-4000-8000-000000000001'),
  ('42720000-0000-4000-8000-000000000002', '42710000-0000-4000-8000-000000000001',
   'Condo B HAB-427', '42700000-0000-4000-8000-000000000001');

insert into public.units(id, condominium_id, code, type, status, created_by)
values
  ('42730000-0000-4000-8000-0000000000a1', '42720000-0000-4000-8000-000000000001', 'A1',
   'apartment', 'active', '42700000-0000-4000-8000-000000000001'),
  ('42730000-0000-4000-8000-0000000000a2', '42720000-0000-4000-8000-000000000001', 'A2',
   'apartment', 'active', '42700000-0000-4000-8000-000000000001'),
  ('42730000-0000-4000-8000-0000000000a3', '42720000-0000-4000-8000-000000000001', 'A3',
   'apartment', 'active', '42700000-0000-4000-8000-000000000001'),
  ('42730000-0000-4000-8000-0000000000a4', '42720000-0000-4000-8000-000000000001', 'A4',
   'apartment', 'active', '42700000-0000-4000-8000-000000000001'),
  ('42730000-0000-4000-8000-0000000000a5', '42720000-0000-4000-8000-000000000001', 'A5',
   'apartment', 'active', '42700000-0000-4000-8000-000000000001'),
  ('42730000-0000-4000-8000-0000000000a6', '42720000-0000-4000-8000-000000000001', 'A6',
   'apartment', 'active', '42700000-0000-4000-8000-000000000001'),
  ('42730000-0000-4000-8000-0000000000a7', '42720000-0000-4000-8000-000000000001', 'A7',
   'apartment', 'active', '42700000-0000-4000-8000-000000000001'),
  ('42730000-0000-4000-8000-0000000000b1', '42720000-0000-4000-8000-000000000002', 'B1',
   'apartment', 'active', '42700000-0000-4000-8000-000000000001');

insert into public.people(id, condominium_id, first_name, last_name, status, auth_user_id, created_by)
values
  ('42740000-0000-4000-8000-000000000001', '42720000-0000-4000-8000-000000000001',
   'Multi', 'Propietario', 'active', '42700000-0000-4000-8000-000000000002',
   '42700000-0000-4000-8000-000000000001'),
  ('42740000-0000-4000-8000-000000000002', '42720000-0000-4000-8000-000000000001',
   'Sin', 'Unidades', 'active', '42700000-0000-4000-8000-000000000003',
   '42700000-0000-4000-8000-000000000001'),
  ('42740000-0000-4000-8000-000000000003', '42720000-0000-4000-8000-000000000002',
   'Vecino', 'Ajeno', 'active', '42700000-0000-4000-8000-000000000004',
   '42700000-0000-4000-8000-000000000001');

-- Resident memberships, not staff ones: `owner` here is the residential role, so nothing below
-- passes through `can_manage_people`.
insert into public.condominium_memberships(condominium_id, user_id, role)
values
  ('42720000-0000-4000-8000-000000000001', '42700000-0000-4000-8000-000000000002', 'owner'),
  ('42720000-0000-4000-8000-000000000001', '42700000-0000-4000-8000-000000000003', 'owner'),
  ('42720000-0000-4000-8000-000000000002', '42700000-0000-4000-8000-000000000004', 'owner');

-- A1 and A4: plain active ownership.
-- A2: active today, but sold with effect next month. The window fix is what keeps this payable.
-- A5: title starts next month -- not yet an owner.
-- A6: sold last month -- no longer an owner.
insert into public.unit_owners(unit_id, person_id, starts_at, ends_at, created_by)
values
  ('42730000-0000-4000-8000-0000000000a1', '42740000-0000-4000-8000-000000000001',
   current_date - 400, null, '42700000-0000-4000-8000-000000000001'),
  ('42730000-0000-4000-8000-0000000000a2', '42740000-0000-4000-8000-000000000001',
   current_date - 200, current_date + 30, '42700000-0000-4000-8000-000000000001'),
  ('42730000-0000-4000-8000-0000000000a4', '42740000-0000-4000-8000-000000000001',
   current_date - 100, null, '42700000-0000-4000-8000-000000000001'),
  ('42730000-0000-4000-8000-0000000000a5', '42740000-0000-4000-8000-000000000001',
   current_date + 30, null, '42700000-0000-4000-8000-000000000001'),
  ('42730000-0000-4000-8000-0000000000a6', '42740000-0000-4000-8000-000000000001',
   current_date - 400, current_date - 30, '42700000-0000-4000-8000-000000000001');

-- The same person, on two other units, in the two relationships that carry no financial standing.
insert into public.unit_occupancies(unit_id, person_id, occupancy_type, starts_at, created_by)
values
  ('42730000-0000-4000-8000-0000000000a3', '42740000-0000-4000-8000-000000000001',
   'family_member', current_date - 50, '42700000-0000-4000-8000-000000000001'),
  ('42730000-0000-4000-8000-0000000000a7', '42740000-0000-4000-8000-000000000001',
   'authorized_occupant', current_date - 50, '42700000-0000-4000-8000-000000000001');

insert into public.unit_owners(unit_id, person_id, starts_at, created_by)
values ('42730000-0000-4000-8000-0000000000b1', '42740000-0000-4000-8000-000000000003',
        current_date - 100, '42700000-0000-4000-8000-000000000001');

-- Charges. A1 carries two currencies; A3 and B1 carry real money so that "returns nothing" below
-- means denial rather than an empty table.
insert into public.receivable_items(
  id, condominium_id, unit_id, item_type, description, issue_date, due_date, currency_code,
  original_amount, created_by)
values
  ('42750000-0000-4000-8000-000000000001', '42720000-0000-4000-8000-000000000001',
   '42730000-0000-4000-8000-0000000000a1', 'charge', 'Cuota vencida A1', current_date - 40,
   current_date - 10, 'USD', 60.00, '42700000-0000-4000-8000-000000000001'),
  ('42750000-0000-4000-8000-000000000002', '42720000-0000-4000-8000-000000000001',
   '42730000-0000-4000-8000-0000000000a1', 'charge', 'Cuota por vencer A1', current_date,
   current_date + 10, 'USD', 40.00, '42700000-0000-4000-8000-000000000001'),
  ('42750000-0000-4000-8000-000000000003', '42720000-0000-4000-8000-000000000001',
   '42730000-0000-4000-8000-0000000000a1', 'charge', 'Cuota bolivares A1', current_date,
   current_date + 10, 'VES', 200.00, '42700000-0000-4000-8000-000000000001'),
  ('42750000-0000-4000-8000-000000000004', '42720000-0000-4000-8000-000000000001',
   '42730000-0000-4000-8000-0000000000a2', 'charge', 'Cuota A2', current_date - 40,
   current_date - 10, 'USD', 50.00, '42700000-0000-4000-8000-000000000001'),
  ('42750000-0000-4000-8000-000000000005', '42720000-0000-4000-8000-000000000001',
   '42730000-0000-4000-8000-0000000000a3', 'charge', 'Cuota A3', current_date - 40,
   current_date - 10, 'USD', 90.00, '42700000-0000-4000-8000-000000000001'),
  ('42750000-0000-4000-8000-000000000006', '42720000-0000-4000-8000-000000000002',
   '42730000-0000-4000-8000-0000000000b1', 'charge', 'Cuota B1', current_date - 40,
   current_date - 10, 'USD', 70.00, '42700000-0000-4000-8000-000000000001');

insert into public.receivable_ledger_entries(
  condominium_id, unit_id, receivable_item_id, entry_type, direction, amount, currency_code,
  effective_date, description, created_by)
values
  ('42720000-0000-4000-8000-000000000001', '42730000-0000-4000-8000-0000000000a1',
   '42750000-0000-4000-8000-000000000001', 'charge', 'debit', 60.00, 'USD', current_date - 40,
   'Cargo A1 vencido', '42700000-0000-4000-8000-000000000001'),
  ('42720000-0000-4000-8000-000000000001', '42730000-0000-4000-8000-0000000000a1',
   '42750000-0000-4000-8000-000000000002', 'charge', 'debit', 40.00, 'USD', current_date,
   'Cargo A1 por vencer', '42700000-0000-4000-8000-000000000001'),
  ('42720000-0000-4000-8000-000000000001', '42730000-0000-4000-8000-0000000000a1',
   '42750000-0000-4000-8000-000000000001', 'payment_credit', 'credit', 30.00, 'USD',
   current_date - 5, 'Abono parcial A1', '42700000-0000-4000-8000-000000000001'),
  ('42720000-0000-4000-8000-000000000001', '42730000-0000-4000-8000-0000000000a1',
   '42750000-0000-4000-8000-000000000003', 'charge', 'debit', 200.00, 'VES', current_date,
   'Cargo A1 en bolivares', '42700000-0000-4000-8000-000000000001'),
  ('42720000-0000-4000-8000-000000000001', '42730000-0000-4000-8000-0000000000a2',
   '42750000-0000-4000-8000-000000000004', 'charge', 'debit', 50.00, 'USD', current_date - 40,
   'Cargo A2', '42700000-0000-4000-8000-000000000001'),
  ('42720000-0000-4000-8000-000000000001', '42730000-0000-4000-8000-0000000000a2',
   '42750000-0000-4000-8000-000000000004', 'payment_credit', 'credit', 50.00, 'USD',
   current_date - 5, 'Pago A2', '42700000-0000-4000-8000-000000000001'),
  -- Overpayment with nothing left to apply it to: it belongs to the unit, not to any charge.
  ('42720000-0000-4000-8000-000000000001', '42730000-0000-4000-8000-0000000000a2',
   null, 'adjustment_credit', 'credit', 30.00, 'USD', current_date - 5,
   'Excedente a favor A2', '42700000-0000-4000-8000-000000000001'),
  ('42720000-0000-4000-8000-000000000001', '42730000-0000-4000-8000-0000000000a3',
   '42750000-0000-4000-8000-000000000005', 'charge', 'debit', 90.00, 'USD', current_date - 40,
   'Cargo A3', '42700000-0000-4000-8000-000000000001'),
  ('42720000-0000-4000-8000-000000000002', '42730000-0000-4000-8000-0000000000b1',
   '42750000-0000-4000-8000-000000000006', 'charge', 'debit', 70.00, 'USD', current_date - 40,
   'Cargo B1', '42700000-0000-4000-8000-000000000001');

-- The fixture is only evidence if the money is really there.
select is(
  (select count(*)::integer from public.receivable_ledger_entries
   where unit_id in ('42730000-0000-4000-8000-0000000000a3',
                     '42730000-0000-4000-8000-0000000000b1')),
  2,
  'the units that must stay invisible really do carry ledger movements'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '42700000-0000-4000-8000-000000000002', 'role', 'authenticated')::text,
  true
);

-- ------------------------------------------------------------------ scope

select set_eq(
  $q$select distinct unit_id::text
       from public.get_resident_financial_units('42720000-0000-4000-8000-000000000001')$q$,
  $q$values ('42730000-0000-4000-8000-0000000000a1'),
           ('42730000-0000-4000-8000-0000000000a2'),
           ('42730000-0000-4000-8000-0000000000a4')$q$,
  'the owner sees exactly the three units they own today'
);

select is(
  (select count(*)::integer
     from public.get_resident_financial_units('42720000-0000-4000-8000-000000000001')
    where unit_id = '42730000-0000-4000-8000-0000000000a3'),
  0,
  'a family_member relation does not make a unit financially visible'
);

select is(
  (select count(*)::integer
     from public.get_resident_financial_units('42720000-0000-4000-8000-000000000001')
    where unit_id = '42730000-0000-4000-8000-0000000000a7'),
  0,
  'an authorized_occupant relation does not make a unit financially visible'
);

select is(
  (select count(*)::integer
     from public.get_resident_financial_units('42720000-0000-4000-8000-000000000001')
    where unit_id in ('42730000-0000-4000-8000-0000000000a5',
                      '42730000-0000-4000-8000-0000000000a6')),
  0,
  'ownership that has not started, or has already ended, shows nothing'
);

select is(
  (select count(*)::integer
     from public.get_resident_financial_units('42720000-0000-4000-8000-000000000002')),
  0,
  'asking about a condominium the caller has no unit in returns nothing at all'
);

-- ------------------------------------------------------------------ money

select is(
  (select count(*)::integer
     from public.get_resident_financial_units('42720000-0000-4000-8000-000000000001')
    where unit_id = '42730000-0000-4000-8000-0000000000a1'),
  2,
  'a unit charged in two currencies reports one row per currency'
);

select results_eq(
  $q$select currency_code, total_debits, total_credits, net_outstanding
       from public.get_resident_financial_units('42720000-0000-4000-8000-000000000001')
      where unit_id = '42730000-0000-4000-8000-0000000000a1'
      order by currency_code$q$,
  $q$values ('USD', '100.00', '30.00', '70.00'),
           ('VES', '200.00', '0.00', '200.00')$q$,
  'each currency keeps its own debits, credits and balance, and they are never added together'
);

select results_eq(
  $q$select overdue_amount, upcoming_amount
       from public.get_resident_financial_units('42720000-0000-4000-8000-000000000001')
      where unit_id = '42730000-0000-4000-8000-0000000000a1'
        and currency_code = 'USD'$q$,
  $q$values ('30.00', '40.00')$q$,
  'the aging split follows receivable_aging_date, net of what was already paid'
);

select is(
  (select net_outstanding
     from public.get_resident_financial_units('42720000-0000-4000-8000-000000000001')
    where unit_id = '42730000-0000-4000-8000-0000000000a2'),
  '-30.00',
  'an overpayment leaves the unit with a credit balance, not a zero one'
);

-- The point of taking the balance from the ledger rather than from open receivables: A2 has no
-- outstanding charge at all, so summing receivables would report 0.00 and lose the 30.00 the
-- condominium owes back.
select is(
  (select coalesce(sum(b.outstanding_amount::numeric), 0)
     from public.receivable_balances b
    where b.unit_id = '42730000-0000-4000-8000-0000000000a2'
      and b.status not in ('settled', 'reversed')),
  0::numeric,
  'summing open receivables would have hidden that credit balance entirely'
);

select results_eq(
  $q$select currency_code, total_debits, net_outstanding, overdue_amount, upcoming_amount
       from public.get_resident_financial_units('42720000-0000-4000-8000-000000000001')
      where unit_id = '42730000-0000-4000-8000-0000000000a4'$q$,
  $q$values (null::text, '0.00', '0.00', '0.00', '0.00')$q$,
  'a unit with no movement is still listed once, with no currency and zeros'
);

select is(
  (select count(*)::integer
     from public.get_resident_financial_units('42720000-0000-4000-8000-000000000001')
    where unit_id = '42730000-0000-4000-8000-0000000000a4'),
  1,
  'and it is listed exactly once, not once per currency in use elsewhere'
);

-- The consolidated view keeps its own function; the two must agree about the same money.
select is(
  (select net_outstanding from public.get_receivables_summary(
     '42720000-0000-4000-8000-000000000001') where currency_code = 'USD'),
  (select to_char(sum(net_outstanding::numeric), 'FM999999999999990.00')
     from public.get_resident_financial_units('42720000-0000-4000-8000-000000000001')
    where currency_code = 'USD'),
  'the per-unit rows add up to exactly what the consolidated summary reports'
);

-- ------------------------------------------------------------------ who may pay

select ok(
  (select can_submit_payment
     from public.get_resident_financial_units('42720000-0000-4000-8000-000000000001')
    where unit_id = '42730000-0000-4000-8000-0000000000a1' and currency_code = 'USD'),
  'the flag the interface reads is the backend capability itself, not an assumption'
);

select ok(
  public.can_submit_payment('42730000-0000-4000-8000-0000000000a2'),
  'an owner who has agreed a sale for next month may still pay this month'
);

select ok(
  not public.can_submit_payment('42730000-0000-4000-8000-0000000000a5'),
  'an owner whose title starts next month may not pay yet'
);

select ok(
  not public.can_submit_payment('42730000-0000-4000-8000-0000000000a6'),
  'an owner who sold last month may no longer pay'
);

select ok(
  not public.can_submit_payment('42730000-0000-4000-8000-0000000000a3'),
  'a family member may not submit a payment'
);

select ok(
  not public.can_submit_payment('42730000-0000-4000-8000-0000000000a7'),
  'an authorized occupant may not submit a payment'
);

select throws_ok(
  $q$select public.create_payment_draft(
       '42720000-0000-4000-8000-000000000001',
       '42730000-0000-4000-8000-0000000000a3',
       null, null, current_date, 10.00, 'USD', 'Pagador', null, null,
       'hab427-unauthorized')$q$,
  null, null,
  'and the write path refuses that unit rather than trusting the interface'
);

-- ------------------------------------------------------------------ statements

select ok(
  (select count(*) > 0 from public.get_unit_statement(
     '42720000-0000-4000-8000-000000000001', '42730000-0000-4000-8000-0000000000a1')),
  'the existing statement RPC still serves an owned unit'
);

-- The statement filters rather than raising, the way every other financial read here does. What
-- matters is that not one line of A3's account comes back, so the emptiness is the denial.
select is(
  (select count(*)::integer from public.get_unit_statement(
     '42720000-0000-4000-8000-000000000001', '42730000-0000-4000-8000-0000000000a3')),
  0,
  'and reveals nothing about a unit the caller only occupies as family'
);

-- ------------------------------------------------------------------ membership is not a unit

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '42700000-0000-4000-8000-000000000003', 'role', 'authenticated')::text,
  true
);

select is(
  (select count(*)::integer
     from public.get_resident_financial_units('42720000-0000-4000-8000-000000000001')),
  0,
  'belonging to the condominium without owning or occupying a unit reveals no unit at all'
);

reset role;
select * from finish();
rollback;
