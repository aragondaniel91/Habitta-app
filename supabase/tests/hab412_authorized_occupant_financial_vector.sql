begin;
select plan(12);

-- HAB-412 regression: an authorized occupant must never reach financial data.
--
-- `can_read_financial_unit` shipped with `authorized_occupant` inside its occupancy allowlist, and
-- it does not require a condominium membership at all. It asks only for
--
--   people.auth_user_id = auth.uid(), the person active, the unit active,
--   and an active occupancy of an allowed type
--
-- so the vector is reachable by anyone whose `people` row already carries an `auth_user_id` --
-- linked through any legitimate access -- who also appears as an authorized occupant on some unit.
-- Whether Production holds such a row today is not asserted here; that it is structurally
-- reachable is, and that is what this file pins shut.
--
-- Written before the fix and confirmed to fail against the old body, so the assertions below are
-- evidence rather than decoration. HAB-418 would have turned this from reachable into routine, by
-- linking exactly these people to authenticated users.

insert into auth.users(id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('41200000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'occupant@hab412.test', 'x', now(), now());

insert into public.organizations(id, name, created_by)
values ('41210000-0000-4000-8000-000000000001', 'Org HAB-412', '41200000-0000-4000-8000-000000000001');

insert into public.condominiums(id, organization_id, name, created_by)
values ('41220000-0000-4000-8000-000000000001', '41210000-0000-4000-8000-000000000001',
        'Condo HAB-412', '41200000-0000-4000-8000-000000000001');

insert into public.units(id, condominium_id, code, type, status, created_by)
values ('41230000-0000-4000-8000-000000000001', '41220000-0000-4000-8000-000000000001',
        '1A', 'apartment', 'active', '41200000-0000-4000-8000-000000000001');

-- The person is active and already bound to an authenticated user, which is the precondition the
-- helper actually checks. No condominium membership is created: the vector never needed one.
insert into public.people(id, condominium_id, first_name, last_name, status, auth_user_id, created_by)
values ('41240000-0000-4000-8000-000000000001', '41220000-0000-4000-8000-000000000001',
        'Ocupante', 'Autorizado', 'active', '41200000-0000-4000-8000-000000000001',
        '41200000-0000-4000-8000-000000000001');

insert into public.unit_occupancies(unit_id, person_id, occupancy_type, starts_at, created_by)
values ('41230000-0000-4000-8000-000000000001', '41240000-0000-4000-8000-000000000001',
        'authorized_occupant', current_date - 30, '41200000-0000-4000-8000-000000000001');

-- Real financial rows for that unit. Without them every "returns nothing" assertion below would
-- pass against an empty table and prove nothing at all.
insert into public.receivable_items(
  id, condominium_id, unit_id, item_type, description, issue_date, currency_code,
  original_amount, created_by)
values ('41250000-0000-4000-8000-000000000001', '41220000-0000-4000-8000-000000000001',
        '41230000-0000-4000-8000-000000000001', 'charge', 'Cuota HAB-412', current_date,
        'USD', 100.00, '41200000-0000-4000-8000-000000000001');

-- The fixture is only evidence if the relationship it describes really is active, so that is
-- asserted rather than assumed. If this ever fails, the rest of the file proves nothing.
select is(
  (select count(*)::integer from public.receivable_items
   where unit_id = '41230000-0000-4000-8000-000000000001'),
  1,
  'the unit really carries a receivable, so an empty read below means denial and not emptiness'
);

select is(
  (select count(*)::integer
   from public.unit_occupancies uo
   join public.people p on p.id = uo.person_id
   where uo.unit_id = '41230000-0000-4000-8000-000000000001'
     and uo.occupancy_type = 'authorized_occupant'
     and uo.starts_at <= current_date
     and (uo.ends_at is null or uo.ends_at >= current_date)
     and p.auth_user_id = '41200000-0000-4000-8000-000000000001'
     and p.status = 'active'),
  1,
  'the fixture really is an active authorized occupancy bound to an authenticated user'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '41200000-0000-4000-8000-000000000001', 'role', 'authenticated')::text,
  true
);

-- The vector itself.
select ok(
  not public.can_read_financial_unit('41230000-0000-4000-8000-000000000001'),
  'an authorized occupant cannot read the financial unit'
);

-- Every consumer, because closing the helper is only worth anything if what it gates closes too.
-- These are read paths, so an empty result is the correct denial: RLS filters rows rather than
-- raising, and asserting zero rows is what proves the filter applied.
select is(
  (select count(*)::integer from public.receivable_items
   where unit_id = '41230000-0000-4000-8000-000000000001'),
  0,
  'receivable items stay invisible'
);
select is(
  (select count(*)::integer from public.receivable_ledger_entries
   where unit_id = '41230000-0000-4000-8000-000000000001'),
  0,
  'ledger entries stay invisible'
);
select is(
  (select count(*)::integer from public.late_fee_charges
   where unit_id = '41230000-0000-4000-8000-000000000001'),
  0,
  'late fee charges stay invisible'
);
select is(
  (select count(*)::integer from public.solvency_certificates
   where unit_id = '41230000-0000-4000-8000-000000000001'),
  0,
  'solvency certificates stay invisible'
);

-- The reporting functions gate on the same helper, so each must refuse rather than answer. They
-- raise or return nothing; either way the occupant learns no balance.
select throws_ok(
  $$select public.get_unit_statement('41230000-0000-4000-8000-000000000001')$$,
  null,
  null,
  'the unit statement refuses an authorized occupant'
);
select throws_ok(
  $$select public.get_unit_account_statement('41230000-0000-4000-8000-000000000001')$$,
  null,
  null,
  'the account statement refuses an authorized occupant'
);
select throws_ok(
  $$select public.evaluate_unit_solvency('41230000-0000-4000-8000-000000000001')$$,
  null,
  null,
  'solvency evaluation refuses an authorized occupant'
);

-- The condominium-wide aggregates must not leak either, by any route.
select is(
  (select count(*)::integer from public.get_receivables_summary('41220000-0000-4000-8000-000000000001')),
  0,
  'the receivables summary returns nothing to an authorized occupant'
);
select is(
  (select count(*)::integer from public.get_receivables_aging('41220000-0000-4000-8000-000000000001')),
  0,
  'the receivables aging returns nothing to an authorized occupant'
);

reset role;
select * from finish();
rollback;
