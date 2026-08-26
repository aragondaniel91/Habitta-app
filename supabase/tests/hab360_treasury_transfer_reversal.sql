begin;
select plan(18);

select has_function(
  'public',
  'reverse_treasury_transfer',
  array['uuid','uuid','text'],
  'dedicated treasury transfer reversal exists'
);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000036201', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab360x-admin@test.local', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000036202', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab360x-board@test.local', 'x', now(), now());

insert into public.organizations (id, name, created_by)
values ('36200000-0000-4000-8000-000000000001', 'HAB 360X Org', '00000000-0000-0000-0000-000000036201');

insert into public.condominiums (id, organization_id, name, created_by)
values ('36210000-0000-4000-8000-000000000001', '36200000-0000-4000-8000-000000000001', 'HAB 360X Condo', '00000000-0000-0000-0000-000000036201');

insert into public.organization_memberships (organization_id, user_id, role)
values ('36200000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000036201', 'organization_owner');

insert into public.condominium_memberships (condominium_id, user_id, role)
values
  ('36210000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000036201', 'condominium_admin'),
  ('36210000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000036202', 'board_member');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000036201', true);

select lives_ok(
  $$select public.create_treasury_account('36210000-0000-4000-8000-000000000001','Origen HAB 360X','bank','USD','Banco A','0102-0001')$$,
  'source account created'
);
select lives_ok(
  $$select public.create_treasury_account('36210000-0000-4000-8000-000000000001','Destino HAB 360X','bank','USD','Banco B','0102-0002')$$,
  'destination account created'
);
select lives_ok(
  $$select public.record_treasury_movement('36210000-0000-4000-8000-000000000001',(select id from public.treasury_accounts where name='Origen HAB 360X'),'credit','deposit',500.00,current_date,'Fondeo inicial',null,'manual',null,'hab360x-seed-1')$$,
  'the source account is funded'
);
select lives_ok(
  $$select public.create_treasury_transfer('36210000-0000-4000-8000-000000000001',(select id from public.treasury_accounts where name='Origen HAB 360X'),(select id from public.treasury_accounts where name='Destino HAB 360X'),200.00,current_date,'Traslado a banco B',null,'hab360x-transfer-1')$$,
  'the transfer moves money between both accounts'
);

-- The model refuses per-leg reversal and points at this flow; prove both halves of that contract.
select throws_ok(
  $$select public.reverse_treasury_movement('36210000-0000-4000-8000-000000000001',(select id from public.treasury_movements where movement_kind='transfer_out'),'Intento suelto','hab360x-bad-reversal')$$,
  'P0001',
  'movement requires a dedicated reversal flow',
  'a single transfer leg still cannot be reversed on its own'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000036202', true);
select throws_ok(
  $$select public.reverse_treasury_transfer('36210000-0000-4000-8000-000000000001',(select id from public.treasury_transfers where idempotency_key='hab360x-transfer-1'),'Intento board')$$,
  'P0001',
  'treasury management denied',
  'a board member cannot reverse a transfer'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000036201', true);

select throws_ok(
  $$select public.reverse_treasury_transfer('36210000-0000-4000-8000-000000000001',(select id from public.treasury_transfers where idempotency_key='hab360x-transfer-1'),' ')$$,
  'P0001',
  'invalid treasury reversal',
  'a reversal still requires a reason'
);

select is(
  (select coalesce(sum(case direction when 'credit' then amount else -amount end),0)
     from public.treasury_movements where account_id=(select id from public.treasury_accounts where name='Destino HAB 360X')),
  200.00::numeric,
  'the destination holds the transferred money before the reversal'
);

select lives_ok(
  $$select public.reverse_treasury_transfer('36210000-0000-4000-8000-000000000001',(select id from public.treasury_transfers where idempotency_key='hab360x-transfer-1'),'Cuenta destino equivocada')$$,
  'the administrator reverses the whole transfer'
);
select is(
  (select count(*) from public.treasury_movements where movement_kind='reversal' and source_type='reversal'),
  2::bigint,
  'both legs are compensated, never just one'
);
select is(
  (select coalesce(sum(case direction when 'credit' then amount else -amount end),0)
     from public.treasury_movements where account_id=(select id from public.treasury_accounts where name='Destino HAB 360X')),
  0.00::numeric,
  'the destination is returned to its previous balance'
);
select is(
  (select coalesce(sum(case direction when 'credit' then amount else -amount end),0)
     from public.treasury_movements where account_id=(select id from public.treasury_accounts where name='Origen HAB 360X')),
  500.00::numeric,
  'the source recovers the money it sent'
);
select is(
  (select count(*) from public.treasury_transfers where idempotency_key='hab360x-transfer-1'),
  1::bigint,
  'the original transfer record is preserved, never rewritten or deleted'
);
select is(
  (select amount from public.treasury_transfers where idempotency_key='hab360x-transfer-1'),
  200.00::numeric,
  'the original transfer keeps its published amount'
);
select is(
  (select count(*) from public.treasury_events where entity_type='transfer' and event_type='movement_reversed'),
  1::bigint,
  'the reversal is recorded in the treasury audit trail'
);

select lives_ok(
  $$select public.reverse_treasury_transfer('36210000-0000-4000-8000-000000000001',(select id from public.treasury_transfers where idempotency_key='hab360x-transfer-1'),'Segundo intento')$$,
  'asking to reverse an already reversed transfer is harmless'
);
select is(
  (select count(*) from public.treasury_movements where movement_kind='reversal'),
  2::bigint,
  'a second request never doubles the compensation'
);

select * from finish();
rollback;
